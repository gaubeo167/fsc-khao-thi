"use client";

import {
  Bold,
  Divide,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Music,
  Palette,
  Pencil,
  Sigma,
  Sparkles,
  Strikethrough,
  Subscript,
  Superscript,
  Type as TypeIcon,
  Underline,
  Video,
} from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

import { AiAssistDialog, type AiContext } from "./ai-assist-dialog";
import { WysiwygEditor, type WysiwygApi } from "./wysiwyg-editor";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  invalid?: boolean;
  aiContext?: AiContext;
  /** Show the "+ Thêm ô trống" button (only relevant for fill-blank questions). */
  showBlankButton?: boolean;
  /** Show the "+ Chèn vùng thả" button (only relevant for drag-drop questions). */
  showZoneButton?: boolean;
  /** Show the "Đánh dấu gạch chân" button (only relevant for underline questions). */
  showUnderlineButton?: boolean;
  /** Hide the AI-assist button entirely. Used by student-facing inputs
   *  (essay / ai-generated answer) where AI generation would defeat the
   *  point of the assessment. */
  hideAi?: boolean;
  /** Forwarded to WysiwygEditor — fires with the ORIGINAL 1-based
   *  index of a blank chip when the teacher clicks it to delete. The
   *  fill-blank form uses this to splice the matching `blanks[i]` so
   *  answers below renumber with the chips. */
  onBlankDeleted?: (deletedIndex: number) => void;
}

export function ContentEditor({
  value,
  onChange,
  placeholder = "Nhập đề bài câu hỏi…",
  minHeight = 140,
  invalid,
  aiContext,
  showBlankButton,
  showZoneButton,
  showUnderlineButton,
  hideAi,
  onBlankDeleted,
}: Props) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <>
      <WysiwygEditor
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        invalid={invalid}
        onBlankDeleted={onBlankDeleted}
        toolbar={(api) => (
          <Toolbar
            api={api}
            onAi={() => setAiOpen(true)}
            showBlankButton={showBlankButton}
            showZoneButton={showZoneButton}
            showUnderlineButton={showUnderlineButton}
            hideAi={hideAi}
          />
        )}
      />
      <p className="text-meta mt-1.5 px-0.5">
        Chọn chữ rồi bấm <b>B</b> / <i>I</i> / <u>U</u> để áp dụng định dạng
        trực tiếp · gõ <code className="rounded bg-muted px-1 font-mono text-[11px]">$\frac{"{1}{2}"}$</code>{" "}
        để tự chuyển thành công thức
      </p>

      {!hideAi && (
        <AiAssistDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          intent="question-content"
          context={aiContext}
          onAccept={(text) => {
            onChange(value ? `${value}\n\n${text}` : text);
          }}
        />
      )}
    </>
  );
}

const FONT_SIZES = [
  { label: "Nhỏ", value: "12px" },
  { label: "Mặc định", value: "14px" },
  { label: "Vừa", value: "16px" },
  { label: "Lớn", value: "20px" },
  { label: "Rất lớn", value: "24px" },
];
const FONT_FAMILIES = [
  { label: "Inter (mặc định)", value: "Inter, system-ui, sans-serif" },
  { label: "Serif", value: 'Georgia, "Times New Roman", serif' },
  { label: "Mono", value: '"JetBrains Mono", Menlo, monospace' },
  { label: "Sans cứng", value: "Arial, Helvetica, sans-serif" },
];
const TEXT_COLORS = [
  "#0F172A",
  "#DC2626",
  "#2563EB",
  "#16A34A",
  "#CA8A04",
  "#7C3AED",
  "#EA580C",
  "#0891B2",
];

