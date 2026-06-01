"use client";

import katex from "katex";
import { useCallback, useEffect, useRef, useState } from "react";

import { processClipboard } from "./clipboard-math";
import { DrawingDialog } from "./drawing-dialog";
import { FractionInsertDialog } from "./fraction-insert-dialog";
import { MathLiveDialog } from "./mathlive-dialog";
import { classifyMediaUrl } from "./media-utils";
import { MediaInsertDialog, type MediaKind } from "./media-insert-dialog";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  invalid?: boolean;
  /** Optional toolbar rendered above the editor area. */
  toolbar?: React.ReactNode | ((api: WysiwygApi) => React.ReactNode);
  minHeight?: number;
  /** Compact mode used inside answer rows. */
  compact?: boolean;
  /** Fires BEFORE the blank chip is removed from the DOM and the
   *  surviving blanks are renumbered. The argument is the ORIGINAL
   *  1-based index of the deleted blank. The fill-blank form uses
   *  this to splice the matching entry out of its `blanks` array so
   *  the answers below renumber to match the chips. */
  onBlankDeleted?: (deletedIndex: number) => void;
}

export interface WysiwygApi {
  insertMath(tex: string, display: boolean): void;
  openMath(): void;
  openFraction(): void;
  openMedia(kind: MediaKind): void;
  wrap(open: string, close?: string, placeholder?: string): void;
  /** Insert a numbered blank chip at the caret (for fill-blank questions). */
  insertBlank(): void;
  /** Insert a numbered drop-zone chip at the caret (for drag-drop questions). */
  insertZone(): void;
  /** Mark the current text selection as an underline answer (for underline
   *  questions). Wraps the selected text in a `[u:...]` chip. */
  markUnderline(): void;
  /** Apply an inline format to the current selection via execCommand. */
  format(command: "bold" | "italic" | "underline" | "strikeThrough"): void;
  /** Apply a foreground color to the selection (hex like "#FF0000"). */
  setColor(color: string): void;
  /** Apply a font size (CSS-style, e.g. "14px", "1.25em"). */
  setFontSize(size: string): void;
  /** Apply a font family. */
  setFontFamily(family: string): void;
  /** Open the drawing dialog and insert the result as an image chip. */
  openDrawing(): void;
}

interface MathTarget {
  el: HTMLElement;
  tex: string;
  display: boolean;
}

interface MediaTarget {
  el: HTMLElement;
  kind: MediaKind;
  src: string;
  label: string;
}

/**
 * contentEditable WYSIWYG editor. Plain text edits like a normal field;
 * math formulas render as inline KaTeX chips (`contenteditable=false`) that
 * can be clicked to re-edit. Source is serialized back to a markdown-ish
 * string using `$...$` / `$$...$$` delimiters.
 */
