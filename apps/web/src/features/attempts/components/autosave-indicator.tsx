"use client";

import {
  CheckCircle2,
  CloudOff,
  Loader2,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { formatRelative } from "@/lib/format";

import { useRuntimeStore } from "../state/runtime-store";

export function AutosaveIndicator() {
  const online = useOnlineStatus();
  const statuses = useRuntimeStore((s) => s.statuses);
  const lastSavedAt = useRuntimeStore((s) => s.lastSavedAt);

  const summary = useMemo(() => {
    const values = Object.values(statuses);
    const counts = {
      saving: values.filter((v) => v === "saving").length,
      dirty: values.filter((v) => v === "dirty").length,
      error: values.filter((v) => v === "error").length,
      saved: values.filter((v) => v === "saved").length,
    };
    const latest = Math.max(0, ...Object.values(lastSavedAt));
    return { counts, latest: latest > 0 ? latest : null };
  }, [statuses, lastSavedAt]);

  if (!online) {
    return (
      <Badge variant="warning" className="gap-1.5">
        <WifiOff className="h-3.5 w-3.5" />
        Offline · changes saved locally
      </Badge>
    );
  }

  if (summary.counts.error > 0) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <TriangleAlert className="h-3.5 w-3.5" />
        Save failed · retrying
      </Badge>
    );
  }

  if (summary.counts.saving > 0) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </Badge>
    );
  }

  if (summary.counts.dirty > 0) {
    return (
      <Badge variant="warning" className="gap-1.5">
        <CloudOff className="h-3.5 w-3.5" />
        Unsaved changes
      </Badge>
    );
  }

  if (summary.counts.saved > 0) {
    return (
      <Badge variant="success" className="gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Saved · {formatRelative(summary.latest)}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Ready
    </Badge>
  );
}
