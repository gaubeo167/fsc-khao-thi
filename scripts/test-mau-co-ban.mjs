#!/usr/bin/env node
/**
 * Test hồi quy cho FILE MẪU "soạn đề cơ bản".
 *
 * Chạy:  node scripts/test-mau-co-ban.mjs
 *
 * Đây là test đi TRỌN vòng, không phải test chuỗi ký tự:
 *
 *     buildBasicTemplate()  →  .docx thật  →  mammoth  →  htmlToMarkedText
 *                           →  parseGeneric  →  draftFromGeneric
 *
 * Vì sao phải đi trọn vòng: file mẫu là thứ DUY NHẤT giáo viên đọc để biết
 * viết đề thế nào. Nó mà lệch với parser thì người dùng làm đúng hướng dẫn
 * vẫn ra sai, và họ không có cách nào biết bên nào sai. Ràng hai đầu vào
 * cùng một test là cách duy nhất giữ chúng không trôi ra xa nhau.
 *
 * Đường đọc ở đây dựng lại đúng các bước của `/api/import/parse-questions`
 * (mammoth + styleMap giữ gạch chân → htmlToMarkedText → parseGeneric).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fsc-mau-"));
function bundle(src, name) {
  const out = join(dir, name);
  execFileSync(
    "npx",
    [
      "esbuild",
      src,
      "--bundle",
      "--format=esm",
      "--platform=node",
      "--alias:@=./src",
      "--external:mammoth",
      `--outfile=${out}`,
    ],
    { cwd: "apps/web", stdio: "pipe" },
  );
  return out;
}

const { buildBasicTemplate } = await import(
  bundle("src/features/question-bank/lib/template-co-ban.ts", "tpl.mjs")
);
// `htmlToMarkedText` mới là bộ chuyển mà đường đề tự soạn dùng: nó giữ vùng
// gạch chân thành ký hiệu ⟦U⟧…⟦/U⟧. `htmlToFscText` gỡ sạch thẻ nên dùng nhầm
// là mất hết đáp án.
const { htmlToMarkedText } = await import(
  bundle("src/features/question-bank/lib/parse-exam-bank.ts", "html.mjs")
);
const { parseGeneric } = await import(
  bundle("src/features/question-bank/lib/parse-generic.ts", "gen.mjs")
);
const { draftFromGeneric } = await import(
  bundle("src/features/question-bank/lib/import-draft.ts", "draft.mjs")
);
const { Packer } = await import("docx");
const mammoth = (await import("mammoth")).default;

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/* ── Dựng file mẫu rồi đọc ngược ─────────────────────────────────────── */
const buf = await Packer.toBuffer(buildBasicTemplate());
const { value: html } = await mammoth.convertToHtml(
  { buffer: buf },
  {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "u => u", // gạch chân = đáp án đúng
    ],
  },
);
const text = htmlToMarkedText(html);
const parsed = parseGeneric(text);
const drafts = parsed.questions.map((q, i) => draftFromGeneric(q, i));

/* ── Font: yêu cầu rõ ràng của người dùng, phải khoá lại ─────────────── */
{
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  const styles = await zip.file("word/styles.xml").async("string");
  const docXml = await zip.file("word/document.xml").async("string");
  check(
    "font mặc định của tài liệu là Times New Roman",
    /w:ascii="Times New Roman"/.test(styles),
  );
  check(
    "không còn font nào khác lọt vào nội dung",
    !/w:ascii="(?!Times New Roman)[^"]+"/.test(docXml),
    (docXml.match(/w:ascii="[^"]+"/g) ?? []).slice(0, 5).join(" "),
  );
  check("ghi chú mã câu / độ khó nằm trong BẢNG", /<w:tbl>/.test(docXml));
  check(
    "có đủ hai bảng (mức độ + dạng câu)",
    (docXml.match(/<w:tbl>/g) ?? []).length >= 2,
    String((docXml.match(/<w:tbl>/g) ?? []).length),
  );
}

/* ── Phần hướng dẫn KHÔNG được biến thành câu hỏi ────────────────────── */
check(
  "đọc ra đúng 11 câu ví dụ, phần hướng dẫn bị bỏ qua",
  drafts.length === 11,
  `${drafts.length} câu: ${drafts.map((d) => d.type).join(", ")}`,
);

/* ── Mỗi ví dụ ra đúng dạng của nó ───────────────────────────────────── */
const MONG_DOI = [
  ["TN", "mcq-single", "easy"],
  ["TNN", "mcq-multi", "medium"],
  ["DS", "true-false", "easy"],
  ["DSN", "multi-tf", "medium"],
  ["TLN", "short-answer", "hard"],
  ["DK", "fill-blank", "easy"],
  ["GC", "matching", "medium"],
  ["SX", "ordering", "hard"],
  ["KT", "drag-drop", "medium"],
  ["GCH", "underline", "medium"],
  ["TL", "essay", "hard"],
];
MONG_DOI.forEach(([ma, type, muc], i) => {
  const d = drafts[i];
  check(`ví dụ ${i + 1} [${ma}] → ${type}`, d?.type === type, String(d?.type));
  check(`ví dụ ${i + 1} [${ma}] lấy đúng mức độ`, d?.difficulty === muc, String(d?.difficulty));
});