export function WysiwygEditor({
  value,
  onChange,
  placeholder,
  invalid,
  toolbar,
  minHeight = 120,
  compact = false,
  onBlankDeleted,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  /** Track the last value we serialized out — used to skip re-renders. */
  const lastSerialized = useRef<string>("");
  /** Most recent caret/selection inside the editor — used to restore the
   *  insertion point after a dialog steals focus. */
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(value.trim().length === 0);

  /** Check if a node is INSIDE (or IS) a chip element. */
  function nodeIsInsideChip(node: Node | null, editor: Element): boolean {
    let n: Node | null = node;
    while (n && n !== editor) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const e = n as Element;
        if (
          e.getAttribute("data-math") === "1" ||
          e.getAttribute("data-image") === "1" ||
          e.getAttribute("data-video") === "1" ||
          e.getAttribute("data-audio") === "1" ||
          e.getAttribute("data-blank") === "1" ||
          e.getAttribute("data-zone") === "1" ||
          e.getAttribute("data-underline") === "1"
        ) {
          return true;
        }
      }
      n = n.parentNode;
    }
    return false;
  }

  /** Capture the current selection if it's inside the editor and NOT inside
   *  a chip element (otherwise insertion would split the chip apart). */
  function captureSelection() {
    const el = ref.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return;
    if (nodeIsInsideChip(range.startContainer, el)) return;
    savedRange.current = range.cloneRange();
  }

  // Document-level selectionchange — catches caret updates the editor's own
  // event handlers miss (especially right before focus jumps to a dialog).
  useEffect(() => {
    function onSelChange() {
      captureSelection();
    }
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External-value sync: only re-render innerHTML when value comes from outside.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastSerialized.current) return;
    el.innerHTML = parseToHtml(value);
    lastSerialized.current = value;
    setEmpty(value.trim().length === 0);
    // Attach resize listeners to image chips that came from parseToHtml.
    el.querySelectorAll<HTMLElement>('[data-image="1"]').forEach(attachImageResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** Attach the drag-resize handler to an image chip's bottom-right handle. */
  function attachImageResize(chip: HTMLElement) {
    const handle = chip.querySelector<HTMLElement>('[data-resize-handle="1"]');
    const imgEl = chip.querySelector<HTMLImageElement>("img");
    if (!handle || !imgEl) return;
    if (handle.dataset.resizeBound === "1") return;
    handle.dataset.resizeBound = "1";
    const target = imgEl; // narrow for closures

    // Block any click / dblclick that originates from the handle.
    handle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    handle.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = target.getBoundingClientRect().width;
      let moved = false;

      function onMove(ev: MouseEvent) {
        moved = true;
        const newW = Math.max(64, Math.round(startW + (ev.clientX - startX)));
        target.style.width = `${newW}px`;
        chip.setAttribute("data-width", String(newW));
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (moved) {
          // The next click on the chip after the drag is a phantom — swallow it
          // once so the upload dialog doesn't pop unexpectedly.
          const swallow = (ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
            document.removeEventListener("click", swallow, true);
            document.removeEventListener("dblclick", swallow, true);
          };
          document.addEventListener("click", swallow, true);
          document.addEventListener("dblclick", swallow, true);
          setTimeout(() => {
            document.removeEventListener("click", swallow, true);
            document.removeEventListener("dblclick", swallow, true);
          }, 300);
          emit();
        }
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = serialize(el);
    lastSerialized.current = next;
    setEmpty(next.trim().length === 0);
    onChange(next);
  }, [onChange]);

  /**
   * Detect `$...$` or `$$...$$` ending at the caret and replace it with a
   * rendered math chip. Triggered after every input event — only fires when
   * the just-typed character is a closing `$` and a matching opener exists.
   */
  function tryAutoConvertMath(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;
    const text = node.textContent ?? "";
    const offset = range.startOffset;
    if (offset === 0 || text[offset - 1] !== "$") return false;

    // Display math: $$...$$
    if (offset >= 4 && text.slice(offset - 2, offset) === "$$") {
      const earlier = text.slice(0, offset - 2);
      const openIdx = earlier.lastIndexOf("$$");
      if (openIdx === -1) return false;
      const tex = earlier.slice(openIdx + 2).trim();
      if (tex.length === 0) return false;
      return performAutoConversion(node, openIdx, offset, tex, true);
    }

    // Inline math: $...$ — but skip if the char before this closing `$` is
    // also `$` (that would be a `$$` opener we shouldn't break).
    if (offset >= 2 && text[offset - 2] === "$") return false;
    const earlier = text.slice(0, offset - 1);
    for (let i = earlier.length - 1; i >= 0; i--) {
      if (earlier[i] !== "$") continue;
      // Skip if part of `$$`
      if (earlier[i - 1] === "$" || earlier[i + 1] === "$") continue;
      const tex = earlier.slice(i + 1);
      if (tex.length === 0 || tex.includes("\n")) return false;
      return performAutoConversion(node, i, offset, tex, false);
    }
    return false;
  }

  function performAutoConversion(
    node: Node,
    startOffset: number,
    endOffset: number,
    tex: string,
    isDisplay: boolean,
  ): boolean {
    const chip = buildMathChip(tex, isDisplay);
    const range = document.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);
    range.deleteContents();
    range.insertNode(chip);

    // Trailing space + cursor after chip
    const space = document.createTextNode(" ");
    chip.parentNode?.insertBefore(space, chip.nextSibling);
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(after);
    return true;
  }

  const handleInput = useCallback(() => {
    tryAutoConvertMath();
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit]);

  /**
   * Insert a markdown-ish snippet at the cursor using a source-level splice.
   *
   * Why not just `range.insertNode(chip)`? Browsers occasionally hand back
   * caret positions that point INSIDE chip elements (the rendered KaTeX
   * HTML) after a dialog focus jump. `range.insertNode` at those positions
   * shreds the prior chip. To dodge that entire class of bug, we:
   *
   *   1. Drop a marker text at the saved caret in the DOM.
   *   2. Serialize the editor → find the marker offset.
   *   3. Splice the snippet (+ a fresh caret marker) into the source.
   *   4. Re-render the editor from the new source.
   *   5. Locate the caret marker in the rebuilt DOM and place the real caret.
   *
   * Bulletproof against range edge cases — every dialog insert is now a
   * clean rebuild instead of a DOM patch.
   */
  function insertSnippetAtCursor(snippet: string) {
    const el = ref.current;
    if (!el) return;
    const POS = ""; // private-use char — never appears in real text

    let markerNode: Text | null = null;
    if (
      savedRange.current &&
      el.contains(savedRange.current.startContainer) &&
      !nodeIsInsideChip(savedRange.current.startContainer, el)
    ) {
      try {
        markerNode = document.createTextNode(POS);
        const r = savedRange.current.cloneRange();
        if (!r.collapsed) r.deleteContents();
        r.insertNode(markerNode);
      } catch {
        markerNode = null;
      }
    }

    const sourceWithMarker = serialize(el);
    let offset: number | null = null;
    if (markerNode) {
      const idx = sourceWithMarker.indexOf(POS);
      if (idx >= 0) offset = idx;
      markerNode.remove();
    }
    const cleanSource = sourceWithMarker.replace(POS, "");
    const insertAt = offset ?? cleanSource.length;

    const withCaret =
      cleanSource.slice(0, insertAt) + snippet + POS + cleanSource.slice(insertAt);
    el.innerHTML = parseToHtml(withCaret);
    el.querySelectorAll<HTMLElement>('[data-image="1"]').forEach(attachImageResize);

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let caretNode: Text | null = null;
    let caretOffset = 0;
    let cur: Node | null;
    while ((cur = walker.nextNode())) {
      const text = cur.textContent ?? "";
      const idx = text.indexOf(POS);
      if (idx >= 0) {
        caretNode = cur as Text;
        caretOffset = idx;
        break;
      }
    }
    const finalSource =
      cleanSource.slice(0, insertAt) + snippet + cleanSource.slice(insertAt);
    if (caretNode) {
      const text = caretNode.textContent ?? "";
      caretNode.textContent =
        text.slice(0, caretOffset) + text.slice(caretOffset + POS.length);
      el.focus();
      const range = document.createRange();
      range.setStart(caretNode, caretOffset);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      savedRange.current = range.cloneRange();
    }

    lastSerialized.current = finalSource;
    setEmpty(finalSource.trim().length === 0);
    onChange(finalSource);
  }

  /** Insert a node at the current selection inside the editor. */
  function insertAtCursor(node: Node) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    let range: Range | null = null;

    // Prefer the most recently saved caret — survives focus loss to a dialog.
    if (
      savedRange.current &&
      el.contains(savedRange.current.startContainer) &&
      !nodeIsInsideChip(savedRange.current.startContainer, el)
    ) {
      range = savedRange.current.cloneRange();
    } else if (
      sel &&
      sel.rangeCount > 0 &&
      el.contains(sel.anchorNode) &&
      sel.anchorNode !== el &&
      !nodeIsInsideChip(sel.anchorNode, el)
    ) {
      range = sel.getRangeAt(0);
    }

    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }

    if (!range.collapsed) range.deleteContents();
    range.insertNode(node);
    // Place cursor after inserted node + add a trailing space so user can type
    const space = document.createTextNode(" ");
    node.parentNode?.insertBefore(space, node.nextSibling);
    range.setStartAfter(space);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    savedRange.current = range.cloneRange();
    emit();
  }

  function buildMathChip(tex: string, display: boolean): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-math", "1");
    span.setAttribute("data-tex", tex);
    span.setAttribute("data-display", String(display));
    span.className = cn(
      "fsc-math-chip mx-0.5 inline-block cursor-pointer rounded px-1.5 py-0.5 align-middle ring-1 ring-primary/25 bg-primary/8 text-primary/95 hover:bg-primary/15 hover:ring-primary/50 transition-colors",
      display && "block mx-0 my-1 px-3 py-2 text-center",
    );
    try {
      span.innerHTML = katex.renderToString(tex, {
        throwOnError: false,
        displayMode: display,
        output: "html",
        strict: "ignore",
      });
    } catch {
      span.textContent = tex;
    }
    return span;
  }

  function buildImageChip(
    src: string,
    alt: string,
    width?: number | null,
  ): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-image", "1");
    span.setAttribute("data-src", src);
    span.setAttribute("data-alt", alt);
    if (width) span.setAttribute("data-width", String(width));
    span.setAttribute("draggable", "true");
    span.className =
      "fsc-image-chip group/img relative my-2 inline-block max-w-full cursor-grab overflow-hidden rounded-lg border bg-surface-2 align-top transition-colors hover:border-primary/40 active:cursor-grabbing";
    span.title = "Double-click để chỉnh sửa · kéo góc để resize · kéo cả ảnh để di chuyển";

    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    img.className =
      "block max-h-[400px] w-full max-w-full object-contain pointer-events-none select-none";
    if (width) img.style.width = `${width}px`;
    span.appendChild(img);

    // Delete button (top-right) — only visible on hover
    const del = document.createElement("button");
    del.type = "button";
    del.setAttribute("contenteditable", "false");
    del.setAttribute("data-image-delete", "1");
    del.draggable = false;
    del.title = "Xoá ảnh";
    del.className =
      "absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/60 bg-black/65 text-white opacity-0 transition-opacity hover:bg-rose-600 group-hover/img:opacity-100";
    del.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    span.appendChild(del);

    // Resize handle (bottom-right corner)
    const handle = document.createElement("span");
    handle.setAttribute("contenteditable", "false");
    handle.setAttribute("data-resize-handle", "1");
    handle.draggable = false;
    handle.className =
      "absolute bottom-1 right-1 z-10 h-4 w-4 cursor-se-resize rounded-sm border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover/img:opacity-100";
    handle.title = "Kéo để chỉnh kích thước";
    span.appendChild(handle);

    attachImageResize(span);
    return span;
  }

  /**
   * Pencil overlay shown in the top-right of media chips on hover — lets the
   * user open the edit dialog even when an iframe/video covers the chip body.
   */
  function buildEditOverlay(kind: "video" | "audio"): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-edit-overlay", "1");
    btn.setAttribute("data-edit-kind", kind);
    btn.contentEditable = "false";
    btn.title = "Chỉnh sửa";
    btn.className =
      "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/60 bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/video:opacity-100";
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
    return btn;
  }

  function buildVideoChip(src: string, label: string): HTMLElement {
    const kind = classifyMediaUrl(src);
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-video", "1");
    span.setAttribute("data-src", src);
    span.setAttribute("data-label", label);
    span.title = "Double-click để chỉnh sửa link / nhãn video";

    // YouTube / Vimeo → iframe embed (16:9 box)
    if (kind.type === "youtube" || kind.type === "vimeo") {
      span.className =
        "fsc-video-chip group/video relative my-2 block overflow-hidden rounded-lg border bg-black";
      const box = document.createElement("span");
      box.className = "block aspect-video w-full";
      const iframe = document.createElement("iframe");
      iframe.src = kind.embedUrl;
      iframe.title = label || "Video";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.className = "block h-full w-full border-0";
      box.appendChild(iframe);
      span.appendChild(box);
      span.appendChild(buildEditOverlay("video"));
      return span;
    }

    // Direct mp4/webm/ogg → native <video> player
    if (kind.type === "direct") {
      span.className =
        "fsc-video-chip group/video relative my-2 block overflow-hidden rounded-lg border bg-black";
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.className = "block max-h-[400px] w-full object-contain";
      span.appendChild(video);
      span.appendChild(buildEditOverlay("video"));
      return span;
    }

    // Unknown URL → fall back to the link card
    span.className =
      "fsc-video-chip my-2 flex cursor-pointer items-center gap-3 rounded-lg border bg-rose-50/50 px-3 py-2.5 text-[13px] ring-1 ring-rose-200 transition-colors hover:bg-rose-50";
    const icon = document.createElement("span");
    icon.className =
      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-600";
    icon.textContent = "▶";
    span.appendChild(icon);
    const meta = document.createElement("span");
    meta.className = "min-w-0 flex-1";
    const title = document.createElement("span");
    title.className = "block font-semibold text-rose-900";
    title.textContent = label || "Video";
    const url = document.createElement("span");
    url.className = "block truncate text-[11px] text-rose-700/80";
    url.textContent = src;
    meta.appendChild(title);
    meta.appendChild(url);
    span.appendChild(meta);
    return span;
  }

  function buildBlankChip(index: number): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-blank", "1");
    span.setAttribute("data-index", String(index));
    span.className =
      "fsc-blank-chip mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-dashed border-primary/70 bg-primary/5 px-2 py-0.5 align-middle text-[13px] font-semibold text-primary";
    span.title = `Ô trống số ${index}`;
    const idx = document.createElement("span");
    idx.className =
      "inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white";
    idx.textContent = String(index);
    const lbl = document.createElement("span");
    lbl.textContent = "ô trống";
    span.appendChild(idx);
    span.appendChild(lbl);
    return span;
  }

  function nextBlankIndex(): number {
    const el = ref.current;
    if (!el) return 1;
    let max = 0;
    el.querySelectorAll<HTMLElement>('[data-blank="1"]').forEach((b) => {
      const n = Number(b.getAttribute("data-index") ?? "0");
      if (n > max) max = n;
    });
    return max + 1;
  }

  function insertBlank() {
    const chip = buildBlankChip(nextBlankIndex());
    insertAtCursor(chip);
    // Renumber after insert in case order needs normalising (e.g., inserted
    // before existing blanks). Walk DOM in document order, reassign 1..N.
    renumberBlanks();
    emit();
  }

  function renumberBlanks() {
    const el = ref.current;
    if (!el) return;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-blank="1"]'));
    chips.forEach((chip, i) => {
      const n = i + 1;
      chip.setAttribute("data-index", String(n));
      chip.title = `Ô trống số ${n}`;
      const idx = chip.querySelector("span");
      if (idx) idx.textContent = String(n);
    });
  }

  function buildZoneChip(index: number): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-zone", "1");
    span.setAttribute("data-index", String(index));
    span.className =
      "fsc-zone-chip mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-dashed border-amber-500/70 bg-amber-50 px-2 py-0.5 align-middle text-[13px] font-semibold text-amber-800";
    span.title = `Vùng thả số ${index}`;
    const idx = document.createElement("span");
    idx.className =
      "inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white";
    idx.textContent = String(index);
    const lbl = document.createElement("span");
    lbl.textContent = "vùng thả";
    span.appendChild(idx);
    span.appendChild(lbl);
    return span;
  }

  function nextZoneIndex(): number {
    const el = ref.current;
    if (!el) return 1;
    let max = 0;
    el.querySelectorAll<HTMLElement>('[data-zone="1"]').forEach((b) => {
      const n = Number(b.getAttribute("data-index") ?? "0");
      if (n > max) max = n;
    });
    return max + 1;
  }

  function insertZone() {
    const chip = buildZoneChip(nextZoneIndex());
    insertAtCursor(chip);
    renumberZones();
    emit();
  }

  function buildUnderlineChip(text: string): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-underline", "1");
    span.setAttribute("data-text", text);
    span.className =
      "fsc-underline-chip mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-emerald-500/70 bg-emerald-50 px-1.5 py-0.5 align-middle text-[13px] font-medium text-emerald-800 underline decoration-2 decoration-emerald-600 underline-offset-2";
    span.title = "Cụm gạch chân — click để bỏ đánh dấu";
    span.textContent = text;
    return span;
  }

  function markUnderline() {
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSavedSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const text = range.toString().trim();
    if (!text) return;
    if (!el.contains(range.startContainer)) return;
    if (nodeIsInsideChip(range.startContainer, el)) return;
    const chip = buildUnderlineChip(text);
    range.deleteContents();
    range.insertNode(chip);
    // Trailing space + caret after chip
    const space = document.createTextNode(" ");
    chip.parentNode?.insertBefore(space, chip.nextSibling);
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    savedRange.current = after.cloneRange();
    emit();
  }

  function renumberZones() {
    const el = ref.current;
    if (!el) return;
    const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-zone="1"]'));
    chips.forEach((chip, i) => {
      const n = i + 1;
      chip.setAttribute("data-index", String(n));
      chip.title = `Vùng thả số ${n}`;
      const idx = chip.querySelector("span");
      if (idx) idx.textContent = String(n);
    });
  }

  function buildAudioChip(src: string, label: string): HTMLElement {
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "false");
    span.setAttribute("data-audio", "1");
    span.setAttribute("data-src", src);
    span.setAttribute("data-label", label);
    span.className =
      "fsc-audio-chip my-2 flex cursor-pointer items-center gap-3 rounded-lg border bg-violet-50/50 px-3 py-2.5 text-[13px] ring-1 ring-violet-200 transition-colors hover:bg-violet-50";
    const icon = document.createElement("span");
    icon.className =
      "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600";
    icon.textContent = "♪";
    span.appendChild(icon);
    const meta = document.createElement("span");
    meta.className = "min-w-0 flex-1";
    const title = document.createElement("span");
    title.className = "block font-semibold text-violet-900";
    title.textContent = label || "Audio";
    const url = document.createElement("span");
    url.className = "block truncate text-[11px] text-violet-700/80";
    url.textContent = src;
    meta.appendChild(title);
    meta.appendChild(url);
    span.appendChild(meta);
    return span;
  }

  /* ─────── Math edit state ─────── */
  const [mathOpen, setMathOpen] = useState(false);
  const [mathTarget, setMathTarget] = useState<MathTarget | null>(null);

  function openMath() {
    setMathTarget(null);
    setMathOpen(true);
  }
  function openMathForChip(el: HTMLElement) {
    setMathTarget({
      el,
      tex: el.getAttribute("data-tex") ?? "",
      display: el.getAttribute("data-display") === "true",
    });
    setMathOpen(true);
  }
  function handleMathInsert(snippet: string) {
    // Extract tex + display from the snippet (always $...$ or $$...$$)
    const isDisplay = snippet.startsWith("$$");
    const tex = isDisplay ? snippet.slice(2, -2).trim() : snippet.slice(1, -1);
    if (mathTarget) {
      // Replace existing chip in place
      const chip = buildMathChip(tex, isDisplay);
      mathTarget.el.replaceWith(chip);
      emit();
    } else {
      insertSnippetAtCursor(snippet);
    }
  }

  /* ─────── Fraction dialog ─────── */
  const [fractionOpen, setFractionOpen] = useState(false);
  function openFraction() {
    setFractionOpen(true);
  }
  function handleFractionInsert(snippet: string) {
    insertSnippetAtCursor(snippet);
  }

  /* ─────── Media edit state ─────── */
  const [mediaKind, setMediaKind] = useState<MediaKind | null>(null);
  const [mediaTarget, setMediaTarget] = useState<MediaTarget | null>(null);

  function openMedia(kind: MediaKind) {
    setMediaTarget(null);
    setMediaKind(kind);
  }

  function openMediaForChip(el: HTMLElement, kind: MediaKind) {
    setMediaTarget({
      el,
      kind,
      src: el.getAttribute("data-src") ?? "",
      label:
        el.getAttribute("data-alt") ??
        el.getAttribute("data-label") ??
        "",
    });
    setMediaKind(kind);
  }

  /**
   * Convert the markdown-ish snippet emitted by MediaInsertDialog into either
   * a rendered chip (image / video / audio) or a plain text link.
   */
  function handleMediaInsert(snippet: string) {
    const trimmed = snippet.trim();
    const isImage = /^!\[[^\]]*\]\([^)\s]+(?:\s+=\d+(?:x\d+)?)?\)$/.test(trimmed);
    const isVideo = /^\[video:[^|\]]+?\s*\|\s*[^\]]*\]$/.test(trimmed);
    const isAudio = /^\[audio:[^|\]]+?\s*\|\s*[^\]]*\]$/.test(trimmed);

    if (isImage || isVideo || isAudio) {
      if (mediaTarget) {
        // Editing: replace the existing chip in place via direct DOM swap.
        let chip: HTMLElement | null = null;
        if (isImage) {
          const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+=(\d+)(?:x\d+)?)?\)$/.exec(trimmed);
          if (m) chip = buildImageChip(m[2].trim(), m[1], m[3] ? Number(m[3]) : null);
        } else if (isVideo) {
          const m = /^\[video:([^|\]]+?)\s*\|\s*([^\]]*)\]$/.exec(trimmed);
          if (m) chip = buildVideoChip(m[1].trim(), m[2].trim());
        } else if (isAudio) {
          const m = /^\[audio:([^|\]]+?)\s*\|\s*([^\]]*)\]$/.exec(trimmed);
          if (m) chip = buildAudioChip(m[1].trim(), m[2].trim());
        }
        if (chip) {
          mediaTarget.el.replaceWith(chip);
          emit();
          return;
        }
      }
      // Fresh insert — use the bulletproof splice path so we don't disturb
      // sibling chips (the bug was particularly bad for media-after-math).
      insertSnippetAtCursor(snippet);
      return;
    }

    // Fall through: plain text (e.g. inline link markdown)
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(snippet));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(document.createTextNode(snippet));
    }
    emit();
  }

  function wrap(open: string, close: string = open, placeholderText = "văn bản") {
    const sel = window.getSelection();
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      insertAtCursor(document.createTextNode(`${open}${placeholderText}${close}`));
      return;
    }
    const range = sel.getRangeAt(0);
    const text = range.toString() || placeholderText;
    range.deleteContents();
    range.insertNode(document.createTextNode(`${open}${text}${close}`));
    range.collapse(false);
    emit();
  }

  /**
   * Apply true visual formatting via `document.execCommand`. The browser
   * inserts proper `<strong>`/`<em>`/`<u>` tags around the selection (or
   * starts a styled run from the caret onward). On serialize we convert
   * those tags back to markdown markers (`**`, `*`, `__`) so the source
   * stays portable.
   */
  function applyFormat(
    command: "bold" | "italic" | "underline" | "strikeThrough",
  ) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSavedSelection();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false);
    emit();
  }

  function setColor(color: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSavedSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    emit();
  }

  function setFontSize(size: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSavedSelection();
    // Wrap the selection in a styled span (execCommand fontSize only
    // supports legacy 1-7 values, not CSS sizes).
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return; // nothing to style
    const span = document.createElement("span");
    span.style.fontSize = size;
    try {
      range.surroundContents(span);
    } catch {
      // surroundContents fails across element boundaries — fallback to extract+insert
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    emit();
  }

  function setFontFamily(family: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    restoreSavedSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontName", false, family);
    emit();
  }

  /** Restore the last saved range — needed before execCommand because the
   *  toolbar click moves focus and erases the live selection. */
  function restoreSavedSelection() {
    const el = ref.current;
    if (!el || !savedRange.current) return;
    if (!el.contains(savedRange.current.startContainer)) return;
    if (nodeIsInsideChip(savedRange.current.startContainer, el)) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRange.current.cloneRange());
  }

  const [drawingOpen, setDrawingOpen] = useState(false);
  function openDrawing() {
    setDrawingOpen(true);
  }
  function handleDrawingInsert(dataUrl: string) {
    insertSnippetAtCursor(`\n\n![Hình vẽ](${dataUrl})\n\n`);
  }

  const api: WysiwygApi = {
    insertMath: () => openMath(),
    openMath,
    openFraction,
    openMedia,
    wrap,
    insertBlank,
    insertZone,
    markUnderline,
    format: applyFormat,
    setColor,
    setFontSize,
    setFontFamily,
    openDrawing,
  };

  /**
   * Math chip: single-click opens MathLive (you don't accidentally drag math).
   * Image/video/audio chips: require double-click to edit — single-click is
   * reserved for dragging the chip without surprise dialog pops.
   */
  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-resize-handle='1']")) return;

    // Image delete button — remove the chip + serialize
    const del = target.closest<HTMLElement>("[data-image-delete='1']");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const chip = del.closest<HTMLElement>("[data-image='1']");
      if (chip) {
        chip.remove();
        emit();
      }
      return;
    }

    const overlay = target.closest<HTMLElement>("[data-edit-overlay='1']");
    if (overlay) {
      e.preventDefault();
      e.stopPropagation();
      const chip = overlay.closest<HTMLElement>(
        "[data-video='1'], [data-audio='1']",
      );
      if (chip) {
        const kind =
          (overlay.getAttribute("data-edit-kind") as MediaKind) ?? "video";
        openMediaForChip(chip, kind);
      }
      return;
    }
    const math = target.closest("[data-math='1']");
    if (math) {
      e.preventDefault();
      openMathForChip(math as HTMLElement);
      return;
    }

    // Blank chip — click removes it (with confirm via title) and renumbers
    const blank = target.closest<HTMLElement>("[data-blank='1']");
    if (blank) {
      e.preventDefault();
      // Capture the ORIGINAL 1-based index BEFORE removing so the
      // parent form can splice the correct answer out of its array.
      // Without this, renumbering loses the link between the deleted
      // chip and which `blanks[i]` entry it referred to.
      const deletedIdx = Number(blank.getAttribute("data-index") ?? "0");
      blank.remove();
      renumberBlanks();
      emit();
      if (deletedIdx > 0) onBlankDeleted?.(deletedIdx);
      return;
    }

    // Zone chip (drag-drop) — same delete UX as blank chip
    const zone = target.closest<HTMLElement>("[data-zone='1']");
    if (zone) {
      e.preventDefault();
      zone.remove();
      renumberZones();
      emit();
      return;
    }

    // Underline chip — click to unwrap back to plain text
    const underline = target.closest<HTMLElement>("[data-underline='1']");
    if (underline) {
      e.preventDefault();
      const text = underline.getAttribute("data-text") ?? underline.textContent ?? "";
      underline.replaceWith(document.createTextNode(text));
      emit();
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-resize-handle='1']")) return;
    const image = target.closest("[data-image='1']");
    if (image) {
      e.preventDefault();
      openMediaForChip(image as HTMLElement, "image");
      return;
    }
    const video = target.closest("[data-video='1']");
    if (video) {
      e.preventDefault();
      openMediaForChip(video as HTMLElement, "video");
      return;
    }
    const audio = target.closest("[data-audio='1']");
    if (audio) {
      e.preventDefault();
      openMediaForChip(audio as HTMLElement, "audio");
      return;
    }
  }

  /**
   * Insert a source string with `$...$` / `$$...$$` markers at the caret.
   * Splits into text + math segments and creates chips for the math parts
   * so they render immediately rather than waiting for a re-parse.
   */
  function insertSourceAtCursor(source: string) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      // Place at end
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(r);
    }

    const regex = /(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$)/g;
    let last = 0;
    const frag = document.createDocumentFragment();
    let m: RegExpExecArray | null;
    while ((m = regex.exec(source)) !== null) {
      if (m.index > last) {
        const before = source.slice(last, m.index);
        appendTextWithBreaks(frag, before);
      }
      const matched = m[0];
      const isDisplay = matched.startsWith("$$");
      const tex = isDisplay ? matched.slice(2, -2).trim() : matched.slice(1, -1);
      if (tex) frag.appendChild(buildMathChip(tex, isDisplay));
      last = m.index + matched.length;
    }
    if (last < source.length) {
      appendTextWithBreaks(frag, source.slice(last));
    }

    const range = sel!.getRangeAt(0);
    range.deleteContents();
    range.insertNode(frag);
    range.collapse(false);
    sel!.removeAllRanges();
    sel!.addRange(range);
    emit();
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    if (!html && !text) return;

    const { text: converted, mathCount } = processClipboard(html, text);

    // Only intercept when we actually transformed something — let plain text
    // paste use the browser's default so we don't disturb regular workflows.
    const hasMathDelimiters = /\$\$[\s\S]+?\$\$|\$[^\n$]+?\$/.test(converted);
    const wasHtmlWithMath = mathCount > 0;
    const wasHtmlComplex = Boolean(html) && /<[a-zA-Z][^>]*>/.test(html);
    if (!hasMathDelimiters && !wasHtmlWithMath && !wasHtmlComplex) return;

    e.preventDefault();
    insertSourceAtCursor(converted);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-background transition-colors",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        invalid && "border-destructive",
        compact && "rounded-md",
      )}
    >
      {toolbar !== undefined && (
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-1.5">
          {typeof toolbar === "function" ? toolbar(api) : toolbar}
        </div>
      )}

      <div className="relative">
        {empty && placeholder && (
          <p
            aria-hidden
            className="pointer-events-none absolute left-3 top-2.5 text-[13px] text-muted-foreground"
          >
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onPaste={onPaste}
          onKeyUp={captureSelection}
          onMouseUp={captureSelection}
          onBlur={captureSelection}
          spellCheck
          className={cn(
            "block w-full bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-foreground focus:outline-none",
            "[&>br]:my-0",
          )}
          style={{ minHeight }}
        />
      </div>

      <MathLiveDialog
        open={mathOpen}
        onOpenChange={(o) => {
          setMathOpen(o);
          if (!o) setMathTarget(null);
        }}
        initialTex={mathTarget?.tex ?? ""}
        initialDisplay={mathTarget?.display ?? false}
        onInsert={handleMathInsert}
      />

      <FractionInsertDialog
        open={fractionOpen}
        onOpenChange={setFractionOpen}
        onInsert={handleFractionInsert}
      />

      <MediaInsertDialog
        open={mediaKind !== null}
        onOpenChange={(o) => {
          if (!o) {
            setMediaKind(null);
            setMediaTarget(null);
          }
        }}
        kind={mediaKind ?? "image"}
        initialSrc={mediaTarget?.src}
        initialLabel={mediaTarget?.label}
        onInsert={handleMediaInsert}
      />

      <DrawingDialog
        open={drawingOpen}
        onOpenChange={setDrawingOpen}
        onInsert={handleDrawingInsert}
      />
    </div>
  );
}

