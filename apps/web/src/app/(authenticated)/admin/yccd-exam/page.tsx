"use client";

import { PageHeader } from "@/features/shell/components/page-header";
import { YccdWizard } from "@/features/exams/components/yccd-wizard/yccd-wizard";

export default function YccdExamPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Tạo đề theo YCCĐ"
        description="Bốc đề theo Yêu cầu cần đạt + ma trận (Bài × cấu phần × mức Bloom) theo chuẩn Bộ GD. Cấu phần đề tuỳ biến 2–4 phần."
      />
      <YccdWizard />
    </div>
  );
}
