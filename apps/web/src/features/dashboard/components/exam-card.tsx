"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useStartAttempt } from "@/features/attempts/api/hooks";
import { useAuthStore } from "@/features/auth/state/auth-store";

import type { CatalogExam } from "../data/exam-catalog";

interface ExamCardProps {
  exam: CatalogExam;
}

export function ExamCard({ exam }: ExamCardProps) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const rememberAttempt = useAuthStore((s) => s.rememberAttempt);
  const start = useStartAttempt();

  const minutes = Math.round(exam.durationMs / 60_000);

  async function handleStart() {
    if (!session) return;
    const attempt = await start.mutateAsync({
      examId: exam.examId,
      studentId: session.studentId,
      durationMs: exam.durationMs,
    });
    rememberAttempt(attempt.id);
    router.push(`/attempts/${attempt.id}`);
  }

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <Badge variant="outline">{exam.subject}</Badge>
          <Badge variant="secondary">{exam.format}</Badge>
        </div>
        <h3 className="text-section-title leading-snug">{exam.title}</h3>
        <p className="text-small line-clamp-2 text-muted-foreground">{exam.description}</p>
        <p className="text-meta">
          {exam.questionCount} câu · {minutes} phút
        </p>
        <div className="mt-auto pt-2">
          {exam.available ? (
            <Button onClick={handleStart} disabled={start.isPending} className="w-full">
              {start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Bắt đầu
            </Button>
          ) : (
            <Button disabled variant="outline" className="w-full">
              Sắp mở
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
