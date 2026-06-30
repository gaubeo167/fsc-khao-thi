#!/usr/bin/env node
/**
 * convert-questions.mjs — Chuyển ngân hàng câu hỏi Firestore → Moodle XML.
 *
 * Đầu vào : <EXPORT_DIR>/{questions,subjects,grades,toc_nodes}.json
 *           (do scripts/export-firestore.mjs của repo cũ tạo; mỗi file là
 *            mảng [{ id, data }]). Chỉ questions.json là bắt buộc.
 * Đầu ra  : <OUT_DIR>/<Môn>.xml  (mỗi môn 1 file, có category theo khối/chủ đề)
 *           + <OUT_DIR>/_manifest.json (thống kê + danh sách câu cần xem tay)
 *
 * Chạy:  node convert-questions.mjs [EXPORT_DIR] [OUT_DIR]
 *   mặc định EXPORT_DIR=./firestore-export  OUT_DIR=./moodle-xml
 *
 * Ánh xạ loại (xem handoff/05-QUESTION-CONVERTER.md):
 *   mcq-single/multi → multichoice | true-false → truefalse |
 *   short-answer → shortanswer | matching → matching | essay → essay |
 *   ordering → ordering (CẦN qtype_ordering) | drag-drop → ddwtos |
 *   fill-blank → cloze | multi-tf → cloze (MC Đúng/Sai) |
 *   underline, ai-generated → BỎ QUA (ghi vào _manifest để xử lý tay/custom).
 *
 * Lưu ý: chỉ qtype_ordering là plugin contrib bắt buộc; còn lại dùng core.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXPORT_DIR = process.argv[2] ?? "./firestore-export";
const OUT_DIR = process.argv[3] ?? "./moodle-xml";
const ONLY_APPROVED = process.env.ONLY_APPROVED === "1"; // lọc chỉ câu đã duyệt

// ───────── nạp dữ liệu ─────────
function loadRows(name) {
  const p = join(EXPORT_DIR, `${name}.json`);
  if (!existsSync(p)) return [];
  const json = JSON.parse(readFileSync(p, "utf8"));
  const arr = Array.isArray(json) ? json : json.rows ?? [];
  return arr.map((r) =>
    r && typeof r === "object" && "data" in r
      ? { id: r.id ?? r.data?.id, ...r.data }
      : r,
  );
}
function nameMap(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.id, r.name ?? r.id);
  return m;
}

const questions = loadRows("questions");
const subjMap = nameMap(loadRows("subjects"));
const gradeMap = nameMap(loadRows("grades"));
const tocMap = nameMap(loadRows("toc_nodes"));

if (questions.length === 0) {
  console.error(`✗ Không thấy câu hỏi ở ${join(EXPORT_DIR, "questions.json")}`);
  process.exit(1);
}

// ───────── tiện ích ─────────
const xmlEsc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const cdata = (s) => `<![CDATA[${String(s ?? "")}]]>`;

/** $$..$$ → \[..\] ; $..$ → \(..\)  (cho MathJax/TeX filter của Moodle) */
function mathFix(s) {
  return String(s ?? "")
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, x) => `\\[${x}\\]`)
    .replace(/(?<!\\)\$([^$\n]+?)\$/g, (_, x) => `\\(${x}\\)`);
}
/** ![alt](url) → <img>; xuống dòng → <br> nhẹ. */
function mdToHtml(s) {
  return mathFix(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => `<img src="${url}" alt="${xmlEsc(alt)}">`)
    .replace(/\r?\n/g, "<br>");
}
/** Nội dung HTML cho <text> trong CDATA. */
const html = (s) => cdata(mdToHtml(s));

