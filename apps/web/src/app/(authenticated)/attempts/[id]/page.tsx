"use client";

import { ArrowLeft, Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAttempt } from "@/features/attempts/api/hooks";
import { ExamRuntime } from "@/features/attempts/components/exam-runtime";
import { useAuthStore } from "@/features/auth/state/auth-store";
import { getBankByExamId } from "@/mocks";

export default function AttemptRuntimePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const rememberAttempt = useAuthStore((s) => s.rememberAttempt);

  const { data: attempt, isPending, error } = useAttempt(id);

  useEffect(() => {
    if (attempt) rememberAttempt(attempt.id);
  }, [attempt, rememberAttempt]);

  if (isPending) {
    return <RecoveryState message="Loading your exam…" />;
  }

  if (error) {
    if (error.status === 404) {
      return (
        <ErrorScreen
          title="Attempt not found"
          description="This attempt link is invalid or has been deleted."
        />
      );
    }
    return (
      <ErrorScreen
        title="Couldn't load your exam"
        description={error.message ?? "Something went wrong. Please try again."}
      />
    );
  }

  const bank = getBankByExamId(attempt.examId);
  if (!bank) {
    return (
      <ErrorScreen
        title="Exam unavailable"
        description={`No question bank registered for "${attempt.examId}".`}
      />
    );
  }

  return <ExamRuntime attempt={attempt} bank={bank} />;
}

function RecoveryState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ErrorScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden />
      </div>
      <Card className="w-full text-center">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="justify-center">
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
