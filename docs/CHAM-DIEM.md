# Cơ chế chấm điểm

Đây là logic nghiệp vụ quan trọng nhất và tinh vi nhất của hệ thống. Chấm sai
không ai báo lỗi: học sinh chỉ thấy một con số, và con số đó vào học bạ.

Tài liệu này mô tả **hệ đang chạy**. Mã nguồn: `apps/web/src/lib/exam/grade.ts`
và `apps/web/src/lib/exam/short-answer-match.ts`.

---

## Phần 1 — Vấn đề: vì sao không thể "mỗi câu 1 điểm"

Cách chấm hiển nhiên là đếm số câu đúng rồi quy phần trăm. Hàm
`computeAttemptScore` làm đúng thế, và nó **đúng cho câu hỏi "làm đúng bao nhiêu
câu"**.

Nhưng đề thi theo chuẩn Bộ GD không hoạt động như vậy:

- Phần I trắc nghiệm 1 đáp án: **0,25đ/câu**
- Phần II Đúng–Sai chùm 4 ý: **1đ/câu**, và chấm **lũy tiến** theo số ý đúng
- Phần III trả lời ngắn: **0,5đ/câu**

Một đề 40 câu với thang đó, chấm theo "mỗi câu 1 điểm" sẽ ra con số vô nghĩa.
Đó là lý do tồn tại nhánh chấm thứ hai trong cùng file.

Hai hàm, hai mục đích, **cả hai đều cần**:

| Hàm | Trả về | Dùng cho |
|---|---|---|
| `computeAttemptScore` | `score` (phần trăm), `correctCount`, `maxScore` (số câu) | "Đúng 18/20 câu" |
| `computeWeightedAttemptScore` | `points`, `maxPoints`, `perQuestion`, `earnedPerQuestion` | Điểm thật trên thang 10 |

Route nộp bài tính **cả hai** và trả về cả hai. Trường `score`/`maxScore` giữ
nguyên ngữ nghĩa cũ để các bài thi đã lưu từ trước không đổi cách hiển thị.

---

## Phần 2 — Ảnh chụp đề: vì sao điểm không đọc từ câu hỏi sống

Điểm mỗi câu **không** lấy từ `/questions` lúc chấm. Nó được **đóng băng** vào
`ExamFormVariant.perQuestion` ngay khi tạo ca thi.

```
Tạo ca thi
   └─ materialize → ExamForm
        ├─ scoringPolicy          (đóng băng cách chấm)
        ├─ maxScore               (tổng điểm toàn đề)
        └─ variants[]
             ├─ variantId         (học sinh nào nhận đề nào)
             ├─ questions[]       (ảnh chụp nội dung câu hỏi)
             └─ perQuestion       (điểm từng câu, khoá theo snapshotId)
```

Lý do: giáo viên sửa câu hỏi trong ngân hàng **sau** khi ca thi diễn ra là
chuyện bình thường. Nếu chấm đọc dữ liệu sống thì điểm của bài thi đã nộp sẽ
đổi theo, và không ai biết. Ảnh chụp làm cho bài thi bất biến.

`perQuestion` khoá theo `snapshotId`, không phải id câu hỏi gốc. Một câu hỏi
xuất hiện ở hai đề khác nhau có thể mang điểm khác nhau.

Khi ca thi không có ảnh chụp (dữ liệu cũ), route nộp bài rơi về đường tính theo
khung đề và có banner cảnh báo ở giao diện.

---

## Phần 3 — Tham chiếu: ScoringPolicy

```ts
interface ScoringPolicy {
  mcqMulti: "full" | "partial";
  ds: "graduated" | "weighted" | "full";
  dsGraduatedTable?: Record<number, number>;
  maxScore: number;
}
```

Định nghĩa tại `apps/web/src/features/exams/data/types.ts`.

**Đề nào có ScoringPolicy.** Đề YCCĐ lấy thẳng từ gói đề. Đề tạo từ khung đề
dựng policy từ cấu hình ca thi (`ScoringConfig.mcqMulti` / `.ds` /
`.dsGraduatedTable`) — xem `policyFromScoringConfig` trong `materialize.ts`.