function appendTextWithBreaks(target: Node, text: string): void {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) target.appendChild(document.createElement("br"));
    if (line) target.appendChild(document.createTextNode(line));
  });
}

/* ─────────────────────────── serializers ─────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Parse a markdown-ish source into HTML with rendered chips.
 *
 * Supports:
 *   • `$...$` / `$$...$$`     → math chip
 *   • `![alt](url =WxH)`      → image chip
 *   • `[video:url | label]`   → video chip
 *   • `[audio:url | label]`   → audio chip
 */
function parseToHtml(value: string): string {
  // Single regex captures all chip patterns in source order
  const regex =
    /(\$\$[\s\S]+?\$\$|\$[^\n$]+?\$|!\[[^\]]*\]\([^)]+\)|\[video:[^\]]+\]|\[audio:[^\]]+\]|\[blank:\d+\]|\[zone:\d+\]|\[u:[^\]\n]+\])/g;

  let html = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(value)) !== null) {
    if (m.index > last) {
      html += renderInlineText(value.slice(last, m.index));
    }
    const matched = m[0];

    if (matched.startsWith("$$") || (matched.startsWith("$") && !matched.startsWith("$$"))) {
      const isDisplay = matched.startsWith("$$");
      const tex = isDisplay ? matched.slice(2, -2).trim() : matched.slice(1, -1);
      let rendered = "";
      try {
        rendered = katex.renderToString(tex, {
          throwOnError: false,
          displayMode: isDisplay,
          output: "html",
          strict: "ignore",
        });
      } catch {
        rendered = escapeHtml(tex);
      }
      const cls = isDisplay
        ? "fsc-math-chip block mx-0 my-1 px-3 py-2 text-center cursor-pointer rounded ring-1 ring-primary/25 bg-primary/8 text-primary/95 hover:bg-primary/15 hover:ring-primary/50 transition-colors"
        : "fsc-math-chip mx-0.5 inline-block cursor-pointer rounded px-1.5 py-0.5 align-middle ring-1 ring-primary/25 bg-primary/8 text-primary/95 hover:bg-primary/15 hover:ring-primary/50 transition-colors";
      html += `<span contenteditable="false" data-math="1" data-tex="${escapeAttr(tex)}" data-display="${isDisplay}" class="${cls}">${rendered}</span>`;
    } else if (matched.startsWith("![")) {
      const im = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+=(\d+)(?:x\d+)?)?\)$/.exec(matched);
      if (im) {
        const alt = im[1];
        const src = im[2].trim();
        const width = im[3] ? Number(im[3]) : null;
        const widthAttr = width ? ` data-width="${width}"` : "";
        const imgStyle = width ? ` style="width:${width}px"` : "";
        const del = `<button type="button" contenteditable="false" data-image-delete="1" draggable="false" title="Xoá ảnh" class="absolute right-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/60 bg-black/65 text-white opacity-0 transition-opacity hover:bg-rose-600 group-hover/img:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
        const handle = `<span contenteditable="false" data-resize-handle="1" draggable="false" class="absolute bottom-1 right-1 z-10 h-4 w-4 cursor-se-resize rounded-sm border-2 border-white bg-primary opacity-0 shadow transition-opacity group-hover/img:opacity-100" title="Kéo để chỉnh kích thước"></span>`;
        html += `<span contenteditable="false" data-image="1" data-src="${escapeAttr(src)}" data-alt="${escapeAttr(alt)}"${widthAttr} draggable="true" class="fsc-image-chip group/img relative my-2 inline-block max-w-full cursor-grab overflow-hidden rounded-lg border bg-surface-2 align-top transition-colors hover:border-primary/40 active:cursor-grabbing" title="Hover để hiện nút xoá · kéo góc để resize · kéo cả ảnh để di chuyển"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" draggable="false"${imgStyle} class="block max-h-[400px] w-full max-w-full object-contain pointer-events-none select-none"/>${del}${handle}</span>`;
      } else {
        html += escapeHtml(matched);
      }
    } else if (matched.startsWith("[video:")) {
      const vm = /^\[video:([^|\]]+?)\s*\|\s*([^\]]*)\]$/.exec(matched);
      if (vm) {
        const src = vm[1].trim();
        const label = vm[2].trim();
        const kind = classifyMediaUrl(src);
        const baseAttrs = `contenteditable="false" data-video="1" data-src="${escapeAttr(src)}" data-label="${escapeAttr(label)}" title="Hover icon ✎ ở góc để sửa link"`;
        const overlay = `<button type="button" data-edit-overlay="1" data-edit-kind="video" contenteditable="false" title="Chỉnh sửa" class="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/60 bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover/video:opacity-100"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>`;
        if (kind.type === "youtube" || kind.type === "vimeo") {
          html += `<span ${baseAttrs} class="fsc-video-chip group/video relative my-2 block overflow-hidden rounded-lg border bg-black"><span class="block aspect-video w-full"><iframe src="${escapeAttr(kind.embedUrl)}" title="${escapeAttr(label || "Video")}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="block h-full w-full border-0"></iframe></span>${overlay}</span>`;
        } else if (kind.type === "direct") {
          html += `<span ${baseAttrs} class="fsc-video-chip group/video relative my-2 block overflow-hidden rounded-lg border bg-black"><video src="${escapeAttr(src)}" controls class="block max-h-[400px] w-full object-contain"></video>${overlay}</span>`;
        } else {
          html += `<span ${baseAttrs} class="fsc-video-chip my-2 flex cursor-pointer items-center gap-3 rounded-lg border bg-rose-50/50 px-3 py-2.5 text-[13px] ring-1 ring-rose-200 transition-colors hover:bg-rose-50"><span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-100 text-rose-600">▶</span><span class="min-w-0 flex-1"><span class="block font-semibold text-rose-900">${escapeHtml(label || "Video")}</span><span class="block truncate text-[11px] text-rose-700/80">${escapeHtml(src)}</span></span></span>`;
        }
      } else {
        html += escapeHtml(matched);
      }
    } else if (matched.startsWith("[audio:")) {
      const am = /^\[audio:([^|\]]+?)\s*\|\s*([^\]]*)\]$/.exec(matched);
      if (am) {
        const src = am[1].trim();
        const label = am[2].trim();
        html += `<span contenteditable="false" data-audio="1" data-src="${escapeAttr(src)}" data-label="${escapeAttr(label)}" class="fsc-audio-chip my-2 flex cursor-pointer items-center gap-3 rounded-lg border bg-violet-50/50 px-3 py-2.5 text-[13px] ring-1 ring-violet-200 transition-colors hover:bg-violet-50"><span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">♪</span><span class="min-w-0 flex-1"><span class="block font-semibold text-violet-900">${escapeHtml(label || "Audio")}</span><span class="block truncate text-[11px] text-violet-700/80">${escapeHtml(src)}</span></span></span>`;
      } else {
        html += escapeHtml(matched);
      }
    } else if (matched.startsWith("[blank:")) {
      const bm = /^\[blank:(\d+)\]$/.exec(matched);
      if (bm) {
        const n = bm[1];
        html += `<span contenteditable="false" data-blank="1" data-index="${escapeAttr(n)}" title="Ô trống số ${escapeAttr(n)} — click để xoá" class="fsc-blank-chip mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-dashed border-primary/70 bg-primary/5 px-2 py-0.5 align-middle text-[13px] font-semibold text-primary"><span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">${escapeHtml(n)}</span><span>ô trống</span></span>`;
      } else {
        html += escapeHtml(matched);
      }
    } else if (matched.startsWith("[zone:")) {
      const zm = /^\[zone:(\d+)\]$/.exec(matched);
      if (zm) {
        const n = zm[1];
        html += `<span contenteditable="false" data-zone="1" data-index="${escapeAttr(n)}" title="Vùng thả số ${escapeAttr(n)} — click để xoá" class="fsc-zone-chip mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-dashed border-amber-500/70 bg-amber-50 px-2 py-0.5 align-middle text-[13px] font-semibold text-amber-800"><span class="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">${escapeHtml(n)}</span><span>vùng thả</span></span>`;
      } else {
        html += escapeHtml(matched);
      }
    } else if (matched.startsWith("[u:")) {
      const um = /^\[u:([^\]\n]+)\]$/.exec(matched);
      if (um) {
        const text = um[1];
        html += `<span contenteditable="false" data-underline="1" data-text="${escapeAttr(text)}" title="Cụm gạch chân — click để bỏ đánh dấu" class="fsc-underline-chip mx-0.5 inline-flex items-center gap-1 rounded-md border-2 border-emerald-500/70 bg-emerald-50 px-1.5 py-0.5 align-middle text-[13px] font-medium text-emerald-800 underline decoration-2 decoration-emerald-600 underline-offset-2">${escapeHtml(text)}</span>`;
      } else {
        html += escapeHtml(matched);
      }
    }

    last = m.index + matched.length;
  }
  if (last < value.length) {
    html += renderInlineText(value.slice(last));
  }
  return html;
}

