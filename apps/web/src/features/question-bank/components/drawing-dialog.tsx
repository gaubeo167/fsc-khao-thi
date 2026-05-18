"use client";

import {
  Check,
  Circle,
  Droplet,
  Eraser,
  Minus,
  Palette,
  Pencil,
  Pipette,
  Redo,
  Square,
  Trash2,
  Triangle,
  Type as TypeIcon,
  Undo,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (dataUrl: string) => void;
}

type Tool =
  | "pen"
  | "highlight"
  | "eraser"
  | "rect"
  | "rect-fill"
  | "ellipse"
  | "ellipse-fill"
  | "line"
  | "arrow"
  | "triangle"
  | "fill"
  | "eyedropper"
  | "text";

const PRESET_COLORS = [
  "#0F172A",
  "#FFFFFF",
  "#64748B",
  "#DC2626",
  "#F97316",
  "#EAB308",
  "#16A34A",
  "#0891B2",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#9F1239",
];
const STROKE_SIZES = [2, 4, 6, 10, 16, 24];
const CANVAS_W = 1100;
const CANVAS_H = 660;

export function DrawingDialog({ open, onOpenChange, onInsert }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const movedRef = useRef(false);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#0F172A");
  const [size, setSize] = useState(4);
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);

  const getCtx = useCallback((): CanvasRenderingContext2D | null => {
    const c = canvasRef.current;
    if (!c) return null;
    if (!c.dataset.inited) {
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      historyRef.current = [ctx.getImageData(0, 0, CANVAS_W, CANVAS_H)];
      redoRef.current = [];
      c.dataset.inited = "1";
      return ctx;
    }
    return c.getContext("2d", { willReadFrequently: true });
  }, []);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (c) {
      delete c.dataset.inited;
      historyRef.current = [];
      redoRef.current = [];
    }
    setTextInput(null);
  }, [open]);

  function clientToCanvas(clientX: number, clientY: number) {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }

  function pushHistory(ctx: CanvasRenderingContext2D) {
    const snap = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    historyRef.current.push(snap);
    redoRef.current = [];
    if (historyRef.current.length > 60) historyRef.current.shift();
  }

  /* ─────── Tool actions ─────── */

  function pickColorAt(x: number, y: number) {
    const ctx = getCtx();
    if (!ctx) return;
    const px = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    setColor(rgbToHex(px[0], px[1], px[2]));
    setTool("pen"); // switch back to drawing
  }

  function floodFill(x: number, y: number, fillHex: string) {
    const ctx = getCtx();
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const data = img.data;
    const startX = Math.round(x);
    const startY = Math.round(y);
    if (startX < 0 || startY < 0 || startX >= CANVAS_W || startY >= CANVAS_H) return;
    const idx = (startY * CANVAS_W + startX) * 4;
    const targetR = data[idx];
    const targetG = data[idx + 1];
    const targetB = data[idx + 2];
    const [fr, fg, fb] = hexToRgb(fillHex);
    if (targetR === fr && targetG === fg && targetB === fb) return;

    const stack: Array<[number, number]> = [[startX, startY]];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      let nx = cx;
      // Scan left to find leftmost matching pixel on this row
      while (nx >= 0 && match(nx, cy)) nx--;
      nx++;
      let spanAbove = false;
      let spanBelow = false;
      while (nx < CANVAS_W && match(nx, cy)) {
        setPx(nx, cy);
        if (!spanAbove && cy > 0 && match(nx, cy - 1)) {
          stack.push([nx, cy - 1]);
          spanAbove = true;
        } else if (spanAbove && cy > 0 && !match(nx, cy - 1)) {
          spanAbove = false;
        }
        if (!spanBelow && cy < CANVAS_H - 1 && match(nx, cy + 1)) {
          stack.push([nx, cy + 1]);
          spanBelow = true;
        } else if (spanBelow && cy < CANVAS_H - 1 && !match(nx, cy + 1)) {
          spanBelow = false;
        }
        nx++;
      }
    }

    function match(px: number, py: number): boolean {
      const i = (py * CANVAS_W + px) * 4;
      return (
        data[i] === targetR &&
        data[i + 1] === targetG &&
        data[i + 2] === targetB &&
        data[i + 3] === 255
      );
    }
    function setPx(px: number, py: number) {
      const i = (py * CANVAS_W + px) * 4;
      data[i] = fr;
      data[i + 1] = fg;
      data[i + 2] = fb;
      data[i + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
    pushHistory(ctx);
  }

  function startStroke(clientX: number, clientY: number) {
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = clientToCanvas(clientX, clientY);

    // Special one-shot tools
    if (tool === "fill") {
      floodFill(x, y, color);
      return;
    }
    if (tool === "eyedropper") {
      pickColorAt(x, y);
      return;
    }
    if (tool === "text") {
      setTextInput({ x, y, value: "" });
      return;
    }

    drawingRef.current = true;
    movedRef.current = false;
    startRef.current = { x, y };

    if (tool === "pen" || tool === "highlight" || tool === "eraser") {
      ctx.globalAlpha = tool === "highlight" ? 0.35 : 1;
      ctx.strokeStyle = tool === "eraser" ? "#FFFFFF" : color;
      ctx.fillStyle = tool === "eraser" ? "#FFFFFF" : color;
      ctx.lineWidth =
        tool === "eraser" ? size * 3 : tool === "highlight" ? size * 3 : size;
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      // Shape tools: snapshot for live preview
      snapshotRef.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    }
  }

  function extendStroke(clientX: number, clientY: number) {
    if (!drawingRef.current) return;
    const ctx = getCtx();
    if (!ctx || !startRef.current) return;
    movedRef.current = true;
    const { x, y } = clientToCanvas(clientX, clientY);

    if (tool === "pen" || tool === "highlight" || tool === "eraser") {
      ctx.lineTo(x, y);
      ctx.stroke();
      return;
    }

    if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    const s = startRef.current;

    if (tool === "rect") {
      ctx.strokeRect(s.x, s.y, x - s.x, y - s.y);
    } else if (tool === "rect-fill") {
      ctx.fillRect(s.x, s.y, x - s.x, y - s.y);
    } else if (tool === "ellipse" || tool === "ellipse-fill") {
      ctx.beginPath();
      ctx.ellipse(
        (s.x + x) / 2,
        (s.y + y) / 2,
        Math.abs(x - s.x) / 2,
        Math.abs(y - s.y) / 2,
        0,
        0,
        Math.PI * 2,
      );
      if (tool === "ellipse-fill") ctx.fill();
      else ctx.stroke();
    } else if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === "arrow") {
      drawArrow(ctx, s.x, s.y, x, y, size);
    } else if (tool === "triangle") {
      ctx.beginPath();
      ctx.moveTo((s.x + x) / 2, s.y);
      ctx.lineTo(s.x, y);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  function endStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    const ctx = getCtx();
    if (ctx) {
      ctx.globalAlpha = 1;
      if (movedRef.current) pushHistory(ctx);
    }
  }

  function commitText() {
    if (!textInput) return;
    const ctx = getCtx();
    if (!ctx) {
      setTextInput(null);
      return;
    }
    const text = textInput.value.trim();
    if (text) {
      ctx.fillStyle = color;
      ctx.font = `${Math.max(12, size * 4)}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(text, textInput.x, textInput.y);
      pushHistory(ctx);
    }
    setTextInput(null);
  }

  /* ─────── Native event listeners ─────── */

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;

    function onDown(e: PointerEvent | MouseEvent) {
      // Commit any pending text input on a fresh click elsewhere
      if (textInput) {
        commitText();
        return;
      }
      e.preventDefault();
      try {
        if ("pointerId" in e) {
          c!.setPointerCapture((e as PointerEvent).pointerId);
        }
      } catch {
        /* no-op */
      }
      startStroke(e.clientX, e.clientY);
    }
    function onMove(e: PointerEvent | MouseEvent) {
      if (!drawingRef.current) return;
      e.preventDefault();
      extendStroke(e.clientX, e.clientY);
    }
    function onUp() {
      endStroke();
    }

    const usePointer = typeof window !== "undefined" && "PointerEvent" in window;
    if (usePointer) {
      c.addEventListener("pointerdown", onDown);
      c.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      c.addEventListener("pointerleave", onUp);
    } else {
      c.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      c.addEventListener("mouseleave", onUp);
    }

    return () => {
      if (usePointer) {
        c.removeEventListener("pointerdown", onDown);
        c.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        c.removeEventListener("pointerleave", onUp);
      } else {
        c.removeEventListener("mousedown", onDown);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        c.removeEventListener("mouseleave", onUp);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tool, color, size, textInput]);

  /* ─────── History controls ─────── */

  function undo() {
    const ctx = getCtx();
    if (!ctx) return;
    if (historyRef.current.length <= 1) return;
    const popped = historyRef.current.pop();
    if (popped) redoRef.current.push(popped);
    const prev = historyRef.current[historyRef.current.length - 1];
    if (prev) ctx.putImageData(prev, 0, 0);
  }
  function redo() {
    const ctx = getCtx();
    if (!ctx) return;
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(next);
    ctx.putImageData(next, 0, 0);
  }
  function clear() {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    pushHistory(ctx);
  }

  function submit() {
    commitText();
    const c = canvasRef.current;
    if (!c) return;
    getCtx();
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    onInsert(dataUrl);
    onOpenChange(false);
  }

  /* ─────── Render ─────── */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl p-0 max-h-[94vh] overflow-y-auto"
        srTitle="Bảng vẽ"
      >
        <header className="flex items-start gap-3 border-b px-6 py-4 pr-12">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-pink-600 ring-1 ring-pink-200">
            <Pencil className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section-title">Bảng vẽ</h2>
            <p className="text-meta mt-0.5">
              Bút · highlight · tẩy · hình · fill màu · gắp màu · gõ chữ — kết quả
              chèn dưới dạng ảnh vào câu hỏi.
            </p>
          </div>
        </header>

        <div className="space-y-3 px-6 py-4">
          {/* Tool palette — line 1 */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-surface-2 px-3 py-2">
            <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Bút">
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>
            <ToolBtn
              active={tool === "highlight"}
              onClick={() => setTool("highlight")}
              label="Highlight"
            >
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: "rgba(250, 204, 21, 0.6)" }}
              />
            </ToolBtn>
            <ToolBtn
              active={tool === "eraser"}
              onClick={() => setTool("eraser")}
              label="Tẩy"
            >
              <Eraser className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>

            <span className="h-5 w-px bg-border" />

            <ToolBtn
              active={tool === "line"}
              onClick={() => setTool("line")}
              label="Đường thẳng"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2} />
            </ToolBtn>
            <ToolBtn
              active={tool === "arrow"}
              onClick={() => setTool("arrow")}
              label="Mũi tên"
            >
              <span className="inline-block">→</span>
            </ToolBtn>
            <ToolBtn
              active={tool === "rect"}
              onClick={() => setTool("rect")}
              label="Hình chữ nhật"
            >
              <Square className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>
            <ToolBtn
              active={tool === "rect-fill"}
              onClick={() => setTool("rect-fill")}
              label="Hình chữ nhật (đặc)"
            >
              <Square className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
            </ToolBtn>
            <ToolBtn
              active={tool === "ellipse"}
              onClick={() => setTool("ellipse")}
              label="Hình tròn"
            >
              <Circle className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>
            <ToolBtn
              active={tool === "ellipse-fill"}
              onClick={() => setTool("ellipse-fill")}
              label="Hình tròn (đặc)"
            >
              <Circle className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
            </ToolBtn>
            <ToolBtn
              active={tool === "triangle"}
              onClick={() => setTool("triangle")}
              label="Tam giác"
            >
              <Triangle className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>

            <span className="h-5 w-px bg-border" />

            <ToolBtn
              active={tool === "fill"}
              onClick={() => setTool("fill")}
              label="Đổ màu (fill)"
            >
              <Droplet className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>
            <ToolBtn
              active={tool === "eyedropper"}
              onClick={() => setTool("eyedropper")}
              label="Gắp màu (eyedropper)"
            >
              <Pipette className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>
            <ToolBtn
              active={tool === "text"}
              onClick={() => setTool("text")}
              label="Gõ chữ"
            >
              <TypeIcon className="h-3.5 w-3.5" strokeWidth={1.85} />
            </ToolBtn>

            <span className="h-5 w-px bg-border" />

            <button
              type="button"
              onClick={undo}
              disabled={historyRef.current.length <= 1}
              className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium hover:bg-accent disabled:opacity-40"
              title="Hoàn tác (Ctrl+Z)"
            >
              <Undo className="h-3.5 w-3.5" strokeWidth={1.85} />
              Hoàn tác
            </button>
            <button
              type="button"
              onClick={redo}
              className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium hover:bg-accent"
              title="Làm lại (Ctrl+Shift+Z)"
            >
              <Redo className="h-3.5 w-3.5" strokeWidth={1.85} />
              Làm lại
            </button>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[12px] font-medium text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.85} />
              Xoá hết
            </button>
          </div>

          {/* Tool palette — line 2: color + size */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.85} />
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Màu ${c}`}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                    color === c ? "border-foreground" : "border-white shadow",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="ml-1 h-5 w-7 cursor-pointer rounded border"
                title="Bảng màu tự do"
              />
            </div>

            <span className="h-5 w-px bg-border" />

            <div className="flex items-center gap-1">
              <Label className="text-[12px] text-muted-foreground">Cỡ</Label>
              {STROKE_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-md border bg-card transition-colors hover:border-primary/40",
                    size === s && "border-primary bg-primary/10",
                  )}
                  title={`${s}px`}
                >
                  <span
                    className="rounded-full bg-current"
                    style={{
                      width: `${Math.min(s, 16)}px`,
                      height: `${Math.min(s, 16)}px`,
                      color,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Canvas + checkerboard background for transparency clue */}
          <div className="relative overflow-hidden rounded-lg border bg-white">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className={cn(
                "block h-auto w-full select-none touch-none",
                tool === "eyedropper"
                  ? "cursor-copy"
                  : tool === "fill"
                    ? "cursor-cell"
                    : tool === "text"
                      ? "cursor-text"
                      : "cursor-crosshair",
              )}
              style={{
                aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
                touchAction: "none",
              }}
            />
            {textInput && (
              <textarea
                autoFocus
                value={textInput.value}
                onChange={(e) =>
                  setTextInput({ ...textInput, value: e.target.value })
                }
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitText();
                  } else if (e.key === "Escape") {
                    setTextInput(null);
                  }
                }}
                placeholder="Gõ chữ rồi Enter để chèn"
                className="absolute z-10 min-w-[120px] rounded border-2 border-primary bg-white/95 px-1 py-0.5 text-sm outline-none"
                style={{
                  left: `${(textInput.x / CANVAS_W) * 100}%`,
                  top: `${(textInput.y / CANVAS_H) * 100}%`,
                  color,
                  fontSize: `${Math.max(12, size * 4)}px`,
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              />
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t bg-[var(--color-surface-2)] px-6 py-3.5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit}>
            <Check className="h-4 w-4" />
            Chèn hình vẽ
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-foreground/70 hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness: number,
) {
  const headLen = Math.max(12, thickness * 3);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 7),
    y2 - headLen * Math.sin(angle - Math.PI / 7),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 7),
    y2 - headLen * Math.sin(angle + Math.PI / 7),
  );
  ctx.closePath();
  ctx.fill();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const v = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const n = parseInt(v, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (x: number) => x.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}