function Toolbar({
  api,
  onAi,
  showBlankButton,
  showZoneButton,
  showUnderlineButton,
  hideAi,
}: {
  api: WysiwygApi;
  onAi: () => void;
  showBlankButton?: boolean;
  showZoneButton?: boolean;
  showUnderlineButton?: boolean;
  hideAi?: boolean;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);

  return (
    <>
      {/* Format: B / I / U / S */}
      <IconButton size="sm" title="Đậm (Ctrl+B)" onClick={() => api.format("bold")}>
        <Bold className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton size="sm" title="Nghiêng (Ctrl+I)" onClick={() => api.format("italic")}>
        <Italic className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton size="sm" title="Gạch chân (Ctrl+U)" onClick={() => api.format("underline")}>
        <Underline className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton size="sm" title="Gạch ngang" onClick={() => api.format("strikeThrough")}>
        <Strikethrough className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      {/* Color picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setColorOpen((o) => !o);
            setSizeOpen(false);
            setFontOpen(false);
          }}
          title="Màu chữ"
          className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-1 text-[12px] hover:bg-accent"
        >
          <Palette className="h-3.5 w-3.5" strokeWidth={1.85} />
        </button>
        {colorOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 flex items-center gap-1.5 rounded-md border bg-popover p-2 shadow-md">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  api.setColor(c);
                  setColorOpen(false);
                }}
                aria-label={`Màu ${c}`}
                className="h-5 w-5 rounded-full border border-white shadow ring-1 ring-border hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              defaultValue="#0F172A"
              onChange={(e) => {
                api.setColor(e.target.value);
                setColorOpen(false);
              }}
              className="h-5 w-7 cursor-pointer rounded border"
              title="Màu khác"
            />
          </div>
        )}
      </div>

      {/* Font size */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setSizeOpen((o) => !o);
            setColorOpen(false);
            setFontOpen(false);
          }}
          title="Cỡ chữ"
          className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-1 text-[12px] hover:bg-accent"
        >
          <TypeIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
        </button>
        {sizeOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
            {FONT_SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  api.setFontSize(s.value);
                  setSizeOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-accent"
                style={{ fontSize: s.value }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font family */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setFontOpen((o) => !o);
            setColorOpen(false);
            setSizeOpen(false);
          }}
          title="Kiểu chữ"
          className="inline-flex items-center rounded-md border bg-card px-2 py-1 text-[12px] font-semibold hover:bg-accent"
        >
          Aa
        </button>
        {fontOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  api.setFontFamily(f.value);
                  setFontOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left text-[13px] hover:bg-accent"
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      <IconButton size="sm" title="Chỉ số trên (x²)" onClick={() => api.wrap("^{", "}", "n")}>
        <Superscript className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chỉ số dưới (x₂)" onClick={() => api.wrap("_{", "}", "n")}>
        <Subscript className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton
        size="sm"
        variant="primary"
        title="Công thức toán (LaTeX)"
        onClick={api.openMath}
      >
        <Sigma className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>
      <IconButton size="sm" title="Chèn phân số" onClick={api.openFraction}>
        <Divide className="h-3.5 w-3.5" strokeWidth={2} />
      </IconButton>

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      <IconButton size="sm" title="Chèn ảnh" onClick={() => api.openMedia("image")}>
        <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Vẽ hình" onClick={api.openDrawing}>
        <Pencil className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chèn video" onClick={() => api.openMedia("video")}>
        <Video className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chèn audio" onClick={() => api.openMedia("audio")}>
        <Music className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Chèn liên kết" onClick={() => api.openMedia("link")}>
        <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>

      <span aria-hidden className="mx-1 h-4 w-px bg-border" />

      <IconButton size="sm" title="Danh sách dấu" onClick={() => api.wrap("\n- ", "")}>
        <List className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>
      <IconButton size="sm" title="Danh sách số" onClick={() => api.wrap("\n1. ", "")}>
        <ListOrdered className="h-3.5 w-3.5" strokeWidth={1.85} />
      </IconButton>

      {showBlankButton && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title="Thêm ô trống (cho câu hỏi điền khuyết)"
            onClick={api.insertBlank}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/8 px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary/15"
          >
            <span className="text-base leading-none">＋</span>
            Thêm ô trống
          </button>
        </>
      )}

      {showZoneButton && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title="Chèn vùng thả vào đề bài (cho câu hỏi kéo thả)"
            onClick={api.insertZone}
            className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-700 hover:bg-amber-100"
          >
            <span className="text-base leading-none">＋</span>
            Chèn vùng thả
          </button>
        </>
      )}

      {showUnderlineButton && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title="Bôi đen từ/cụm muốn học sinh gạch chân, rồi bấm nút này"
            onClick={api.markUnderline}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500 bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <span className="underline decoration-2 decoration-emerald-600 underline-offset-2">
              Ab
            </span>
            Đánh dấu gạch chân
          </button>
        </>
      )}

      {!hideAi && (
        <>
          <span aria-hidden className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title="AI hỗ trợ tạo nội dung"
            onClick={onAi}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            AI
          </button>
        </>
      )}
    </>
  );
}