Ca thi **không cài gì** thì `scoringPolicy` đóng băng là `null`, nghĩa là chấm
toàn phần. Đó là hành vi của toàn bộ ca thi tạo trước tính năng này, và phải
giữ nguyên: đổi mặc định ở đây là đổi điểm của những bài đã thi xong.

### `mcqMulti` — trắc nghiệm nhiều đáp án đúng

| Giá trị | Cách tính |
|---|---|
| `"full"` | Chọn đúng y hệt tập đáp án đúng mới có điểm. Thừa hay thiếu một đáp án là 0. |
| `"partial"` | `max(0, (số đúng − số sai) / số đáp án đúng)` |

Công thức `partial` có tính răn đe: chọn bừa thêm một đáp án sai là trừ đi một
phần, chọn hết mọi đáp án thì về 0. Không thể ăn điểm bằng cách tick tất cả.

### `ds` — Đúng–Sai chùm (một đoạn dẫn, nhiều ý a/b/c/d)

| Giá trị | Cách tính |
|---|---|
| `"graduated"` | Tra `dsGraduatedTable` theo **số ý đúng**. Mặc định `{1: 0.1, 2: 0.25, 3: 0.5, 4: 1.0}` |
| `"weighted"` | Tổng trọng số ý đúng chia tổng trọng số (`MultiTfSub.weight`, mặc định 1) |
| `"full"` | Đúng hết mọi ý mới có điểm |

`"graduated"` là chuẩn Bộ cho THPT: đúng 1 ý được 0,1đ, 2 ý 0,25đ, 3 ý 0,5đ,
4 ý 1đ. Hằng số `DEFAULT_DS_GRADUATED`.

**Chi tiết dễ sai:** bảng ghi **điểm tuyệt đối** cho câu 1 điểm, nhưng
`gradeQuestionRatio` phải trả về **tỉ lệ 0..1**. Nên nó quy về
`bảng[số ý đúng] / bảng[tổng số ý]`. Nhờ vậy vẫn đúng khi câu đó không phải 1
điểm. Sửa bảng mà quên phép chia này là toàn bộ điểm Đúng–Sai sai.

### `maxScore`

Tổng điểm toàn đề. Khuyến nghị chuẩn hoá 10. Tổng `perQuestion` của mỗi variant
phải bằng đúng giá trị này.

---

## Phần 3b — Điểm/câu: giữ số chính xác, làm tròn khi hiển thị

Bảng `perQuestion` là **dữ liệu**, không phải thứ để đọc. Nó từng bị làm tròn 2
chữ số ngay lúc đóng băng, và tổng đề trượt khỏi thang:

| Chế độ | Cấu hình | Mỗi câu | Tổng |
|---|---|---|---|
| `even` | 3 câu, thang 10 | 10/3 = 3,3333 → **3,33** | **9,99** |
| `by-difficulty` | 2 dễ + 4 TB, thang 10 | 10×1,5/8 = 1,875 → **1,88** | **10,02** |

Đề 10 điểm chấm trên thang 10,02. Không lỗi, không cảnh báo — chỉ ra điểm lệch.

Quy ước hiện tại: **lưu số chính xác, làm tròn ở chỗ hiển thị** bằng
`formatScore`. Áp cho cả `materialize.ts` lẫn `perQuestion` /
`earnedPerQuestion` trong `grade.ts` — hai bảng sau **bị cộng lại** ở màn kết
quả, nên cộng số đã tròn thì sai số dồn lên.

Đã cân nhắc và **bỏ** cách dồn phần dư vào vài câu (largest remainder): nó làm
hai câu cùng độ khó lệch điểm nhau (1,88 với 1,87), và trong một kỳ thi thì học
sinh có quyền thắc mắc.

Hệ quả phải biết: cộng tay các con số **hiển thị** có thể ra 10,02 dù tổng thật
là 10. Bước cài điểm cảnh báo trước khi giáo viên chọn thang chia không hết.

Bất biến này có test khoá: `scripts/test-materialize.mjs`.

---

## Phần 3c — Bốn chế độ phân bổ điểm (đề tạo từ khung đề)

`ScoringConfig.mode` trong `features/exam-shifts/data/types.ts`:

