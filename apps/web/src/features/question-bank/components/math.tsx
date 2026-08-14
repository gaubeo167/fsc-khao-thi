"use client";

import katex from "katex";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

interface MathProps {
  tex: string;
  displayMode?: boolean;
  className?: string;
  /** Optional click handler — used to make rendered formulas editable. */
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
}

/**
 * KaTeX-rendered math fragment. Errors are swallowed and the raw LaTeX is
 * shown in a destructive tint so authors can spot syntax issues at a glance.
 *
 * BẢO MẬT — nhánh lỗi TUYỆT ĐỐI không được đi qua dangerouslySetInnerHTML.
 *
 * Bản trước trả về `{ html: tex }` khi katex.renderToString ném lỗi, và chuỗi
 * đó được nhét thẳng vào dangerouslySetInnerHTML bên dưới. Đó là stored XSS
 * chạy vào trình duyệt HỌC SINH ĐANG THI, vì component này nằm dưới
 * RenderedContent, thứ mà exam-runtime.tsx và question-renderer.tsx dùng để
 * hiển thị đề bài.
 *
 * Chuỗi khai thác đã dựng lại được:
 *   tex = '{'.repeat(60000) + '<img src=x onerror=…>'
 *   → KaTeX ném RangeError (đệ quy quá sâu, KHÔNG phải ParseError nên
 *     throwOnError:false không đỡ được)
 *   → nhánh catch trả tex thô
 *   → dangerouslySetInnerHTML chạy thẻ img → onerror thực thi.
 *
 * Ngoài ra 4 kiểu dữ liệu không phải chuỗi (undefined/null/số/object) cũng
 * làm KaTeX ném TypeError và rơi vào đúng nhánh đó.
 *
 * Lưu ý `throwOnError: false` và `trust: false` vẫn đúng và vẫn cần: lỗi cú
 * pháp LaTeX thường được KaTeX escape đàng hoàng (đã kiểm chứng), và
 * trust:false chặn \href/\includegraphics nhét javascript:. Lỗ hổng nằm ở
 * nhánh dự phòng của CHÍNH file này, không phải ở KaTeX.
 */
export function Math({ tex, displayMode = false, className, onClick }: MathProps) {
  const result = useMemo(() => {
    // Chặn sớm kiểu dữ liệu sai để khỏi phụ thuộc vào việc KaTeX ném lỗi.
    if (typeof tex !== "string") return { html: null, error: true };
    try {
      const html = katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        strict: "ignore",
        output: "html",
        trust: false,
      });
      return { html, error: false };
    } catch {
      // KHÔNG trả tex về dạng HTML. Nhánh render bên dưới sẽ in nó ra như
      // văn bản thuần, để React tự escape.
      return { html: null, error: true };
    }
  }, [tex, displayMode]);

  if (displayMode) {
    const cls = cn(
      "block my-1.5 cursor-text",
      onClick && "rounded hover:bg-primary/10",
      result.error && "text-destructive font-mono text-meta",
      className,
    );
    // Nhánh lỗi: in ra như văn bản thuần (React tự escape), không innerHTML.
    if (result.error) {
      return (
        <span className={cls} onClick={onClick}>
          {String(tex)}
        </span>
      );
    }
    return (
      <span
        className={cls}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: result.html! }}
      />
    );
  }

  const cls = cn(
    "inline-block align-middle",
    onClick && "cursor-pointer rounded px-0.5 hover:bg-primary/10 hover:outline hover:outline-1 hover:outline-primary/30",
    result.error && "text-destructive font-mono text-meta",
    className,
  );
  if (result.error) {
    return (
      <span className={cls} onClick={onClick}>
        {String(tex)}
      </span>
    );
  }
  return (
    <span
      className={cls}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: result.html! }}
    />
  );
}
