"use client";

interface WelcomeBannerProps {
  name: string;
  availableCount: number;
  inProgressCount: number;
}

export function WelcomeBanner({ name, availableCount, inProgressCount }: WelcomeBannerProps) {
  return (
    <section className="mb-7">
      <h1 className="text-page-title">Xin chào, {name}</h1>
      <p className="text-small mt-1 text-muted-foreground">
        {inProgressCount > 0
          ? `Bạn có ${inProgressCount} bài đang làm dở. `
          : ""}
        {availableCount > 0
          ? `${availableCount} đề thi đang sẵn sàng cho bạn.`
          : "Hiện không có đề thi nào sẵn sàng."}
      </p>
    </section>
  );
}
