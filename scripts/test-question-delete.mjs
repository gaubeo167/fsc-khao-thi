#!/usr/bin/env node
/**
 * Test hồi quy cho luật "câu hỏi này xoá CỨNG được không"
 * (apps/web/src/features/question-bank/lib/question-delete.ts).
 *
 * Chạy:  node scripts/test-question-delete.mjs
 *
 * Vì sao có file này: xoá cứng là thao tác DUY NHẤT trong hệ không có đường
 * lùi. Sai một nguồn tham chiếu là xoá trúng câu đang nằm trong bài tập của
 * học sinh, hoặc trong một đề đã đóng băng năm ngoái — và không ai khôi phục
 * được.
 *
 * Hai lỗi dễ mắc nhất, cả hai đều được khoá ở dưới:
 *
 *   1. Dùng lại `questionInUse` cho nút xoá. Hàm đó CỐ Ý bỏ qua đề đã lưu trữ
 *      (vì nó trả lời câu hỏi "sửa có hỏng đề đang chạy không"). Với xoá cứng
 *      thì đề đã lưu trữ là thứ PHẢI giữ.
 *   2. Coi "store chưa tải xong" là "không có tham chiếu". Hai thứ đó trông
 *      giống hệt nhau khi đọc một mảng rỗng.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "fsc-del-")), "t.mjs");
execFileSync(
  "npx",
  [
    "esbuild",
    "src/features/question-bank/lib/question-delete.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    "--alias:@=./src",
    `--outfile=${out}`,
  ],
  { cwd: "apps/web", stdio: "pipe" },
);
const { canHardDelete, splitDeletable, allHydrated } = await import(out);

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${ok || !extra ? "" : ` — ${extra}`}`);
  ok ? pass++ : fail++;
};

/** Mọi store đã tải xong. */
const READY = {
  examForms: true,
  blueprints: true,
  generated: true,
  homework: true,
  attempts: true,
  homeworkAttempts: true,
  questions: true,
};
/** Kho rỗng — không có tham chiếu nào. */
const EMPTY = {
  examForms: [],
  blueprints: [],
  generated: [],
  homework: [],
  attempts: [],
  homeworkAttempts: [],
  questions: [{ id: "Q1", ownerId: "u-me" }],
};
const src = (over = {}) => ({ ...EMPTY, ...over });
const verdict = (over = {}, hyd = READY) => canHardDelete("Q1", src(over), hyd);

/* ── 1. Câu sạch thì xoá được ──────────────────────────────────────────── */
{
  const v = verdict();
  check("câu chưa dùng ở đâu → xoá được", v.deletable === true);
  check("không có blocker nào", v.blockers.length === 0);
  check("vẫn kèm lời giải thích", v.reason.length > 20);
}

/* ── 2. Chặn theo từng nguồn ───────────────────────────────────────────── */
{
  check(
    "nằm trong đề đã đóng băng → CHẶN",
    verdict({
      examForms: [
        { id: "F1", name: "Đề GK1", variants: [{ questions: [{ originalQuestionId: "Q1" }] }] },
      ],
    }).deletable === false,
  );
  check(
    "nằm trong khung đề → CHẶN",
    verdict({
      blueprints: [{ id: "B1", name: "Khung Toán 10", topics: [{ pickedQuestionIds: ["Q1"] }] }],
    }).deletable === false,
  );
  check(
    "nằm trong mã đề đã sinh → CHẶN",
    verdict({ generated: [{ id: "G1", name: "Đề 001", questionIds: ["Q1"] }] }).deletable === false,
  );
  check(
    "nằm trong bài tập về nhà → CHẶN",
    verdict({ homework: [{ id: "H1", title: "BTVN tuần 3", questionIds: ["Q1"] }] }).deletable === false,
  );
  check(
    "nằm trong lượt thi (questionIds) → CHẶN",
    verdict({ attempts: [{ id: "A1", studentId: "HS01", questionIds: ["Q1"] }] }).deletable === false,
  );
  check(
    "nằm trong bài tập HS đã làm → CHẶN",
    verdict({ homeworkAttempts: [{ id: "HA1", studentId: "HS02", answers: { Q1: "A" } }] })
      .deletable === false,
  );
}

