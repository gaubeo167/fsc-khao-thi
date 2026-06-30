# Converter: Câu hỏi Firestore → Moodle XML

Spec để viết script chuyển **ngân hàng câu hỏi** (collection `questions` của Firestore) sang **Moodle XML** rồi import vào question bank của Moodle.

> Đầu vào: thư mục `firestore-export/questions.json` (do `scripts/export-firestore.mjs` của repo cũ tạo). Đầu ra: nhiều file `.xml` (Moodle XML) theo môn/khối để import.

---

## 1. Khung Moodle XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <!-- category đích trong question bank -->
  <question type="category">
    <category><text>$course$/top/Toán/Khối 7/Đại số</text></category>
  </question>

  <question type="multichoice">
    <name><text>Q-0002</text></name>
    <questiontext format="html"><text><![CDATA[Đâu là các số nguyên tố?]]></text></questiontext>
    <single>false</single>            <!-- false = nhiều đáp án (mcq-multi) -->
    <shuffleanswers>true</shuffleanswers>
    <answer fraction="50"><text>2</text></answer>
    <answer fraction="50"><text>13</text></answer>
    <answer fraction="0"><text>9</text></answer>
    <answer fraction="0"><text>21</text></answer>
  </question>
</quiz>
```

- `<question type="category">` đặt category đích; các `<question>` sau thuộc category đó cho tới khi gặp category mới.
- `fraction` = % điểm của đáp án (đúng cộng, sai có thể trừ). Với nhiều đáp án đúng → chia đều dương cho đúng, 0/âm cho sai.
- `format="html"` + CDATA cho nội dung có HTML/công thức. Công thức toán: giữ dạng `\( ... \)` hoặc `$$...$$` để MathJax render (chuyển từ LaTeX hiện có).

---

## 2. Ánh xạ từng loại (Firestore `type` → Moodle qtype + cấu trúc)

| FSC type | Moodle `type=` | Map dữ liệu chính |
|---|---|---|
| mcq-single | `multichoice`, `<single>true` | `options[]`→`<answer>`, isCorrect→fraction 100/0 |
| mcq-multi | `multichoice`, `<single>false` | đúng→fraction chia đều (vd 2 đúng→50/50), sai→0 |
| true-false | `truefalse` | `correctAnswer`→`<answer fraction=100>true/false` |
| multi-tf | `mtf` (qtype_mtf) | `subQuestions[]`→rows (statement + đúng/sai) |
| fill-blank | `cloze` (multianswer) | chèn `{1:SHORTANSWER:=đáp án1~=đáp án2}` vào vị trí mỗi ô |
| matching | `matching` | `pairs[]`→`<subquestion>`(left)+`<answer>`(right); distractors→subquestion không có text trái |
| ordering | `ordering` (qtype_ordering) | `items[]` theo thứ tự đúng |
| drag-drop | `ddwtos` | `zones[]` correctContent + `distractors[]` |
| underline | 🛠️ `qtype_underline` (custom) | đánh dấu `[u:...]` trong content; tạm thời map `ddwtos` |
| short-answer | `shortanswer` | `acceptedAnswers[]`→nhiều `<answer fraction=100>`; `caseSensitive`→`<usecase>` |
| essay | `essay` | rubric tạo riêng bằng Advanced grading sau import; `wordMin/Max` ghi chú |
| ai-generated | — | bỏ qua / xử lý như loại đã sinh tương ứng |

**Lưu ý chung:** giữ `id` gốc (Q-0001) vào `<name>` để truy vết; ánh xạ `subjectId/gradeId/tocNodeId` → đường dẫn category; `difficulty` → **tag** (`<tags><tag><text>dễ</text></tag></tags>`) để quiz random theo độ khó; ảnh base64/URL → `<file>` (base64) hoặc giữ URL trong HTML.

---

## 3. Skeleton script (Node)

```js
// convert-questions.mjs — đọc firestore-export/questions.json → Moodle XML
import { readFileSync, writeFileSync } from "node:fs";

const questions = JSON.parse(readFileSync("firestore-export/questions.json", "utf8"));
// (tuỳ format export: có thể là { id, data } rows)

const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const cdata = (s) => `<![CDATA[${s ?? ""}]]>`;

function categoryHeader(path) {
  return `  <question type="category"><category><text>$course$/top/${esc(path)}</text></category></question>\n`;
}

function mcq(q, single) {
  const opts = q.options.map(o => {
    const correctCount = q.options.filter(x=>x.isCorrect).length || 1;
    const frac = o.isCorrect ? Math.round((100/correctCount)*100000)/100000 : 0;
    return `    <answer fraction="${frac}" format="html"><text>${cdata(o.content)}</text></answer>`;
  }).join("\n");
  return `  <question type="multichoice">
    <name><text>${esc(q.id)}</text></name>
    <questiontext format="html"><text>${cdata(q.content)}</text></questiontext>
    <single>${single}</single><shuffleanswers>true</shuffleanswers>
    ${tags(q)}
${opts}
  </question>\n`;
}

function tags(q){ return `<tags><tag><text>${esc(q.difficulty)}</text></tag></tags>`; }

function convert(q) {
  switch (q.type) {
    case "mcq-single": return mcq(q, "true");
    case "mcq-multi":  return mcq(q, "false");
    case "true-false": return trueFalse(q);   // TODO
    case "matching":   return matching(q);    // TODO
    case "short-answer": return shortAnswer(q); // TODO
    case "fill-blank": return cloze(q);        // TODO
    case "ordering":   return ordering(q);     // TODO
    case "drag-drop":  return ddwtos(q);       // TODO
    case "multi-tf":   return mtf(q);          // TODO (qtype_mtf)
    case "essay":      return essay(q);        // TODO
    case "underline":  return ddwtos(q);       // tạm map; hoặc qtype_underline
    default: return ""; // ai-generated…
  }
}

// Nhóm theo subjectId+gradeId → mỗi file 1 môn/khối
// ... build path từ subject/grade/toc, ghi <quiz>…</quiz>
```

> Hoàn thiện từng hàm `TODO` theo mục 2. Sau khi có XML: Moodle → Question bank → Import → "Moodle XML format" → chọn category đích.

---

## 4. Kiểm thử & đối chiếu
1. Import 1 file mẫu (vd Toán/Khối 7) → kiểm tra render công thức, đáp án đúng, độ khó (tag).
2. Tạo 1 Quiz "Random questions" rút theo tag độ khó → xác nhận khớp ma trận gói đề cũ.
3. Đối chiếu **số lượng câu** từng category với Firestore trước khi import đại trà.

> Các loại cần plugin (`mtf`, `ordering`) phải cài plugin TRƯỚC khi import file chứa loại đó.
