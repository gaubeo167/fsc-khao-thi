"use client";

import { Lock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LockedStateProps {
  status: string;
  submittedAt: string | null;
}

export function LockedState({ status, submittedAt }: LockedStateProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-6 px-4 py-24">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <Card className="w-full text-center">
        <CardHeader>
          <CardTitle>Bài thi đã khóa</CardTitle>
          <CardDescription>
            {status === "SUBMITTED"
              ? `Đã nộp ${
                  submittedAt
                    ? new Date(submittedAt).toLocaleString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                      })
                    : ""
                }`
              : status === "EXPIRED"
                ? "Đã hết giờ làm bài"
                : `Trạng thái: ${status}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/dashboard">Quay lại bảng điều khiển</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
