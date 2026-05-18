"use client";

import { EXAM_CATALOG } from "../data/exam-catalog";

import { ExamCard } from "./exam-card";

export function AvailableExamsSection() {
  return (
    <section className="mb-7">
      <h2 className="text-eyebrow mb-3">Sẵn sàng làm</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXAM_CATALOG.map((exam) => (
          <ExamCard key={exam.examId} exam={exam} />
        ))}
      </div>
    </section>
  );
}
