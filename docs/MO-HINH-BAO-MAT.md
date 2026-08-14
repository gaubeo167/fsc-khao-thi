# Mô hình bảo mật

Đọc tài liệu này **trước khi** sửa bất cứ thứ gì đụng tới dữ liệu. Kiến trúc ở
đây có một điểm bất thường, và mọi lỗ hổng nghiêm trọng của dự án cho tới nay
đều bắt nguồn từ việc không nắm điểm đó.

Mã nguồn: `firestore.rules` (469 dòng, 25 collection) và
`apps/web/src/lib/api-auth.ts`.

---

## Điểm bất thường: rules LÀ hàng rào, không phải lớp phụ

Trong phần lớn ứng dụng web, trình duyệt gọi API, API kiểm quyền rồi mới chạm
cơ sở dữ liệu. Ở đây **không phải vậy**.

Các zustand store trong `features/*/state/*.ts` gọi thẳng
`writeDoc` / `patchDoc` / `subscribeCollection` (`lib/firestore-sync.ts`), tức
là trình duyệt **nói chuyện trực tiếp với Firestore**, không qua một dòng code
server nào.

```
Đường THƯỜNG GẶP ở app khác          Đường THẬT ở đây
                                    
Trình duyệt                          Trình duyệt
   │ gọi API                            │ ghi thẳng Firestore
   ▼                                    ▼
Server kiểm quyền  ← hàng rào       firestore.rules  ← HÀNG RÀO DUY NHẤT
   │                                    │
   ▼                                    ▼
Cơ sở dữ liệu                        Firestore
```

Hệ quả, và đây là điều phải nhớ:

**Mọi thứ `firestore.rules` không chặn thì bất kỳ ai đăng nhập cũng làm được.**
Kiểm tra ở phía React không phải bảo mật, đó chỉ là giao diện. Web API key nằm
công khai trong bundle JavaScript, nên ai cũng gọi được REST API của Firestore
bằng token của chính họ.

---

## Hai đường ghi, hai luật chơi

| Đường | Đi qua rules? | Dùng cho |
|---|:---:|---|
| Client → Firestore trực tiếp | **CÓ** | Đọc danh sách, tự lưu bài làm, CRUD của giáo viên |
| Route API → Admin SDK | **KHÔNG** | Chấm bài, đặt lại mật khẩu, ghi vi phạm, gọi AI |

Admin SDK **bỏ qua hoàn toàn** rules. Nên mỗi route API phải tự gác cửa bằng
`verifyCaller()`. Không có mạng lưới an toàn phía sau.

`verifyCaller(req, { staffOnly?: boolean })` trong `lib/api-auth.ts` làm bốn
việc: đọc `Authorization: Bearer <idToken>`, xác thực token, đọc
`/users/{uid}` lấy vai trò, và lọc theo `STAFF_ROLES` nếu bật `staffOnly`.

Xem [API.md](API.md) để biết route nào gác kiểu gì.

---

## Bài học đắt nhất: danh sách trắng, không phải danh sách đen

Đây là lỗi đã **thực sự xảy ra** trong dự án này, và đáng để kể lại.

Rule cho `/attempts` ban đầu liệt kê những trường học sinh **không được** đổi:

```javascript
// SAI — danh sách đen
allow update: if resource.data.studentId == uid() &&
  request.resource.data.score == resource.data.score &&
  request.resource.data.submittedAt == resource.data.submittedAt &&
  request.resource.data.correctCount == resource.data.correctCount;
```

Rồi hệ thống thêm thang điểm chuẩn Bộ, kéo theo bốn trường mới: `points`,
`maxPoints`, `perQuestionPoints`, `earnedPerQuestion`. Rule không hề nhắc tới
chúng, nên **học sinh tự ghi điểm của mình được**. Không ai nhận ra cho tới
lúc rà soát.

Bản đúng liệt kê thứ **được phép** đổi:

```javascript
// ĐÚNG — danh sách trắng
allow update: if resource.data.studentId == uid() &&
  resource.data.submittedAt == null &&
  request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['answers', 'markedForReview', 'updatedAt']);
```

Trường thêm sau này mặc định bị cấm. Đó là hướng an toàn khi ai đó quên.

Cùng cái bẫy đó còn nằm ở `/homework_attempts` cho tới khi được sửa. **Khi viết
rule cho dữ liệu do học sinh ghi, luôn dùng `hasOnly`.**

---

## Ranh giới quan trọng theo từng loại dữ liệu

### Điểm số — chỉ server ghi

Học sinh chỉ đổi được `answers`, `markedForReview`, `updatedAt`, và chỉ khi
`submittedAt == null`. Nộp bài rồi thì bản ghi đóng lại.

Mọi trường điểm do `/api/exam/[shiftId]/submit` và
`/api/homework/[id]/submit` ghi bằng Admin SDK. Xem [CHAM-DIEM.md](CHAM-DIEM.md).

### Bằng chứng chống gian lận — người bị giám sát không được chạm

