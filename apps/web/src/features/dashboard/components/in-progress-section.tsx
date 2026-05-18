"use client";

import { ArrowRight, Clock } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatRemaining } from "@/lib/format";

import { getCatalogExam } from "../data/exam-catalog";
import type { MyAttemptItem } from "../hooks/use-my-attempts";

interface InProgressSectionProps {
  items: MyAttemptItem[];
}

export function InProgressSection({ items }: InProgressSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-7">
      <h2 className="text-eyebrow mb-3">Đang làm dở</h2>
      <div className="space-y-3">
        {items.map((item) => {
          if (!item.attempt) return null;
          const exam = getCatalogExam(item.attempt.examId);
          return (
            <Card key={item.id} className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-card-title">
                      {exam?.title ?? item.attempt.examId}
                    </h3>
                    <Badge variant="warning" className="gap-1">
                      <Clock className="h-3 w-3" />
                      Còn {formatRemaining(item.attempt.remainingTimeMs)}
                    </Badge>
                  </div>
                  <p className="text-meta">
                    Đã trả lời {item.attempt.responses.length}
                    {exam ? ` / ${exam.questionCount}` : ""} câu · Bắt đầu{" "}
                    {new Date(item.attempt.startedAt).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </p>
                </div>
                <Button asChild>
                  <Link href={`/attempts/${item.id}`}>
                    Tiếp tục
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