/* ── 3. Lượt thi CŨ: thiếu questionIds nhưng vẫn có câu trả lời ───────── */
// Bài trước thời điểm có snapshot không ghi `questionIds`. Chỉ soát trường đó
// là kết luận "không ai làm câu này" trong khi điểm của học sinh đang dựa vào nó.
{
  check(
    "lượt thi cũ: chỉ có answers → vẫn CHẶN",
    verdict({ attempts: [{ id: "A2", answers: { Q1: { value: "B" } } }] }).deletable === false,
  );
  check(
    "lượt thi: chỉ đánh dấu xem lại → vẫn CHẶN",
    verdict({ attempts: [{ id: "A3", markedForReview: ["Q1"] }] }).deletable === false,
  );
  check(
    "answers có key Q1 với giá trị undefined → vẫn CHẶN",
    verdict({ attempts: [{ id: "A4", answers: { Q1: undefined } }] }).deletable === false,
  );
}

/* ── 4. Đề ĐÃ LƯU TRỮ vẫn chặn — khác hẳn `questionInUse` ─────────────── */
// `questionInUse` chỉ tính form có lifecycle "active". Nếu ai bê nguyên luật
// đó sang nút xoá, câu nằm trong đề đã lưu trữ sẽ bị xoá và minh chứng của
// kỳ thi đã diễn ra thủng một lỗ vĩnh viễn.
{
  const v = verdict({
    examForms: [
      {
        id: "F-CU",
        name: "Đề HK1 năm ngoái",
        lifecycle: "archived",
        variants: [{ questions: [{ originalQuestionId: "Q1" }] }],
      },
    ],
  });
  check("đề đã LƯU TRỮ vẫn chặn xoá cứng", v.deletable === false);
  check("nêu đúng tên đề đang chặn", v.blockers.some((b) => /năm ngoái/.test(b.label)));
}

/* ── 5. Chuỗi phiên bản ────────────────────────────────────────────────── */
{
  const v = verdict({ questions: [{ id: "Q1" }, { id: "Q9", versionOfRootId: "Q1" }] });
  check("là gốc của một phiên bản khác → CHẶN", v.deletable === false);
  check("blocker ghi rõ là chuỗi phiên bản", v.blockers.some((b) => b.kind === "version-chain"));

  const v2 = canHardDelete(
    "Q9",
    src({ questions: [{ id: "Q1" }, { id: "Q9", versionOfRootId: "Q1" }] }),
    READY,
  );
  check("bản con cũng CHẶN (đứt chuỗi từ phía kia)", v2.deletable === false);

  check(
    "câu đứng một mình (không chuỗi) → xoá được",
    verdict({ questions: [{ id: "Q1" }, { id: "Q2" }] }).deletable === true,
  );
  check(
    "hai câu rời nhau, mỗi câu tự làm gốc → không nhầm thành cùng chuỗi",
    verdict({ questions: [{ id: "Q1" }, { id: "Q2", versionOfRootId: "Q2" }] }).deletable === true,
  );
}

/* ── 6. Store CHƯA TẢI XONG thì tuyệt đối không cho xoá ────────────────── */
// Đây là ca quan trọng nhất file này. Mảng rỗng vì chưa tải xong trông y hệt
// mảng rỗng vì không có tham chiếu.
{
  for (const key of Object.keys(READY)) {
    const hyd = { ...READY, [key]: false };
    const v = verdict({}, hyd);
    check(`chưa tải xong '${key}' → KHÔNG cho xoá`, v.deletable === false);
  }
  const v = verdict({}, { ...READY, attempts: false });
  check(
    "lý do nói rõ là chưa đối chiếu đủ, không phải 'câu đang được dùng'",
    /Chưa/.test(v.reason) && v.blockers[0].kind === "not-hydrated",
    v.reason,
  );
  check("allHydrated: đủ → true", allHydrated(READY) === true);
  check("allHydrated: thiếu một → false", allHydrated({ ...READY, homework: false }) === false);
}

/* ── 7. Không nhầm sang câu khác ───────────────────────────────────────── */
{
  check(
    "câu KHÁC nằm trong đề thì Q1 vẫn xoá được",
    verdict({
      examForms: [
        { id: "F2", name: "Đề khác", variants: [{ questions: [{ originalQuestionId: "Q2" }] }] },
      ],
    }).deletable === true,
  );
  check(
    "id là tiền tố của id khác thì không khớp nhầm (Q1 vs Q10)",
    verdict({ homework: [{ id: "H2", title: "BTVN", questionIds: ["Q10", "Q11"] }] }).deletable ===
      true,
  );
}