`violations` và `recentEvents` **không** nằm trong danh sách trắng của
`/attempts`. Chúng chỉ được cộng dồn qua `/api/exam/[shiftId]/violation` bằng
`FieldValue.increment(1)`.

Lý do hiển nhiên khi nói ra: để client ghi nghĩa là người bị giám sát tự xoá
được bằng chứng của mình.

Tương tự với `/proctor_events`: học sinh chỉ được đặt `acknowledgedAt` (đánh
dấu đã đọc), không sửa được nội dung cảnh cáo. Trước đây rule là `if isSignedIn()`,
tức mọi người dùng sửa được mọi biên bản của giám thị, kể cả của học sinh khác.

### Hồ sơ người dùng — từng để lộ PII

`/users` trước đây là `allow read: if true`. Bất kỳ ai trên internet đều GET
được toàn bộ hồ sơ qua REST API bằng web API key công khai: **họ tên học sinh,
lớp, mã học sinh, email và số điện thoại phụ huynh**. Với mục tiêu 1.700 học
sinh thì đó là rò rỉ dữ liệu trẻ em ở quy mô lớn.

Hiện tại:

```javascript
allow read: if isTeacherOrAbove() || (isSignedIn() && userId == uid());
```

Nhân viên đọc được danh bạ (cần cho quản lý và báo cáo), học sinh chỉ đọc hồ sơ
của chính mình.

### `/login_lookup` — collection công khai có chủ đích

```javascript
match /login_lookup/{key} {
  allow read: if true;
  allow write: if isAdmin();
}
```

Đây là **ngoại lệ cố ý**, không phải sót. Trang đăng nhập cần tra email từ tên
đăng nhập **trước khi** người dùng có token. Trước đây việc đó làm bằng cách
query `/users`, chính là lý do `/users` từng phải mở.

Mỗi doc chỉ chứa **đúng một trường `email`**, không có gì khác. Sinh bằng
`scripts/backfill-login-lookup.mjs`.

**Nếu thêm trường vào collection này, bạn đang công khai nó ra internet.**

---

## Sáu vai trò và các hàm trợ giúp

`superadmin` › `academic-director` › `campus-admin` › `subject-lead` ›
`teacher` › `student`

Rules định nghĩa các hàm trợ giúp dùng lại khắp file:

| Hàm | Ý nghĩa |
|---|---|
| `isSignedIn()` | Có token hợp lệ |
| `uid()` | Id người gọi |
| `role()` | Đọc `/users/{uid}.role` |
| `isSuperadmin()` | Chỉ superadmin |
| `isAdmin()` | superadmin, academic-director, campus-admin |
| `isTeacherOrAbove()` | Mọi vai trừ student |
| `isApprover()` | Được duyệt câu hỏi / gói đề |
| `inSameCampus(cid)` | Cô lập theo campus |

Phía server, `STAFF_ROLES` trong `lib/api-auth.ts` là cùng tập hợp với
`isTeacherOrAbove()`. **Hai chỗ này phải khớp nhau**; lệch là sinh ra kẽ hở
kiểu API cho qua còn rules chặn, hoặc tệ hơn là ngược lại.

---

## Đổi rules thì làm gì

```bash
# 1. Kiểm cú pháp trước
npx firebase deploy --only firestore:rules --project fsc-khao-thi --dry-run

# 2. Deploy
npx firebase deploy --only firestore:rules --project fsc-khao-thi
```

Rules deploy **độc lập** với ứng dụng. Đổi `firestore.rules` mà quên deploy thì
code mới chạy với phân quyền cũ.

Thứ tự an toàn:

- Rules **nới lỏng** (mở thêm quyền) → deploy rules trước, rồi tới app.
- Rules **siết chặt** → deploy app trước, rồi tới rules. Ngược lại sẽ chặn nhầm
  người dùng thật đang thao tác.

Nếu thay đổi cần dữ liệu mới tồn tại trước (như `/login_lookup`), **chạy script
backfill trước khi deploy rules siết**. Không thì người dùng không đăng nhập
được.

---

## Danh sách kiểm khi viết rule mới

- [ ] Học sinh ghi được dữ liệu này không? Nếu có, dùng `hasOnly` chứ đừng liệt
      kê trường cấm.
- [ ] Có trường điểm hay trường bằng chứng nào ở đây không? Nếu có, phải để
      server ghi.
- [ ] Có PII không (tên, lớp, liên hệ phụ huynh)? Nếu có, siết `read`.
- [ ] Có cần cô lập campus không? Dùng `inSameCampus()`.
- [ ] Route API tương ứng có `verifyCaller` chưa? Admin SDK không đi qua rules.
- [ ] Đã chạy `--dry-run` chưa?

---

## Liên quan

- [CHAM-DIEM.md](CHAM-DIEM.md) — vì sao chấm bài phải nằm ở server
- [API.md](API.md) — cổng gác của từng route
- [../README.md](../README.md) — quy trình triển khai hai phần
