# Hướng dẫn triển khai — GitHub + Firebase

Tài liệu này dành cho lần đầu setup. Sau khi xong, bạn chỉ cần `git push` để deploy.

---

## 0. Chuẩn bị

Cần đảm bảo có:

- [x] **Node.js 20+** (đã có)
- [x] **GitHub account** (bạn đã có)
- [x] **Firebase project** (bạn đã có) — lấy `Project ID` ở Firebase Console
- [ ] **GitHub CLI** (`gh`) hoặc dùng web để tạo repo
- [ ] **Firebase CLI** — cài bằng: `npm install -g firebase-tools`

```bash
# Cài Firebase CLI
npm install -g firebase-tools

# Đăng nhập (mở browser)
firebase login
```

---

## 1. Push code lên GitHub

```bash
cd /Users/vietnb/FSC_EXAM_PLATFORM

# Khởi tạo git (lần đầu)
git init -b main

# Add toàn bộ (đã có .gitignore loại bỏ node_modules, .env, serviceAccount.json)
git add .
git commit -m "feat: initial FSC exam platform + Firebase scaffolding"
```

### Tạo repo trên GitHub

**Cách A — bằng GitHub CLI (`gh`):**

```bash
gh auth login   # nếu chưa login
gh repo create fsc-exam-platform --private --source=. --remote=origin --push
```

**Cách B — bằng web:**

1. Vào https://github.com/new → tạo repo `fsc-exam-platform` (Private)
2. Bỏ qua mọi option (KHÔNG add README/`.gitignore`/license)
3. Trên local:
   ```bash
   git remote add origin git@github.com:<USER>/fsc-exam-platform.git
   git push -u origin main
   ```

---

## 2. Lấy Firebase Web SDK config

