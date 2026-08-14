# Tham chiếu route API

20 route trong `apps/web/src/app/api/`. Tất cả chạy trên **Firebase Admin SDK**,
tức là **bỏ qua hoàn toàn `firestore.rules`**. Mỗi route phải tự gác cửa; không
có mạng lưới an toàn phía sau. Xem [MO-HINH-BAO-MAT.md](MO-HINH-BAO-MAT.md).

---

## Cách gác cửa

`verifyCaller(req, opts?)` trong `apps/web/src/lib/api-auth.ts`:

1. Đọc header `Authorization: Bearer <Firebase ID token>`
2. Xác thực token bằng Admin SDK
3. Đọc `/users/{uid}` lấy vai trò
4. Nếu `opts.staffOnly` thì lọc theo `STAFF_ROLES`

`STAFF_ROLES` = `teacher`, `subject-lead`, `campus-admin`, `academic-director`,
`superadmin`. Tức là mọi vai **trừ** `student`.

Mã lỗi trả về:

| Mã | `error` | Khi nào |
|---|---|---|
| 401 | `unauthorized` | Thiếu header, hoặc token không hợp lệ / hết hạn |
| 403 | `forbidden` | Không tìm thấy hồ sơ, hoặc vai trò không đủ quyền |
| 500 | `server` | Admin SDK không khởi tạo được (thiếu biến môi trường) |

Phía client, `authHeaders()` trong `lib/api-client.ts` gắn token vào request.

**Lưu ý khi xử lý lỗi 401 ở giao diện:** route AI trả 401 cho hai chuyện khác
hẳn nhau. `{error: "unauthorized"}` là phiên đăng nhập của người dùng hết hạn;
`{error: "ai_failed"}` là nhà cung cấp AI từ chối API key. Phân biệt bằng trường
`error` trong body, đừng nhìn HTTP status. Xem `lib/ai/classify-error.ts`.

---

## Bảng tổng hợp

| Route | Method | Cổng gác |
|---|---|---|
| `/api/exam/[shiftId]/questions` | POST | đăng nhập |
| `/api/exam/[shiftId]/submit` | POST | đăng nhập |
| `/api/exam/[shiftId]/review` | POST | đăng nhập |
| `/api/exam/[shiftId]/violation` | POST | đăng nhập |
| `/api/homework/[id]/questions` | POST | đăng nhập |
| `/api/homework/[id]/submit` | POST | đăng nhập |
| `/api/ai/assess-progress` | POST | đăng nhập |
| `/api/ai/generate-question` | POST | staffOnly |
| `/api/ai/generate-questions-batch` | POST | staffOnly |
| `/api/ai/generate-toc` | POST | staffOnly |
| `/api/ai/generate-image` | POST | staffOnly |
| `/api/import/parse` | POST | staffOnly |
| `/api/import/parse-exam-bank` | POST | staffOnly |
| `/api/subjects/parse-framework` | POST | staffOnly |
| `/api/admin/import/students` | POST | staffOnly |
| `/api/admin/reset-password` | POST | **tự viết tay** + lọc vai trò |
| `/api/import/template` | GET | không gác |
| `/api/import/exam-bank-template` | GET | không gác |
| `/api/subjects/framework-template` | GET | không gác |
| `/api/admin/import/students-template` | GET | không gác |

Bốn route `GET` không gác đều chỉ **sinh file mẫu tĩnh**, không đọc dữ liệu từ
Firestore. Đã kiểm chứng: không route nào trong số đó chạm `getAdmin()` hay một
collection nào.

---

## Thi cử

### `POST /api/exam/[shiftId]/questions`

Trả về câu hỏi cho học sinh làm bài, **đã bóc sạch đáp án**.

`stripAnswers()` xoá `isCorrect`, đặt `correctAnswer = false`, làm rỗng
`acceptedAnswers` và `blanks[].acceptedAnswers`, đồng thời xáo lại thứ tự cho
`ordering` và `drag-drop`. Đáp án không bao giờ rời server trước khi nộp bài.

