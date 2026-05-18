"use client";

import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { TOC_LEVELS, type TocNode } from "../data/seed-toc";
import { cn } from "@/lib/utils";

const MAX_DEPTH = TOC_LEVELS.length - 1;

interface Props {
  nodes: TocNode[];
  /** Set of collapsed node ids (controlled). */
  collapsed: Set<string>;
  setCollapsed: (next: Set<string>) => void;
  onRename: (id: string, name: string) => void;
  onAddChild: (parentId: string | null, depth: number) => void;
  onDelete: (node: TocNode) => void;
  onReorder: (sourceId: string, targetId: string, position: "before" | "after") => void;
}

export function TocTree({
  nodes,
  collapsed,
  setCollapsed,
  onRename,
  onAddChild,
  onDelete,
  onReorder,
}: Props) {
  const byParent = useMemo(() => {
    const map = new Map<string | null, TocNode[]>();
    for (const n of nodes) {
      const list = map.get(n.parentId) ?? [];
      list.push(n);
      map.set(n.parentId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [nodes]);

  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      if (n.parentId) m.set(n.parentId, (m.get(n.parentId) ?? 0) + 1);
    }
    return m;
  }, [nodes]);

  // Drag state — at tree level so any branch can read it
  const [dragId, setDragId] = useState<string | null>(null);

  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-1.5">
      {roots.map((n, idx) => (
        <Branch
          key={n.id}
          node={n}
          siblingIndex={idx}
          depth={0}
          byParent={byParent}
          childCountMap={childCountMap}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          dragId={dragId}
          setDragId={setDragId}
          onRename={onRename}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ))}
    </div>
  );
}

interface BranchProps {
  node: TocNode;
  siblingIndex: number;
  depth: number;
  byParent: Map<string | null, TocNode[]>;
  childCountMap: Map<string, number>;
  collapsed: Set<string>;
  setCollapsed: (next: Set<string>) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onAddChild: (parentId: string | null, depth: number) => void;
  onDelete: (node: TocNode) => void;
  onReorder: (sourceId: string, targetId: string, position: "before" | "after") => void;
}

function Branch({
  node,
  siblingIndex,
  depth,
  byParent,
  childCountMap,
  collapsed,
  setCollapsed,
  dragId,
  setDragId,
  onRename,
  onAddChild,
  onDelete,
  onReorder,
}: BranchProps) {
  const children = byParent.get(node.id) ?? [];
  const hasChildren = children.length > 0;
  const childCount = childCountMap.get(node.id) ?? 0;
  const canAddChild = depth < MAX_DEPTH;
  const level = TOC_LEVELS[Math.min(depth, MAX_DEPTH)]!;
  const isOpen = !collapsed.has(node.id);

  const [dropZone, setDropZone] = useState<"before" | "after" | null>(null);
  const [name, setName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(node.name);
  }, [node.name]);

  // Focus newly-created blank nodes
  useEffect(() => {
    if (node.name === "" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [node.name]);

  function toggle() {
    const next = new Set(collapsed);
    if (next.has(node.id)) next.delete(node.id);
    else next.add(node.id);
    setCollapsed(next);
  }

  function commitName() {
    const trimmed = name.trim();
    if (trimmed !== node.name) onRename(node.id, trimmed);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!dragId || dragId === node.id) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropZone(e.clientY < midY ? "before" : "after");
  }

  function handleDrop(e: React.DragEvent) {
    if (!dragId) return;
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData("text/plain") || dragId;
    if (sourceId && sourceId !== node.id && dropZone) {
      onReorder(sourceId, node.id, dropZone);
    }
    setDropZone(null);
    setDragId(null);
  }

  const isDragging = dragId === node.id;

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDropZone(null)}
        onDrop={handleDrop}
        className="relative"
      >
        {/* Drop indicator line */}
        {dropZone === "before" && (
          <div
            aria-hidden
            className="absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-primary"
          />
        )}
        {dropZone === "after" && (
          <div
            aria-hidden
            className="absolute -bottom-1 left-0 right-0 z-10 h-0.5 rounded-full bg-primary"
          />
        )}

        <div
          className={cn(
            "group flex items-center gap-1.5 overflow-hidden rounded-lg border bg-card transition-all",
            isDragging && "opacity-40",
          )}
        >
          {/* Color bar — full-height left edge */}
          <span aria-hidden className={cn("w-1 self-stretch", level.barClass)} />

          {/* Drag handle */}
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              setDragId(node.id);
              e.dataTransfer.setData("text/plain", node.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropZone(null);
            }}
            title="Kéo để sắp xếp"
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>

          {/* Expand toggle */}
          {hasChildren ? (
            <button
              type="button"
              onClick={toggle}
              aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
          ) : (
            <span aria-hidden className="inline-block w-[20px] shrink-0" />
          )}

          {/* Level chip */}
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
              level.chipBg,
              level.chipFg,
            )}
          >
            {level.short}.{siblingIndex + 1}
          </span>

          {/* Inline editable name */}
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setName(node.name);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder={`Tên ${level.full.toLowerCase()}…`}
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />

          {/* Child count + actions */}
          <div className="ml-auto flex shrink-0 items-center gap-1 pr-1.5">
            {childCount > 0 && (
              <span className="mr-1 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {childCount}
              </span>
            )}
            {canAddChild && (
              <IconButton
                size="sm"
                variant="primary"
                title={`Thêm ${TOC_LEVELS[depth + 1]?.full.toLowerCase() ?? "mục con"}`}
                onClick={() => onAddChild(node.id, depth + 1)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              </IconButton>
            )}
            <IconButton
              size="sm"
              variant="destructive"
              title="Xoá"
              onClick={() => onDelete(node)}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        </div>
      </div>

      {isOpen && hasChildren && (
        <div className="ml-6 mt-1.5 space-y-1.5 border-l border-dashed border-border pl-3">
          {children.map((c, idx) => (
            <Branch
              key={c.id}
              node={c}
              siblingIndex={idx}
              depth={depth + 1}
              byParent={byParent}
              childCountMap={childCountMap}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              dragId={dragId}
              setDragId={setDragId}
              onRename={onRename}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onReorder={onReorder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
