"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SubmittedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success)]/15">
        <CheckCircle2 className="h-6 w-6 text-[var(--color-success)]" />
      </div>
      <Card className="w-full text-center">
        <CardHeader>
          <CardTitle>Exam submitted</CardTitle>
          <CardDescription>
            Your answers are locked. Your instructor will release results when grading is complete.
          </CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="justify-center">
          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