1. Vào [Firebase Console](https://console.firebase.google.com) → chọn project của bạn
2. ⚙️ **Project settings** → tab **General** → kéo xuống **Your apps**
3. Nếu chưa có **Web app**, bấm icon `</>` để tạo (đặt tên `fsc-exam-web`, không cần Hosting trong bước này)
4. Copy config object — sẽ thấy các giá trị `apiKey`, `authDomain`, `projectId`, ...

### Tạo `apps/web/.env.local`

```bash
cp apps/web/.env.example apps/web/.env.local
```

Mở `apps/web/.env.local` và điền các giá trị vừa copy:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false
```

### Update `.firebaserc`

Mở `.firebaserc` ở root, đổi `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` thành Project ID thực tế.

---

## 3. Enable Firebase services

Trong Firebase Console:

### 3.1 Authentication

1. Sidebar → **Authentication** → **Get started**
2. Tab **Sign-in method** → enable **Email/Password**
3. (Tuỳ chọn) Bật **Email link (passwordless)** nếu muốn gửi link đăng nhập

### 3.2 Firestore Database

1. Sidebar → **Firestore Database** → **Create database**
2. Chọn location: `asia-southeast1` (Singapore — gần Việt Nam nhất)
3. Bắt đầu ở **Production mode** (rules sẽ deploy ở bước sau)

### 3.3 Hosting (sẽ làm ở bước 5)

---

## 4. Seed superadmin đầu tiên

Vì rules đã cấm tạo user từ client trừ khi đã là admin, ta cần seed bằng Admin SDK lần đầu.

```bash
# 1. Tải service account key
# Firebase Console → Project Settings → Service accounts → "Generate new private key"
# Lưu file đó vào root repo, đổi tên thành: serviceAccount.json
# (file này đã được .gitignore — KHÔNG commit)

# 2. Chạy seed
SEED_PASSWORD="fsc2026!" node scripts/seed-firebase.mjs
```

Sau khi chạy xong, sẽ in ra:
```
[seed] Done. You can now log in at /login with:
       email:    vietnb4@fpt.edu.vn
       password: fsc2026!
```

---

## 5. Deploy Firestore rules + indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 6. Build + deploy web app

App này dùng **Next.js 15 App Router** với nhiều route động (`[shiftId]`, `[attemptId]`) — không thể static-export. Có 2 lựa chọn hosting:

### Cách A — Vercel (KHUYẾN NGHỊ cho demo, miễn phí)

Vercel là người tạo ra Next.js, deploy đơn giản nhất:

```bash
npm install -g vercel
cd apps/web
vercel
# Lần đầu sẽ hỏi link project — chọn "Link to existing" hoặc tạo mới
# Khi hỏi env vars, paste 6 dòng NEXT_PUBLIC_FIREBASE_* từ .env.local
vercel --prod
```

URL kiểu `https://fsc-exam-platform.vercel.app`. Firebase chỉ dùng cho Auth + Firestore — không liên quan tới Hosting nữa.

### Cách B — Firebase Hosting (cần Blaze plan)

Firebase Hosting hỗ trợ Next.js SSR qua Cloud Functions. **Cần upgrade lên Blaze plan** (có credit miễn phí $300 đầu, sau đó pay-as-you-go nhưng vẫn rất rẻ ở quy mô demo):

1. Firebase Console → ⚙️ Settings → tab **Billing** → upgrade to Blaze
2. Deploy:
   ```bash
   firebase experiments:enable webframeworks
   firebase deploy --only hosting
   ```
3. URL kiểu: `https://<project-id>.web.app`

> **Lưu ý:** Cách B tốn tiền cloud functions theo lượng request. Với demo <100 users thì gần như free, nhưng nếu bạn lo về cost predictability thì chọn Cách A.

---

## 7. Test login

1. Mở URL hosting → vào `/login`
2. Nhập `vietnb4@fpt.edu.vn` / `fsc2026!`
3. Phải vào được `/dashboard` với role superadmin

Sau khi login, bạn có thể vào `/admin/users` để tạo các tài khoản admin campus / GV / HS.

---

## 8. Workflow tiếp theo

### Mỗi lần đẩy code mới:

```bash
git add .
git commit -m "feat: xyz"
git push

# Deploy thủ công:
npm run build --workspace apps/web
firebase deploy --only hosting
```

### Setup GitHub Actions auto-deploy (tuỳ chọn):

```bash
firebase init hosting:github
```

Lệnh trên tự sinh `.github/workflows/firebase-hosting-merge.yml` để auto deploy khi push lên `main`.

---

## Troubleshooting

### "Missing env vars: NEXT_PUBLIC_FIREBASE_..."
- Kiểm tra file `apps/web/.env.local` có đủ 6 dòng `NEXT_PUBLIC_FIREBASE_*` chưa.
- Restart `npm run dev` sau khi sửa env.

### "PERMISSION_DENIED: Missing or insufficient permissions" khi truy cập Firestore
- Rules chưa được deploy → chạy `firebase deploy --only firestore:rules`.
- Hoặc account đang login chưa có doc `/users/{uid}` → seed lại superadmin.

### Không tạo được user mới từ giao diện admin
- Mở DevTools console xem lỗi. Thường gặp:
  - `auth/email-already-in-use` — đổi email khác
  - `auth/weak-password` — mật khẩu < 6 ký tự
- Đảm bảo session hiện tại là admin/superadmin (rules check role).

### Lag khi chạy local
- Bật emulator để khỏi gọi Firebase thật:
  ```bash
  firebase emulators:start
  # Set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true trong .env.local
  ```

---

## Cấu trúc dữ liệu Firestore

Hiện tại Phase 2 chỉ migrate `/users`. Các store khác (questions, shifts, attempts, …) vẫn dùng localStorage cho đến khi bạn yêu cầu migrate tiếp.

```
/users/{uid}             ← Firebase Auth uid là document id
  id: string
  email: string
  name: string
  role: "superadmin" | "admin" | "teacher" | "student" | ...
  campusId: string | null
  status: "active" | "suspended"
  subjectIds?: string[]
  gradeIds?: string[]
  permissions?: { canCreateBlueprint, canCreateShift, ... }
  createdAt, updatedAt: timestamp
```

Tất cả các collection khác (`questions`, `shifts`, `attempts`, …) đã được khai báo trong `firestore.rules` với security policy đúng, nhưng client chưa write vào đó. Đó là việc của Phase 3-5.