/** fraction chuẩn Moodle cho 100/n (đúng định dạng list điểm của Moodle). */
function fracStr(n) {
  const v = 100 / n;
  // Moodle dùng tối đa 5 chữ số thập phân cho các phân số này.
  return (Math.round(v * 100000) / 100000).toString();
}
function negFracStr(n) {
  return "-" + fracStr(n);
}
/** Escape ký tự đặc biệt của Cloze trong đáp án. */
const clozeEsc = (s) => String(s ?? "").replace(/[}~#=]/g, (c) => `\\${c}`);

function tagsBlock(q) {
  const tags = [];
  if (q.difficulty) tags.push(q.difficulty); // dễ/TB/khó để quiz random theo độ khó
  if (Array.isArray(q.tags)) tags.push(...q.tags);
  if (tags.length === 0) return "";
  return `    <tags>${tags.map((t) => `<tag><text>${xmlEsc(t)}</text></tag>`).join("")}</tags>\n`;
}
function head(q, type) {
  const gf = q.explanation
    ? `    <generalfeedback format="html"><text>${html(q.explanation)}</text></generalfeedback>\n`
    : "";
  return (
    `  <question type="${type}">\n` +
    `    <name><text>${xmlEsc(q.id)}</text></name>\n` +
    `    <questiontext format="html"><text>${html(q.content)}</text></questiontext>\n` +
    gf +
    `    <defaultgrade>1</defaultgrade>\n` +
    tagsBlock(q)
  );
}
const tail = () => `  </question>\n`;

// ───────── builder theo loại ─────────
function multichoice(q, single) {
  const nCorrect = q.options.filter((o) => o.isCorrect).length || 1;
  const ans = q.options
    .map((o) => {
      const f = o.isCorrect ? fracStr(nCorrect) : single ? "0" : negFracStr(nCorrect);
      return `    <answer fraction="${f}" format="html"><text>${html(o.content)}</text><feedback format="html"><text></text></feedback></answer>`;
    })
    .join("\n");
  return (
    head(q, "multichoice") +
    `    <single>${single ? "true" : "false"}</single>\n` +
    `    <shuffleanswers>true</shuffleanswers>\n    <answernumbering>abc</answernumbering>\n` +
    ans +
    "\n" +
    tail()
  );
}
function truefalse(q) {
  const t = q.correctAnswer === true;
  return (
    head(q, "truefalse") +
    `    <answer fraction="${t ? "100" : "0"}"><text>true</text><feedback format="html"><text></text></feedback></answer>\n` +
    `    <answer fraction="${t ? "0" : "100"}"><text>false</text><feedback format="html"><text></text></feedback></answer>\n` +
    tail()
  );
}
function shortanswer(q) {
  const ans = (q.acceptedAnswers ?? [])
    .map((a) => `    <answer fraction="100" format="moodle_auto_format"><text>${xmlEsc(a)}</text><feedback format="html"><text></text></feedback></answer>`)
    .join("\n");
  return head(q, "shortanswer") + `    <usecase>${q.caseSensitive ? 1 : 0}</usecase>\n` + ans + "\n" + tail();
}
function matching(q) {
  const subs = (q.pairs ?? [])
    .map((p) => `    <subquestion format="html"><text>${html(p.left)}</text><answer><text>${xmlEsc(p.right)}</text></answer></subquestion>`)
    .join("\n");
  // distractor = subquestion có text trái rỗng, chỉ có answer (cột phải)
  const dist = (q.distractors ?? [])
    .map((d) => `    <subquestion format="html"><text></text><answer><text>${xmlEsc(d.right)}</text></answer></subquestion>`)
    .join("\n");
  return (
    head(q, "matching") +
    `    <shuffleanswers>true</shuffleanswers>\n` +
    subs + (dist ? "\n" + dist : "") + "\n" + tail()
  );
}
function essay(q) {
  const note =
    `Rubric (thiết lập Advanced grading sau khi import): ` +
    (q.rubric ?? []).map((r) => `${r.label}=${r.points}đ`).join("; ") +
    (q.wordMin || q.wordMax ? ` | Số từ: ${q.wordMin ?? 0}–${q.wordMax ?? "∞"}` : "");
  return (
    head(q, "essay") +
    `    <responseformat>editor</responseformat>\n    <responserequired>1</responserequired>\n` +
    `    <responsefieldlines>15</responsefieldlines>\n    <attachments>0</attachments>\n` +
    `    <graderinfo format="html"><text>${html(note)}</text></graderinfo>\n` +
    `    <responsetemplate format="html"><text></text></responsetemplate>\n` +
    tail()
  );
}
function ordering(q) {
  const items = (q.items ?? [])
    .map((it) => `    <answer fraction="0" format="html"><text>${html(it.content)}</text></answer>`)
    .join("\n");
  return (
    head(q, "ordering") +
    `    <selecttype>0</selecttype>\n    <selectcount>0</selectcount>\n` +
    `    <layouttype>1</layouttype>\n    <gradingtype>0</gradingtype>\n` +
    items + "\n" + tail()
  );
}
function ddwtos(q) {
  // [zone:N] trong content → [[N]] ; dragbox theo thứ tự zone rồi distractor.
  let content = String(q.content ?? "").replace(/\[zone:(\d+)\]/g, (_, n) => `[[${n}]]`);
  const qq = { ...q, content };
  const boxes = [];
  (q.zones ?? []).forEach((z) => boxes.push(`    <dragbox><text>${xmlEsc(z.correctContent)}</text><group>1</group></dragbox>`));
  (q.distractors ?? []).forEach((d) => boxes.push(`    <dragbox><text>${xmlEsc(d.content)}</text><group>1</group></dragbox>`));
  return (
    head(qq, "ddwtos") +
    `    <shuffleanswers>1</shuffleanswers>\n` +
    boxes.join("\n") + "\n" + tail()
  );
}
function clozeFillBlank(q) {
  // Thay [blank:N] bằng {1:SHORTANSWER:=a~=b}; nếu không có marker → nối ở cuối.
  const tokens = (q.blanks ?? []).map((b) => {
    const opts = (b.acceptedAnswers ?? []).map((a) => `=${clozeEsc(a)}`).join("~");
    return `{1:SHORTANSWER:${opts}}`;
  });
  let content = String(q.content ?? "");
  let i = 0;
  content = content.replace(/\[blank:\d+\]/g, () => tokens[i++] ?? "{1:SHORTANSWER:=}");
  if (i === 0 && tokens.length) content += " " + tokens.join(" ");
  return head({ ...q, content }, "cloze") + tail();
}
function clozeMultiTf(q) {
  // Stem chung + mỗi mệnh đề kèm dropdown Đúng/Sai (core cloze, không cần qtype_mtf).
  let content = String(q.content ?? "");
  (q.subQuestions ?? []).forEach((s, idx) => {
    const mc = s.correctAnswer ? `{1:MULTICHOICE:=Đúng~Sai}` : `{1:MULTICHOICE:Đúng~=Sai}`;
    content += `<br>${idx + 1}. ${mdToHtml(s.statement)} ${mc}`;
  });
  return head({ ...q, content }, "cloze") + tail();
}

const SKIP = new Set(["underline", "ai-generated"]);
function convert(q) {
  switch (q.type) {
    case "mcq-single": return multichoice(q, true);
    case "mcq-multi": return multichoice(q, false);
    case "true-false": return truefalse(q);
    case "short-answer": return shortanswer(q);
    case "matching": return matching(q);
    case "essay": return essay(q);
    case "ordering": return ordering(q);
    case "drag-drop": return ddwtos(q);
    case "fill-blank": return clozeFillBlank(q);
    case "multi-tf": return clozeMultiTf(q);
    default: return null; // underline, ai-generated, loại lạ
  }
}

// ───────── nhóm theo Môn → category(Khối/Chủ đề) ─────────
const categoryPath = (q) => {
  const subj = subjMap.get(q.subjectId) ?? q.subjectId ?? "Khác";
  const grade = gradeMap.get(q.gradeId) ?? (q.gradeId ? q.gradeId : "Chung");
  const toc = q.tocNodeId ? tocMap.get(q.tocNodeId) : null;
  return { subj, sub: `${grade}${toc ? "/" + toc : ""}` };
};
const sanitizeFile = (s) => String(s).replace(/[\/\\:*?"<>|]+/g, "_").trim();

mkdirSync(OUT_DIR, { recursive: true });
const bySubject = new Map(); // subj -> Map(sub -> xml[])
const manifest = { total: questions.length, converted: 0, byType: {}, skipped: [] };

for (const q of questions) {
  if (!q || !q.type) continue;
  if (ONLY_APPROVED && q.status !== "approved") {
    manifest.skipped.push({ id: q.id, type: q.type, reason: "không-duyệt" });
    continue;
  }
  manifest.byType[q.type] = (manifest.byType[q.type] ?? 0) + 1;
  const xml = convert(q);
  if (!xml) {
    manifest.skipped.push({
      id: q.id,
      type: q.type,
      reason: SKIP.has(q.type) ? "cần plugin/xử-lý-tay (underline/ai-generated)" : "loại không hỗ trợ",
    });
    continue;
  }
  const { subj, sub } = categoryPath(q);
  if (!bySubject.has(subj)) bySubject.set(subj, new Map());
  const subMap = bySubject.get(subj);
  if (!subMap.has(sub)) subMap.set(sub, []);
  subMap.get(sub).push(xml);
  manifest.converted++;
}

for (const [subj, subMap] of bySubject) {
  let body = `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n`;
  for (const [sub, xmls] of subMap) {
    const path = `$course$/top/${xmlEsc(subj)}/${xmlEsc(sub)}`;
    body += `  <question type="category"><category><text>${path}</text></category></question>\n`;
    body += xmls.join("");
  }
  body += `</quiz>\n`;
  const file = join(OUT_DIR, `${sanitizeFile(subj)}.xml`);
  writeFileSync(file, body);
  console.log(`✓ ${file}`);
}

writeFileSync(join(OUT_DIR, "_manifest.json"), JSON.stringify(manifest, null, 2));
console.log("\n=== Tổng kết ===");
console.log(`Tổng câu        : ${manifest.total}`);
console.log(`Đã chuyển       : ${manifest.converted}`);
console.log(`Theo loại       :`, manifest.byType);
console.log(`Bỏ qua/cần tay  : ${manifest.skipped.length} (xem _manifest.json)`);
console.log(`\nImport: Moodle → Question bank → Import → "Moodle XML format" → chọn category.`);
console.log(`Nhớ cài qtype_ordering TRƯỚC khi import file có câu sắp xếp.`);