| Chế độ | Cách chia |
|---|---|
| `even` | `maxScore / số câu`, mọi câu bằng nhau |
| `by-difficulty` | theo trọng số dễ/TB/khó (mặc định 1 / 1,5 / 2) |
| `by-part` | giáo viên đặt **TỔNG** điểm mỗi phần, chia đều cho số câu thực tế của phần |
| `manual` | tự đặt từng câu; tổng lệch thang thì chuẩn hoá lại theo tỉ lệ |

`by-part` là cấu trúc đề định kỳ quen thuộc — Phần I 4,0đ / Phần II 4,0đ /
Phần III 2,0đ. Phần xác định bằng **dạng câu hỏi**, không phải một trục của ma
trận; mỗi dạng chỉ thuộc một phần, phần đứng trước thắng.

Ba chuyện làm đề chấm sai thang mà im lặng, nên bước cài điểm phải nói ra: tổng
các phần lệch thang (**chặn**), phần không bốc được câu nào (cảnh báo, kèm số
điểm mất), câu có dạng ngoài mọi phần (cảnh báo, câu đó 0 điểm).

Hàm chia nằm **một chỗ duy nhất** — `pointsByScorePart` trong
`features/exam-shifts/lib/scoring.ts` — dùng chung cho bước xem trước và bước
đóng băng. Lệch nhau nghĩa là giáo viên thấy một đằng, học sinh bị chấm một nẻo.

---

## Phần 4 — Tham chiếu: 11 dạng câu và cách chấm

`gradeQuestionRatio(q, a, policy)` trả về tỉ lệ `0..1`, hoặc `null` cho câu
chấm tay.

| Dạng | Chấm máy | Ghi chú |
|---|:---:|---|
| `mcq-single` | ✅ | So `optionId` với đáp án đúng |
| `mcq-multi` | ✅ | Theo `policy.mcqMulti` |
| `true-false` | ✅ | So boolean |
| `multi-tf` | ✅ | Theo `policy.ds` |
| `short-answer` | ✅ | Xem Phần 5 |
| `fill-blank` | ✅ | Từng ô, chấm theo tỉ lệ ô đúng |
| `matching` | ✅ | Nối đúng cặp |
| `ordering` | ✅ | Đúng thứ tự |
| `drag-drop` | ✅ | Thả đúng vùng |
| `underline` | ✅ | Gạch đúng từ/cụm |
| `essay` | ❌ | Trả `null`, giáo viên chấm tay |
| `ai-generated` | ❌ | Trả `null` |

`null` khác `0`. `null` nghĩa là **không tính vào điểm máy**, câu đó chờ chấm
tay. Trả `0` thay vì `null` sẽ kéo tụt điểm mọi bài có câu tự luận.

---

## Phần 5 — Trả lời ngắn: ba lớp so khớp

`apps/web/src/lib/exam/short-answer-match.ts`. Một module dùng chung cho cả bộ
chấm thật lẫn ô "Làm thử" của giáo viên.

Duyệt danh sách đáp án **từ trên xuống, khớp cái đầu tiên thì dừng** và lấy %
điểm của chính nó. Đây là quy tắc của Moodle, và nó làm cho thứ tự đáp án có ý
nghĩa: đặt `*` ở cuối làm lưới hứng (0% kèm lời giải thích) hoạt động đúng.

### Lớp 1 — So bằng GIÁ TRỊ SỐ

Chỉ chạy khi cả hai bên đều là số **và** đáp án không chứa `*`.

| Học sinh gõ | Đáp án soạn | Kết quả |
|---|---|---|
| `4.16` | `4,16` | ✅ khớp |
| `0,25` | `1/4` | ✅ khớp |
| `5` | `5,00` | ✅ khớp |
| `1000` | `1 000` | ✅ khớp |
| `1234.5` | `1.234,5` | ✅ khớp |

Đây là lớp quan trọng nhất trong bối cảnh Việt Nam: học sinh gõ dấu phẩy thập
phân trong khi giáo viên soạn dấu chấm (hoặc ngược lại) xảy ra hằng ngày. So
chuỗi thuần sẽ chấm **sai một câu trả lời đúng**.

`parseVnNumber` xử lý: phân số `1/4`, dấu phân nhóm hàng nghìn cả kiểu Việt
(`1.234,5`) lẫn kiểu Anh (`1,234.5`), và dạng thiếu số 0 (`,5` → `0.5`).

