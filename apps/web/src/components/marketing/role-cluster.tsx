import {
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

interface Sat {
  icon: LucideIcon;
  x: number;
  y: number;
  /** Visual tone: neutral blue tile or accented green tile. */
  tone: "blue" | "green";
}

/**
 * 4 satellite tiles arranged around the central shield. Compact — fits beside
 * the login form without pushing the typography. Pixel positions are inside
 * the 280×280 container (top-left of each card).
 */
const SATELLITES: Sat[] = [
  { icon: UserRound, x: 4, y: 122, tone: "blue" },
  { icon: BarChart3, x: 232, y: 122, tone: "blue" },
  { icon: ClipboardCheck, x: 70, y: 196, tone: "blue" },
  { icon: ShieldCheck, x: 166, y: 196, tone: "green" },
];

export function RoleCluster() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative hidden h-[280px] w-[280px] shrink-0 xl:block"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 280 280"
        aria-hidden
      >
        <circle
          cx="140"
          cy="140"
          r="118"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          strokeDasharray="2 5"
          opacity="0.7"
        />
        <circle
          cx="140"
          cy="140"
          r="84"
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          opacity="0.4"
        />
      </svg>

      <ShieldHub />

      {SATELLITES.map((s, i) => {
        const Icon = s.icon;
        const ring =
          s.tone === "green"
            ? "text-[oklch(0.58_0.15_152)] bg-card ring-1 ring-[oklch(0.58_0.15_152)]/15"
            : "text-primary bg-card ring-1 ring-border/60";
        return (
          <div
            key={i}
            className={`absolute flex h-11 w-11 items-center justify-center rounded-[14px] shadow-[0_8px_18px_-8px_rgba(15,23,42,0.18)] ${ring}`}
            style={{ left: s.x, top: s.y }}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.85} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Real shield silhouette (rounded shoulders, tapered bottom). SVG so the path
 * is exact and recolored from primary.
 */
function ShieldHub() {
  return (
    <div
      className="absolute"
      style={{
        left: 96,
        top: 12,
        filter:
          "drop-shadow(0 22px 36px oklch(0.5 0.2 262 / 0.35)) drop-shadow(0 4px 8px oklch(0.5 0.2 262 / 0.18))",
      }}
    >
      <svg width="88" height="98" viewBox="0 0 88 98" aria-hidden>
        <path
          d="M44 4 L82 18 V46 C82 70 64 86 44 94 C24 86 6 70 6 46 V18 Z"
          fill="var(--color-primary)"
        />
        <g fill="white">
          <rect x="30" y="44" width="28" height="22" rx="3.5" />
          <path d="M34 44 V37 a10 10 0 0 1 20 0 V44 h-4 V37 a6 6 0 0 0 -12 0 V44 Z" />
          <circle cx="44" cy="53" r="2.5" fill="var(--color-primary)" />
          <rect x="42.7" y="53" width="2.6" height="6" rx="1" fill="var(--color-primary)" />
        </g>
      </svg>
    </div>
  );
}
