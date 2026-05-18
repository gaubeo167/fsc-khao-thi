"use client";

import { CheckCircle2, TimerOff } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { getCatalogExam } from "../data/exam-catalog";
import type { MyAttemptItem } from "../hooks/use-my-attempts";

interface SubmittedSectionProps {
  items: MyAttemptItem[];
}

export function SubmittedSection({ items }: SubmittedSectionProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-eyebrow mb-3">Đã nộp / Hết giờ</h2>
      <Card>
        <CardContent className="p-0">
          {items.map((item, i) => {
            if (!item.attempt) return null;
            const exam = getCatalogExam(item.attempt.examId);
            const submitted = item.attempt.submittedAt;
            const isExpired = item.attempt.status === "EXPIRED";
            return (
              <div key={item.id}>
                {i > 0 ? <Separator /> : null}
                <Link
                  href={`/attempts/${item.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-accent"
                >
                  <div className="flex items-center gap-3">
                    {isExpired ? (
                      <TimerOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                    )}
                    <div>
                      <p className="text-card-title">{exam?.title ?? item.attempt.examId}</p>
                      <p className="text-meta">
                        {isExpired
                          ? "Đã hết giờ"
                          : `Nộp ${
                              submitted
                                ? new Date(submitted).toLocaleString("vi-VN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    day: "2-digit",
                                    month: "2-digit",
                                  })
                                : ""
                            }`}
                      </p>
                    </div>
                  </div>
                  <span className="text-meta">Xem →</span>
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
