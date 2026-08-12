"use client";

import { PageHeader } from "@/features/shell/components/page-header";
import { YccdExamManager } from "@/features/exams/components/yccd-wizard/yccd-exam-manager";

export default function YccdExamPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Đề theo YCCĐ"
        description="Danh sách đề đã tạo theo Yêu cầu cần đạt. Tạo đề mới, sửa (nếu chưa dùng ở ca thi) hoặc nhân bản để sửa. Ma trận Bài × cấu phần × mức Bloom theo chuẩn Bộ GD."
      />
      <YccdExamManager />
    </div>
  );
}