### `POST /api/exam/[shiftId]/submit`

Nộp bài. **Server-authoritative**: client chỉ gửi `answers`, server tự nạp câu
hỏi từ ảnh chụp đề đã đóng băng, tự chấm, tự ghi điểm.

**Body:** `{ answers: Record<questionId, Answer> }`

**Trả về:**

| Trường | Ý nghĩa |
|---|---|
| `score` | Phần trăm (ngữ nghĩa cũ, giữ để không phá dữ liệu đã lưu) |
| `maxScore` | Số câu (ngữ nghĩa cũ) |
| `correctCount` | Số câu đúng |
| `points` | Điểm thật theo thang của đề |
| `maxPoints` | Tổng điểm của đề |
| `perQuestionPoints` | Điểm tối đa từng câu |
| `earnedPerQuestion` | Điểm đạt được từng câu |
| `submittedAt` | Mốc thời gian nộp |

**Client phải mang HẾT các trường này vào bản ghi cục bộ.** Bản đầu chỉ lấy 4
trường cũ, nên server chấm ra 1 điểm mà giao diện hiển thị 0,91 vì tự chia đều
lại. Xem [CHAM-DIEM.md](CHAM-DIEM.md).

Trả 409 nếu bài đã nộp rồi.

### `POST /api/exam/[shiftId]/review`

Trả về câu hỏi **kèm đáp án** cho bài làm ĐÃ NỘP của CHÍNH người gọi, để trang
kết quả hiển thị đúng/sai từng câu.

Chỉ mở sau khi `submittedAt` đã có, và ca thi chỉ cho làm 1 lần, nên không dùng
được để xem trộm giữa giờ.

### `POST /api/exam/[shiftId]/violation`

Ghi một vi phạm chống gian lận vào bài làm của **chính người gọi**.

**Body:** `{ kind: "tabSwitch" | "fullscreenExit" | "pasteAttempt", at?: string }`

Id bài làm suy ra từ uid của người gọi, không nhận từ body. Chỉ **cộng dồn**
(`FieldValue.increment(1)`) và chỉ **nối thêm** vào nhật ký. Từ chối sau khi đã
nộp bài.

Route này tồn tại vì `violations` và `recentEvents` bị loại khỏi danh sách
trắng của `/attempts`: để client ghi thẳng nghĩa là người bị giám sát tự xoá
được bằng chứng của mình.

---

## Bài tập về nhà

### `POST /api/homework/[id]/questions`

Giống route câu hỏi thi: bóc đáp án qua `stripAnswers()`, nhưng lấy câu hỏi từ
`homework.questionIds`.

### `POST /api/homework/[id]/submit`

Server-authoritative. Nạp câu hỏi thật, chấm bằng Admin SDK, tự ghi
`correctCount` và `submittedAt`.

Rule `/homework_attempts` chặn học sinh tự đặt các trường đó, dùng danh sách
trắng `['answers', 'markedForReview', 'updatedAt']`.

---

## AI

Nhà cung cấp chọn tự động theo biến môi trường sẵn có (`GEMINI_API_KEY` hoặc
`ANTHROPIC_API_KEY`). Xem `lib/ai/provider.ts`. Mọi phản hồi kèm trường
`provider` cho biết bên nào đã trả lời.

| Route | Quyền | Body | Trả về |
|---|---|---|---|
| `assess-progress` | đăng nhập | `{ summary, studentName?, audience: "teacher" \| "student" }` | `{ verdict, observations[], suggestions[], provider }` |
| `generate-question` | staffOnly | mô tả câu hỏi cần sinh | `{ text, provider }` |
| `generate-questions-batch` | staffOnly | mô tả chủ đề + số lượng | danh sách câu hỏi + `provider` |
| `generate-toc` | staffOnly | mô tả chương trình môn học | `{ tree, provider }` |
| `generate-image` | staffOnly | mô tả ảnh minh hoạ | ảnh + `provider` |