/* ── 8. Nhiều nguồn chặn cùng lúc ──────────────────────────────────────── */
{
  const v = verdict({
    examForms: [{ id: "F1", name: "Đề A", variants: [{ questions: [{ originalQuestionId: "Q1" }] }] }],
    homework: [{ id: "H1", title: "BTVN 1", questionIds: ["Q1"] }],
    attempts: [{ id: "A1", studentId: "HS01", questionIds: ["Q1"] }],
  });
  check("gom đủ cả ba nguồn chặn", v.blockers.length === 3, String(v.blockers.length));
  check("lý do nêu cả ba loại", /đề thi/.test(v.reason) && /bài tập/.test(v.reason) && /lượt làm bài/.test(v.reason), v.reason);
}

/* ── 9. splitDeletable — thao tác hàng loạt ────────────────────────────── */
{
  const rows = [{ id: "Q1" }, { id: "Q2" }, { id: "Q3" }];
  const s = splitDeletable(
    rows,
    {
      ...EMPTY,
      questions: rows,
      homework: [{ id: "H1", title: "BTVN", questionIds: ["Q2"] }],
    },
    READY,
  );
  check("tách đúng: 2 xoá được, 1 bị chặn", s.deletable.length === 2 && s.blocked.length === 1);
  check("câu bị chặn đúng là Q2", s.blocked[0].row.id === "Q2");
  check("câu bị chặn mang theo lý do", s.blocked[0].verdict.blockers.length > 0);
  check(
    "một câu vướng KHÔNG chặn cả tập",
    s.deletable.map((r) => r.id).join() === "Q1,Q3",
    s.deletable.map((r) => r.id).join(),
  );

  const none = splitDeletable(rows, { ...EMPTY, questions: rows }, { ...READY, attempts: false });
  check("chưa tải xong → không câu nào xoá được", none.deletable.length === 0 && none.blocked.length === 3);
}

/* ── 10. QUYỀN: ai tạo câu nào thì xoá vĩnh viễn được câu đó ───────────── */
// Trước đây nút xoá chỉ nhìn `canMutate`, tức MỌI nhân viên xoá vĩnh viễn được
// câu của bất kỳ ai. Xoá cứng là thao tác duy nhất không có đường lùi.
{
  const kho = [
    { id: "Q1", ownerId: "u-me" },
    { id: "Q2", ownerId: "u-nguoi-khac" },
  ];
  const s = src({ questions: kho });

  check(
    "câu MÌNH tạo, chưa dùng ở đâu → xoá được",
    canHardDelete("Q1", s, READY, "u-me").deletable === true,
  );
  const nguoiKhac = canHardDelete("Q2", s, READY, "u-me");
  check("câu NGƯỜI KHÁC tạo → CHẶN", nguoiKhac.deletable === false);
  check(
    "blocker ghi rõ là vấn đề quyền",
    nguoiKhac.blockers[0]?.kind === "not-owner",
    JSON.stringify(nguoiKhac.blockers),
  );
  check(
    "lý do chỉ đường sang Lưu trữ",
    /Lưu trữ/.test(nguoiKhac.reason),
    nguoiKhac.reason,
  );
  // Không được rò rỉ câu của người khác đang nằm trong đề nào.
  const kin = canHardDelete(
    "Q2",
    src({
      questions: kho,
      homework: [{ id: "H9", title: "BTVN bí mật", questionIds: ["Q2"] }],
    }),
    READY,
    "u-me",
  );
  check(
    "chặn vì quyền thì KHÔNG liệt kê tham chiếu của người khác",
    kin.blockers.every((b) => b.kind === "not-owner"),
    JSON.stringify(kin.blockers),
  );

  check(
    "không truyền actor → không soát quyền (luật tham chiếu thuần)",
    canHardDelete("Q2", s, READY).deletable === true,
  );
  check(
    "câu mình tạo NHƯNG đã vào đề → vẫn CHẶN (quyền không vượt qua tham chiếu)",
    canHardDelete(
      "Q1",
      src({
        questions: kho,
        examForms: [
          { id: "F", name: "Đề A", variants: [{ questions: [{ originalQuestionId: "Q1" }] }] },
        ],
      }),
      READY,
      "u-me",
    ).deletable === false,
  );
  check(
    "không tìm thấy câu trong kho → chặn, không đoán bừa là của mình",
    canHardDelete("Q-la", s, READY, "u-me").deletable === false,
  );

  // Hàng loạt: chỉ xoá phần của mình, câu người khác rơi sang nhóm bị chặn.
  const chia = splitDeletable(kho, s, READY, "u-me");
  check("hàng loạt: tách đúng phần của mình", chia.deletable.map((r) => r.id).join() === "Q1");
  check("hàng loạt: câu người khác bị chặn", chia.blocked[0]?.row.id === "Q2");
}

console.log(`\n${pass} qua, ${fail} trượt`);
process.exit(fail === 0 ? 0 : 1);
