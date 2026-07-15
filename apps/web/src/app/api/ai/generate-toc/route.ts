import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyCaller } from "@/lib/api-auth";

import {
  aiComplete,
  AiProviderError,
  type AiContentPart,
} from "@/lib/ai/provider";

const Body = z.object({
  text: z.string().max(20000).optional(),
  /** Optional data URL of an image (e.g. SGK scan) — uses provider vision. */
  imageDataUrl: z
    .string()
    .startsWith("data:image/")
    .max(8_000_000)
    .optional(),
  subject: z.string().optional(),
  grade: z.string().optional(),
});

const SYSTEM_PROMPT = `Bạn là chuyên viên thiết kế chương trình giáo dục phổ thông Việt Nam.

Nhiệm vụ: từ nội dung được cung cấp (text mô tả hoặc ảnh trang sách SGK), trích xuất mục lục theo CẤU TRÚC 4 CẤP của FPT Schools:

  Cấp 1 — Chương     (eg: "Đạo hàm", "Phương trình bậc hai")
  Cấp 2 — Chủ đề    (eg: "Đạo hàm hàm hợp", "Phương trình quy về bậc hai")
  Cấp 3 — Chủ điểm  (eg: "Quy tắc đạo hàm hàm hợp", "Biến đổi đặt ẩn phụ")
  Cấp 4 — Kỹ năng   (eg: "Áp dụng quy tắc dây chuyền", "Giải bằng đặt t=x²")

YÊU CẦU OUTPUT — TRẢ VỀ DUY NHẤT MỘT JSON OBJECT (không kèm markdown fence, không kèm preamble):

{
  "tree": [
    {
      "name": "Tên chương",
      "children": [
        {
          "name": "Tên chủ đề",
          "children": [
            { "name": "Tên chủ điểm",
              "children": [ { "name": "Tên kỹ năng" } ]
            }
          ]
        }
      ]
    }
  ]
}

Quy tắc:
- Tối đa 4 cấp lồng nhau (chương → chủ đề → chủ điểm → kỹ năng).
- Không cấp nào bắt buộc có children — kết thúc sớm OK.
- Tên ngắn gọn (≤ 80 ký tự), không kèm số thứ tự đầu (vd: "Đạo hàm" thay vì "1. Đạo hàm").
- Map đa dạng nguồn về cấp 1 = "chương": "Unit", "Module", "Bài", "Chapter", "Part", "Chương" đều là cấp 1.
- Map cấp 2 = "chủ đề": Section, Lesson, Tiết, mục con đầu tiên.
- Giữ tên gốc nếu nguồn là Tiếng Anh (vd: "Unit 1 - My new school" → name = "My new school" hoặc giữ nguyên).
- Luôn cố gắng xây dựng cây kể cả khi input ngắn — chỉ trả về { "tree": [] } nếu input thật sự không có cấu trúc.
- KHÔNG kèm trường nào khác ngoài "tree".`;

export async function POST(request: Request) {
  const gate = await verifyCaller(request, { staffOnly: true });
  if ("error" in gate) return gate.error;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "invalid_body",
        message: err instanceof Error ? err.message : "Body không hợp lệ",
      },
      { status: 400 },
    );
  }

  if (!body.text && !body.imageDataUrl) {
    return NextResponse.json(
      { error: "no_input", message: "Cần ít nhất 1 trong text hoặc ảnh." },
      { status: 400 },
    );
  }

  const ctx: string[] = [];
  if (body.subject) ctx.push(`Môn: ${body.subject}`);
  if (body.grade) ctx.push(`Khối: ${body.grade}`);
  const ctxLine = ctx.length > 0 ? `${ctx.join(" · ")}\n\n` : "";
  const text = body.text?.trim() ?? "";
  const prompt = text
    ? `${ctxLine}Phân tích nội dung dưới đây và trích xuất mục lục theo cấu trúc 4 cấp:\n\n${text}`
    : `${ctxLine}Phân tích ảnh đính kèm (trang sách / mục lục) và trích xuất mục lục theo cấu trúc 4 cấp.`;

  const userParts: AiContentPart[] = [];
  if (body.imageDataUrl) {
    userParts.push({ type: "image", dataUrl: body.imageDataUrl });
  }
  userParts.push({ type: "text", text: prompt });

  try {
    const { text: aiText, provider } = await aiComplete({
      system: SYSTEM_PROMPT,
      user: userParts,
      maxTokens: 4000,
      expectJson: true,
    });

    const parsed = parseTocJson(aiText);
    if (!parsed) {
      return NextResponse.json(
        {
          error: "parse_failed",
          message: "AI không trả về JSON hợp lệ.",
          raw: aiText,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ tree: parsed, provider });
  } catch (err) {
    if (err instanceof AiProviderError) {
      return NextResponse.json(
        { error: "ai_failed", message: err.message, hint: err.hint },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        error: "unknown",
        message: err instanceof Error ? err.message : "Không xác định",
      },
      { status: 500 },
    );
  }
}

/** Try to parse AI output as a TOC JSON. Tolerates leading/trailing junk. */
function parseTocJson(raw: string): TocNode[] | null {
  const startIdx = raw.indexOf("{");
  const endIdx = raw.lastIndexOf("}");
  if (startIdx < 0 || endIdx <= startIdx) return null;
  const candidate = raw.slice(startIdx, endIdx + 1);

  try {
    const data = JSON.parse(candidate);
    if (!data || typeof data !== "object" || !Array.isArray(data.tree)) return null;
    return normalizeNodes(data.tree, 0);
  } catch {
    return null;
  }
}

interface TocNode {
  name: string;
  children?: TocNode[];
}

function normalizeNodes(arr: unknown, depth: number): TocNode[] {
  if (!Array.isArray(arr)) return [];
  if (depth >= 4) return [];
  const out: TocNode[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const node = item as { name?: unknown; children?: unknown };
    if (typeof node.name !== "string") continue;
    const name = node.name.trim().slice(0, 200);
    if (!name) continue;
    const children = normalizeNodes(node.children, depth + 1);
    out.push(children.length > 0 ? { name, children } : { name });
  }
  return out;
}