`assess-progress` là route AI **duy nhất** học sinh gọi được, vì nó viết nhận
xét tiến độ cho chính các em ở trang "Tiến độ học tập". Bốn route còn lại là
công cụ soạn đề nên chặn ở `staffOnly`.

---

## Nhập liệu từ file

Tất cả nhận `multipart/form-data` với field `file`.

| Route | Quyền | Nhận | Việc làm |
|---|---|---|---|
| `import/template` | không gác | — | Sinh .docx mẫu để soạn câu hỏi |
| `import/parse` | staffOnly | .docx | Phân tích thành câu hỏi. Ghép công thức OMath của Office thành `$LaTeX$` để không bị mất |
| `import/exam-bank-template` | không gác | — | Sinh .docx mẫu "đề mẫu" FSC |
| `import/parse-exam-bank` | staffOnly | .docx | Phân tích "đề mẫu": mã `[mãChuyênĐề.Loại+số]`, **đáp án đúng gạch chân**, đáp án trả lời ngắn dạng `<Key=…>` |
| `subjects/framework-template` | không gác | — | Sinh .docx mẫu khung kiến thức |
| `subjects/parse-framework` | staffOnly | .docx | Phân tích thành cây 3 cấp Chương → Chuyên đề → Chỉ báo. Thuần quy tắc, không dùng AI |

`parse-exam-bank` giữ nguyên định dạng gạch chân (`style map u => u`) khi trích
HTML, vì gạch chân **chính là** cách đánh dấu đáp án đúng trong mẫu của trường.
Mất định dạng là mất đáp án.

---

## Quản trị

### `POST /api/admin/import/students`

**Body:** `multipart/form-data`, field `file` = .xlsx theo mẫu tạo hàng loạt.

Server chỉ **phân tích file thành JSON**. Việc tạo tài khoản và lớp diễn ra ở
client qua các zustand store, để cùng đi qua một đường ghi với phần còn lại.

Đây là route duy nhất phân tích file do người dùng tải lên bằng thư viện
`xlsx`. Thư viện đó từng dính prototype pollution và ReDoS ở bản `0.18.5` trên
npm; hệ thống đang dùng bản vá `0.20.3` lấy từ CDN chính chủ SheetJS, có ghim
mã băm trong `package-lock.json`.

### `POST /api/admin/reset-password`

**Body:** `{ targetUserId: string, newPassword: string }`

**Không dùng `verifyCaller`.** Route này tự xác thực token và tự lọc vai trò:
chỉ `superadmin`, `academic-director`, `campus-admin` được gọi, và campus-admin
chỉ đặt lại mật khẩu cho người dùng **trong campus của mình**.

Gọi `auth().updateUser(targetUid, { password })` bằng Admin SDK.

Việc trùng lặp logic xác thực ở đây là một điểm nợ kỹ thuật: nếu `STAFF_ROLES`
hay cách kiểm campus đổi ở `api-auth.ts`, route này **không tự đổi theo**.

---

## Thêm route mới thì làm gì

1. Gọi `verifyCaller()` **trước mọi việc khác**. Admin SDK không đi qua rules.
2. Có phải thao tác chỉ dành cho nhân viên không? Dùng `{ staffOnly: true }`.
3. Route ghi dữ liệu của một người dùng cụ thể? **Suy id từ uid của người gọi**,
   đừng nhận id từ body. Đó là cách route `violation` chặn việc ghi vi phạm cho
   người khác.
4. Trả dữ liệu về cho học sinh? Kiểm xem có lọt đáp án hay PII không. Dùng
   `stripAnswers()` nếu là câu hỏi.
5. Trả lỗi có trường `error` phân loại được, đừng chỉ dựa vào HTTP status.

---

## Liên quan

- [MO-HINH-BAO-MAT.md](MO-HINH-BAO-MAT.md) — vì sao Admin SDK là ranh giới nguy hiểm
- [CHAM-DIEM.md](CHAM-DIEM.md) — logic bên trong route nộp bài
- [../README.md](../README.md) — chạy dự án và triển khai
