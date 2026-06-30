# Dựng Moodle (Docker) & cấu hình lần đầu

Hai lựa chọn: **A)** `moodle-docker` (source-based — khuyến nghị vì sẽ viết plugin custom); **B)** Bitnami (turnkey — đánh giá nhanh).

---

## A. moodle-docker (khuyến nghị cho dev + plugin)

```bash
# 1. Lấy Moodle source (chọn nhánh LTS, vd MOODLE_405_STABLE = 4.5)
git clone -b MOODLE_405_STABLE --depth 1 https://github.com/moodle/moodle.git
git clone https://github.com/moodlehq/moodle-docker.git
cd moodle-docker

# 2. Trỏ tới source + chọn DB Postgres
export MOODLE_DOCKER_WWWROOT=../moodle
export MOODLE_DOCKER_DB=pgsql
cp config.docker-template.php $MOODLE_DOCKER_WWWROOT/config.php

# 3. Khởi động
bin/moodle-docker-compose up -d
bin/moodle-docker-wait-for-db

# 4. Cài đặt Moodle (CLI)
bin/moodle-docker-compose exec webserver php admin/cli/install_database.php \
  --agree-license --fullname="FSchools" --shortname="FSC" \
  --adminpass="Admin@12345" --adminemail="admin@fsc.local"
```
Mở http://localhost:8000 (cổng mặc định của moodle-docker).

**Cài plugin custom/contrib:** đặt code plugin vào đúng thư mục trong source, ví dụ:
- qtype: `moodle/question/type/<tên>/`
- qformat: `moodle/question/format/wordtable/`
- filter: `moodle/filter/wiris/`
- quizaccess: `moodle/mod/quiz/accessrule/<tên>/`
Rồi vào **Site administration → Notifications** để chạy upgrade cài plugin.

> moodle-docker cho phép sửa source + plugin trực tiếp → phù hợp viết `qtype_underline`, plugin nhắn tin giám thị, block AI.

---

## B. Bitnami (turnkey, đánh giá nhanh) — `docker-compose.yml`

```yaml
services:
  postgresql:
    image: docker.io/bitnami/postgresql:16
    environment:
      - POSTGRESQL_USERNAME=bn_moodle
      - POSTGRESQL_PASSWORD=bn_moodle
      - POSTGRESQL_DATABASE=bitnami_moodle
    volumes:
      - pg_data:/bitnami/postgresql

  moodle:
    image: docker.io/bitnami/moodle:4.5
    ports:
      - "8080:8080"
    environment:
      - MOODLE_DATABASE_TYPE=pgsql
      - MOODLE_DATABASE_HOST=postgresql
      - MOODLE_DATABASE_PORT_NUMBER=5432
      - MOODLE_DATABASE_USER=bn_moodle
      - MOODLE_DATABASE_PASSWORD=bn_moodle
      - MOODLE_DATABASE_NAME=bitnami_moodle
      - MOODLE_USERNAME=admin
      - MOODLE_PASSWORD=Admin@12345
      - MOODLE_EMAIL=admin@fsc.local
      - MOODLE_SITE_NAME=FSchools
      - MOODLE_LANG=vi
    volumes:
      - moodle_data:/bitnami/moodle
      - moodledata_data:/bitnami/moodledata
    depends_on:
      - postgresql

volumes:
  pg_data:
  moodle_data:
  moodledata_data:
```
```bash
docker compose up -d   # mở http://localhost:8080
```
> Bitnami nhanh nhưng sửa source/plugin khó hơn → dùng để xem thử, không khuyến nghị cho dev plugin.

---

## C. Cấu hình Moodle lần đầu (cả 2 cách)

1. **Ngôn ngữ tiếng Việt**: Site admin → Language → Language packs → cài `Vietnamese (vi)`; đặt mặc định.
2. **Múi giờ**: Site admin → Location → `Asia/Ho_Chi_Minh`.
3. **MathJax (công thức)**: Site admin → Plugins → Filters → Manage filters → bật **MathJax** + **TeX notation**.
4. **MathType (soạn công thức WYSIWYG)**: cài `filter_wiris` + `tiny_wiris` → bật filter WIRIS.
5. **Email**: cấu hình SMTP (Site admin → Server → Email) để gửi thông báo/đặt lại mật khẩu.
6. **Bảo mật quiz**: cài **Safe Exam Browser** access rule (core) — Site admin → Plugins → Activity modules → Quiz → Safe Exam Browser.
7. **Web services** (nếu cần API): Site admin → Advanced features → bật web services; tạo token cho script di trú.
8. **Theme**: cài `theme_boost_union` hoặc `theme_moove`, tuỳ biến logo/màu FSchools.

## D. Plugin cần cài (đối chiếu version 4.5 ở moodle.org/plugins)
`qtype_ordering`, `qtype_mtf`, `qformat_wordtable`, `filter_wiris`+`tiny_wiris`, `quizaccess_seb` (core), `quizaccess_proctoring`, `block_configurable_reports` (tuỳ chọn), theme.
**Custom tự viết:** `qtype_underline`, plugin nhắn tin giám thị, block nhận xét AI.

> Cài contrib: tải .zip từ moodle.org/plugins → Site admin → Plugins → Install plugins → upload → chạy upgrade. (Hoặc giải nén vào đúng thư mục source rồi vào Notifications.)