/**
 * Render a non-chip text segment: escape HTML, then convert markdown markers
 * to proper tags, and preserve a small set of inline-styled `<span>` tags
 * (`color`, `font-size`, `font-family`) so user-applied styling survives a
 * source roundtrip.
 */
function renderInlineText(text: string): string {
  // First protect any `<span style="...">...</span>` runs by extracting them
  // into placeholders. We then run normal escaping + markdown on the rest
  // and restore the placeholders verbatim. Anything else looking like HTML
  // gets escaped (defence against pasted content).
  const spans: string[] = [];
  let working = text.replace(
    /<span\s+style="([^"]*)">([\s\S]*?)<\/span>/g,
    (_, style, inner) => {
      const safeStyle = sanitizeStyle(style);
      const safeInner = renderInlineText(inner);
      const idx = spans.push(`<span style="${safeStyle}">${safeInner}</span>`) - 1;
      return ` SPAN${idx} `;
    },
  );

  working = escapeHtml(working);
  // Restore newlines as <br/>
  working = working.replace(/\n/g, "<br/>");
  // Markdown inline — bolditalic first so it wins over bold; everything is
  // allowed to contain inner markers (handled by the rendered-content recurse)
  working = working
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/__([\s\S]+?)__/g, "<u>$1</u>")
    .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>");
  // Restore styled spans
  working = working.replace(/ SPAN(\d+) /g, (_m, n) => spans[Number(n)] ?? "");
  return working;
}

