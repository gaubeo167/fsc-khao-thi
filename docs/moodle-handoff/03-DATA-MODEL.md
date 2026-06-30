# Mô hình dữ liệu (tham chiếu cho di trú)

Tóm tắt 20 thực thể + quan hệ của hệ thống cũ (Firestore). Dùng để viết converter (câu hỏi → Moodle XML; người dùng/lớp → CSV). Schema Prisma đầy đủ ở repo cũ `prisma/schema-fsc.prisma`.

> Mọi thực thể đều có `id` chuỗi (vd `U-401`, `Q-0001`, `SH-0001`), `createdAt`, đa số có `updatedAt`. Nhiều thực thể có versioning (`version`, `versionOfRootId`) + archive (`archivedAt/By/Reason`).

---

## Danh mục
- **User**: id, email, name, **role** (superadmin|academic-director|campus-admin|subject-lead|teacher|student), campusId, subject?, className?, subjectIds[], gradeIds[], classIds[], studentCode?, username?, parentPhone/Email?, contactEmail?, permissions{canCreateBlueprint/Package/Shift}, status(active|suspended|invited).
- **Campus**: id, code, name, region(Bắc|Trung|Nam), tier, gradeIds[], address?, phone?, status.
- **Subject**: id, code, name, description, color, gradeIds[], campusIds[], status.
- **Grade**: id, code, name, order, classCount, studentCount, status.
- **SchoolClass** (classes): id, gradeId, code, name, homeroomTeacher, homeroomTeacherId?, studentCount, campusId, status.
- **TocNode** (toc_nodes): id, subjectId, gradeId?, parentId?, name, order.
- **TeachingAssignment**: id, classId, subjectId, teacherId.

## Nội dung
- **Question** (12 loại): BaseQuestion{ id, type, content, explanation?, subjectId, gradeId?, tocNodeId?, **difficulty**(easy|medium|hard), tags[], ownerId, ownerName, **kho**(personal|campus), campusId?, **status**(draft|pending|approved|rejected) } + field theo loại:
  - mcq-single/multi: `options[]{id,content,isCorrect}`
  - true-false: `correctAnswer:boolean`
  - multi-tf: `subQuestions[]{id,statement,correctAnswer}`
  - short-answer: `acceptedAnswers[]`, `caseSensitive`
  - fill-blank: `blanks[]{acceptedAnswers[]}`
  - matching: `pairs[]{id,left,right}`, `distractors[]{id,right}`
  - ordering: `items[]{id,content}`
  - drag-drop: `zones[]{id,correctContent}`, `distractors[]{id,content}`
  - essay: `rubric[]{id,label,points}`, `wordMin?`, `wordMax?`, `aiAssist?`
  - underline: đánh dấu `[u:...]` trong `content`
  - ai-generated: `prompt`
- **Blueprint**: id, name, subjectId, gradeId, duration, campusId?, ownerId, topics[]{id,name,pickedQuestionIds[]}.
- **Package**: id, name, blueprintId, duration, campusId?, matrix[]{topicId,easyCount,mediumCount,hardCount}, **status**.
- **GeneratedExam**: id, name, packageId, questionIds[], duration. *(chỉ localStorage ở bản cũ)*
- **LearningMaterial**: id, title, sourceType(upload|link), fileType, storagePath, downloadUrl, externalUrl?, subjectId, gradeId?, classIds[], tocNodeId?, tags[], kho, status, ownerId, campusId.

## Thi
- **Shift**: id, name, gradeId, subjectId, classIds[], packageId, startAt, endAt, lateJoinMinutes, **rooms[]**{id,name,capacity,classIds[],studentIds[],proctorIds[]}, **scoring**{maxScore,mode,difficultyWeights?,perQuestion?}, studentResultVisibility?, **antiCheat**{9 cờ boolean}, campusId?, ownerId, status.
- **ExamForm** (snapshot): id, shiftId, packageId, blueprintId, maxScore, durationMinutes, variants[]{variantId,name,questions:QuestionSnapshot[],perQuestion}, integrityHash, materializedAt/By, lifecycle.
- **ExamAttempt** (attempts): id, shiftId, studentId, campusId?, questionIds[], examFormId?, variantId?, **answers**{questionId→Answer(union)}, markedForReview[], startedAt, submittedAt?, **score**(0–100 %), **maxScore**(số câu), correctCount, violations{tabSwitches,fullscreenExits,pasteAttempts}, recentEvents[]. *(LƯU Ý: score là %, không phải /10)*

## BTVN
- **Homework**: id, title, description?, subjectId, gradeId?, classIds[], studentIds[]?, questionIds[], materialIds[], assignedAt("YYYY-MM-DD"), dueAt, campusId?, ownerId, **status**(draft|published|closed).
- **HomeworkAttempt**: id, homeworkId, studentId, answers{}, markedForReview[], startedAt, submittedAt?, correctCount, totalQuestions.

## Chấm / Giám sát / Audit
- **GradingAssignment**: id, shiftId, graderId, graderName, assignedBy/Name, assignedAt, campusId?, note?.
- **EssayGrade** (grades_essay): id, attemptId, shiftId, studentId, questionId, graderId, rubricScores{criterionId→số}, totalPoints, maxPoints, comment, gradedAt.
- **ProctorEvent**: id, shiftId, studentId, proctorId, proctorName, kind(warning|violation|info), body, tag?, createdAt, acknowledgedAt?.
- **AuditEvent**: id, entityType, entityId, action, before?, after?, actorUid, actorRole, actorName?, campusId?, at, reason?.

---

## Quan hệ chính (để map Moodle)
- User.campusId → Campus · User.classIds[] → Class · (HS↔Lớp: Class + User.className)
- Question.subjectId/gradeId/tocNodeId → Subject/Grade/TocNode · Question.ownerId → User
- Blueprint.topics[].pickedQuestionIds[] → Question
- Package.blueprintId → Blueprint · GeneratedExam.packageId → Package
- Shift.packageId → Package · Shift.classIds[] → Class · Shift.rooms[].studentIds/proctorIds → User
- ExamForm.shiftId → Shift · ExamAttempt.shiftId/studentId/examFormId → Shift/User/ExamForm
- Homework.questionIds[]/materialIds[]/classIds[]/studentIds[] → Question/Material/Class/User
- EssayGrade.attemptId/questionId/graderId → Attempt/Question/User

## Ánh xạ sang Moodle (tóm tắt)
| Firestore | Moodle |
|---|---|
| User | mdl_user (+ role assignment theo context) |
| Campus/Subject/Grade/Class | Category / Course / Cohort / Group |
| Question (+các loại) | Question bank (qtype tương ứng — xem 05-QUESTION-CONVERTER) |
| Blueprint/Package/Generated | Question categories + Quiz random questions |
| Shift | Quiz activity |
| ExamForm/Attempt | (Moodle tự quản lý qua quiz attempts; KHÔNG import lịch sử) |
| Homework | Quiz/Assignment |
| LearningMaterial | Resource (File/URL/…) |
| EssayGrade | Quiz manual grade + rubric |
| AuditEvent | Moodle Logs |