/* ── Nhãn phải được GỠ khỏi đề bài ───────────────────────────────────── */
check(
  "không câu nào còn sót nhãn [NB]/[TN]… trong đề bài",
  drafts.every((d) => !/\[(NB|TH|VD|TN|TNN|DS|DSN|TLN|DK|GC|SX|KT|GCH|TL)\]/.test(d.content)),
  drafts.find((d) => /\[[A-Z]{2,3}\]/.test(d.content))?.content,
);

/* ── Đáp án của từng dạng đọc được đúng ──────────────────────────────── */
{
  const tn = drafts[0];
  check("TN: 4 phương án", tn.options.length === 4, String(tn.options.length));
  check(
    "TN: đúng 1 đáp án đúng, là phương án A",
    tn.options.filter((o) => o.isCorrect).length === 1 && tn.options[0].isCorrect,
  );

  const tnn = drafts[1];
  check(
    "TNN: 2 đáp án đúng",
    tnn.options.filter((o) => o.isCorrect).length === 2,
    String(tnn.options.filter((o) => o.isCorrect).length),
  );

  check("DS: đáp án Đúng", drafts[2].correctAnswer === true, String(drafts[2].correctAnswer));

  const dsn = drafts[3];
  check("DSN: 4 ý", dsn.subQuestions.length === 4, String(dsn.subQuestions.length));
  check(
    "DSN: đúng/sai từng ý theo gạch chân",
    dsn.subQuestions.map((s) => s.correctAnswer).join(",") === "true,false,true,false",
    dsn.subQuestions.map((s) => s.correctAnswer).join(","),
  );

  check("TLN: đáp án 42", drafts[4].acceptedAnswers[0] === "42", JSON.stringify(drafts[4].acceptedAnswers));

  const dk = drafts[5];
  check("DK: 2 ô trống", dk.blanks.length === 2, String(dk.blanks.length));
  check(
    "DK: ô 1 nhận 3 cách viết",
    dk.blanks[0]?.acceptedAnswers.join("|") === "Hà Nội|Hanoi|HN",
    JSON.stringify(dk.blanks[0]),
  );
  // Dấu ___ phải thành THẺ có đánh số: trình soạn thảo đếm ô trống bằng thẻ,
  // để nguyên gạch dưới thì nó đếm ra 0 ô và cắt sạch đáp án vừa đọc được.
  check(
    "DK: mỗi ___ thành một thẻ ô trống có số",
    /\[blank:1\]/.test(dk.content) && /\[blank:2\]/.test(dk.content),
    dk.content,
  );
  check("DK: không còn gạch dưới sót lại", !/_{2,}/.test(dk.content), dk.content);

  const gc = drafts[6];
  check("GC: 4 cặp", gc.pairs.length === 4, String(gc.pairs.length));
  check(
    "GC: cặp đầu đúng vế",
    gc.pairs[0]?.left === "Việt Nam" && gc.pairs[0]?.right === "Hà Nội",
    JSON.stringify(gc.pairs[0]),
  );

  const sx = drafts[7];
  check("SX: 4 mục", sx.items.length === 4, String(sx.items.length));
  check("SX: giữ đúng thứ tự", sx.items.join(",") === "-5,-2,0,7", sx.items.join(","));

  const kt = drafts[8];
  check("KT: 2 vùng thả", kt.zones.length === 2, JSON.stringify(kt.zones));
  check("KT: 2 mảnh nhiễu", kt.distractors.length === 2, JSON.stringify(kt.distractors));
  check(
    "KT: mỗi ___ thành một thẻ vùng thả có số",
    /\[zone:1\]/.test(kt.content) && /\[zone:2\]/.test(kt.content),
    kt.content,
  );

  const gch = drafts[9];
  check(
    "GCH: gạch chân trong Word thành mốc [u:…]",
    /\[u:mèo\]/.test(gch.content) && /\[u:ghế\]/.test(gch.content),
    gch.content,
  );

  check("TL: không đòi đáp án máy", drafts[10].acceptedAnswers.length === 0);
}

/* ── Câu nào cũng phải sẵn sàng gửi duyệt, không cần sửa tay ─────────── */
{
  const { validateDraft } = await import(join(dir, "draft.mjs"));
  const chuaDat = drafts
    .map((d, i) => [i + 1, validateDraft(d, { requireChuyenDe: false })])
    .filter(([, issues]) => issues.length > 0);
  check(
    "cả 11 ví dụ đều hợp lệ ngay, không phải bổ sung gì",
    chuaDat.length === 0,
    chuaDat.map(([i, iss]) => `câu ${i}: ${iss.map((x) => x.message).join("; ")}`).join(" · "),
  );
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