/** Split a CSS `style` attribute string into a `{prop: value}` map. */
function parseStyleMap(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of raw.split(";")) {
    const [propRaw, ...rest] = decl.split(":");
    const prop = propRaw?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!prop || !value) continue;
    out[prop] = value;
  }
  return out;
}

/** Whitelist the CSS properties we accept on round-tripped spans. */
function sanitizeStyle(raw: string): string {
  const allowed = new Set(["color", "background-color", "font-size", "font-family", "font-weight"]);
  const parts: string[] = [];
  for (const decl of raw.split(";")) {
    const [propRaw, ...rest] = decl.split(":");
    const prop = propRaw?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (!prop || !value) continue;
    if (!allowed.has(prop)) continue;
    // Strip anything with url() or expression() for safety
    if (/url\s*\(|expression/i.test(value)) continue;
    parts.push(`${prop}:${value}`);
  }
  return parts.join(";");
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Walk DOM nodes and emit markdown-ish source string. */
function serialize(root: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    if (el.dataset.math === "1") {
      const tex = el.getAttribute("data-tex") ?? "";
      const display = el.getAttribute("data-display") === "true";
      return display ? `$$${tex}$$` : `$${tex}$`;
    }
    if (el.dataset.image === "1") {
      const src = el.getAttribute("data-src") ?? "";
      const alt = el.getAttribute("data-alt") ?? "";
      const width = el.getAttribute("data-width");
      const sizeSuffix = width ? ` =${width}` : "";
      return `\n\n![${alt}](${src}${sizeSuffix})\n\n`;
    }
    if (el.dataset.video === "1") {
      const src = el.getAttribute("data-src") ?? "";
      const label = el.getAttribute("data-label") ?? "";
      return `\n\n[video:${src} | ${label}]\n\n`;
    }
    if (el.dataset.audio === "1") {
      const src = el.getAttribute("data-src") ?? "";
      const label = el.getAttribute("data-label") ?? "";
      return `\n\n[audio:${src} | ${label}]\n\n`;
    }
    if (el.dataset.blank === "1") {
      const idx = el.getAttribute("data-index") ?? "1";
      return `[blank:${idx}]`;
    }
    if (el.dataset.zone === "1") {
      const idx = el.getAttribute("data-index") ?? "1";
      return `[zone:${idx}]`;
    }
    if (el.dataset.underline === "1") {
      const text =
        el.getAttribute("data-text") ?? el.textContent ?? "";
      return `[u:${text}]`;
    }
    if (el.tagName === "BR") return "\n";
    if (el.tagName === "DIV") {
      // Browsers wrap new lines in <div> sometimes; prepend a newline if not the first
      const inner = Array.from(el.childNodes).map(walk).join("");
      // Avoid leading newlines for the first DIV
      return (el.previousSibling ? "\n" : "") + inner;
    }

    // Inline formatting — emit as markdown markers so source stays portable.
    // Color / font-size / font-family are preserved as inline-styled <span>.
    //
    // ZWS (​) padding isolates the markers from inner content. Without
    // it, nested cases like `<b>ABC<i>DEF</i></b>` would serialize to
    // `**ABC*DEF**` — and the regex engine would parse it as `**ABC*DEF**`
    // bold (eating italic's closing `*`), leaving a stray `*` visible.
    const tag = el.tagName;
    const inner = Array.from(el.childNodes).map(walk).join("");
    if (tag === "STRONG" || tag === "B") return `**​${inner}​**`;
    if (tag === "EM" || tag === "I") return `*​${inner}​*`;
    if (tag === "U") return `__​${inner}​__`;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") return `~~​${inner}​~~`;
    if (tag === "SPAN" || tag === "FONT") {
      const style = el.getAttribute("style") ?? "";
      const colorAttr = (el as HTMLElement).getAttribute("color");
      const faceAttr = (el as HTMLElement).getAttribute("face");
      const sizeAttr = (el as HTMLElement).getAttribute("size");

      // Detect pure typographic decorations and downgrade to markdown markers
      // so the source stays portable and the card preview can render them.
      const styleMap = parseStyleMap(style);
      const isBold = styleMap["font-weight"]?.match(/^(bold|[6-9]00)$/i);
      const isItalic = styleMap["font-style"]?.toLowerCase() === "italic";
      const isUnderline = (styleMap["text-decoration"] ?? "").includes("underline");
      const hasNonTextDecoration =
        Object.keys(styleMap).some(
          (k) =>
            k !== "font-weight" &&
            k !== "font-style" &&
            k !== "text-decoration" &&
            k !== "text-decoration-line",
        ) ||
        Boolean(colorAttr) ||
        Boolean(faceAttr) ||
        Boolean(sizeAttr);

      if (!hasNonTextDecoration && (isBold || isItalic || isUnderline)) {
        let result = inner;
        if (isBold) result = `**​${result}​**`;
        if (isItalic) result = `*​${result}​*`;
        if (isUnderline) result = `__​${result}​__`;
        return result;
      }

      if (style || colorAttr || faceAttr || sizeAttr) {
        const styleParts: string[] = [];
        // Keep only the non-text-decoration parts when rebuilding
        for (const [k, v] of Object.entries(styleMap)) {
          if (
            k === "font-weight" ||
            k === "font-style" ||
            k === "text-decoration" ||
            k === "text-decoration-line"
          )
            continue;
          styleParts.push(`${k}:${v}`);
        }
        if (colorAttr) styleParts.push(`color:${colorAttr}`);
        if (faceAttr) styleParts.push(`font-family:${faceAttr}`);

        // Apply markdown markers INSIDE the span (with ZWS padding) so
        // emphasize() can find them after pulling the span out during render.
        let result = inner;
        if (isBold) result = `**​${result}​**`;
        if (isItalic) result = `*​${result}​*`;
        if (isUnderline) result = `__​${result}​__`;
        if (styleParts.length > 0) {
          result = `<span style="${styleParts.join(";")}">${result}</span>`;
        }
        return result;
      }
      return inner;
    }
    return inner;
  }
  let out = Array.from(root.childNodes).map(walk).join("");
  // Normalise non-breaking spaces inserted by the cursor helper
  out = out.replace(/ /g, " ");
  return out.trimEnd();
}