### Lớp 2 — Ký tự đại diện

`*` khớp mọi chuỗi, đúng như Moodle short answer. `\*` để khớp dấu sao thật.

Thuật toán là **khớp glob hai con trỏ, không dùng regex**. Bản đầu dịch `*`
thành `[\s\S]*` rồi ném cho RegExp; đo thử mẫu `*a*a*a*…*b` gặp câu trả lời
2000 ký tự chạy **quá 2 phút** vì backtracking bùng nổ theo hàm mũ. Trên route
nộp bài (Node đơn luồng) là đóng băng cả function, mọi học sinh đang nộp cùng
lúc đều kẹt. Thuật toán hiện tại chặn trên O(n×m), không có đường bùng nổ.

### Lớp 3 — So chữ

Trim, gộp khoảng trắng thừa, hạ chữ nếu không bật phân biệt hoa/thường.

### Dạng dữ liệu đáp án

```ts
type ShortAnswerKey =
  | string                                              // 100% điểm
  | { text: string; grade?: number; feedback?: string }  // grade 0..100
```

Chuỗi trần đúng bằng dạng dữ liệu cũ, nên câu hỏi đã lưu chạy nguyên không cần
migration.

**Cảnh báo cho người hiển thị đáp án:** đừng gọi `.trim()` thẳng lên phần tử
mảng. Dạng object sẽ ném lỗi. Dùng `keyText(k)` do module xuất ra. Lỗi này đã
xảy ra ở 4 chỗ hiển thị khác nhau.

---

## Phần 6 — Ranh giới: ai được chấm

Ở production, chấm bài là **server-authoritative**. Trình duyệt học sinh không
tự tính điểm của mình.

```
Trình duyệt HS                     Server (Admin SDK)
    │
    │ POST /api/exam/[shiftId]/submit
    │   { answers }
    └──────────────────────────────►│
                                    │ đọc ExamForm đã đóng băng
                                    │ chấm bằng perQuestion + scoringPolicy
                                    │ ghi score/points/submittedAt
    ◄──────────────────────────────┘
    │ { ok, score, maxScore, points, maxPoints,
    │   correctCount, perQuestionPoints, earnedPerQuestion }
```

`firestore.rules` chặn học sinh tự ghi mọi trường điểm. Xem
[MO-HINH-BAO-MAT.md](MO-HINH-BAO-MAT.md).

**Bẫy đã sập một lần:** khi thêm các trường điểm mới (`points`, `maxPoints`,
`perQuestionPoints`, `earnedPerQuestion`), phía client cũng phải mang chúng vào
bản ghi cục bộ sau khi nhận phản hồi. Bản đầu chỉ lấy 4 trường cũ, nên server
chấm ra 1 điểm mà giao diện hiển thị 0,91 vì tự chia đều lại.

Câu hỏi gửi xuống học sinh đi qua `stripAnswers()`: xoá `isCorrect`, đặt
`correctAnswer = false`, làm rỗng `acceptedAnswers`, và xáo lại thứ tự cho
`ordering` / `drag-drop`. Đáp án không bao giờ rời server.

---

## Phần 7 — Sửa code chấm điểm thì làm gì

1. Đọc `scripts/test-grade.mjs` (18 ca) và `scripts/test-short-answer.mjs`
   (38 ca) trước. Chúng khoá lại hành vi hiện tại.
2. Sửa **một** module dùng chung, đừng chép logic. Repo này từng có hai bộ
   chấm song song và chúng lạc nhau: mcq-multi tính điểm khác nhau ở hai bên.
   Riêng so khớp trả lời ngắn từng bị chép ra **7 bản**.
3. Thêm ca hồi quy khoá lại đúng lỗi vừa sửa.
4. Chạy lại cả hai script trước khi deploy.

```bash
node scripts/test-grade.mjs
node scripts/test-short-answer.mjs
```

---

## Liên quan

- [MO-HINH-BAO-MAT.md](MO-HINH-BAO-MAT.md) — vì sao học sinh không tự ghi được điểm
- [API.md](API.md) — route nộp bài và các route liên quan
- [../README.md](../README.md) — chạy dự án, kiểm thử, triển khai
