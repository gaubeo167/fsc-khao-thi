import { Building2, GraduationCap, UserCog, type LucideIcon } from "lucide-react";

interface Stat {
  icon: LucideIcon;
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { icon: Building2, value: "18", label: "campus" },
  { icon: GraduationCap, value: "20.000+", label: "học sinh" },
  { icon: UserCog, value: "800+", label: "giáo viên" },
];

export function BrandPanel() {
  return (
    <aside
      className="relative isolate flex h-full flex-col justify-between overflow-hidden p-10 text-primary-foreground lg:p-12"
      aria-label="Giới thiệu FSC Exam Platform"
    >
      <Backdrop />

      <header className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground text-[15px] font-bold text-primary shadow-sm">
          FS
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight">FSchools</p>
          <p className="text-[12px] text-primary-foreground/75">FPT Schools</p>
        </div>
      </header>

      <div className="relative space-y-9">
        <div>
          <h1 className="text-balance text-[clamp(2.25rem,4.8vw,3.25rem)] font-bold leading-[1.05] tracking-tight">
            Nền tảng
            <br />
            khảo thí số
            <br />
            của FPT Schools
          </h1>
          <p className="mt-5 max-w-md text-[14.5px] leading-relaxed text-primary-foreground/85">
            Hệ thống khảo thí và vận hành học thuật chuẩn hóa cho toàn bộ hệ thống
            FPT Schools.
          </p>
        </div>

        <dl className="grid max-w-md grid-cols-3 gap-4">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/12 ring-1 ring-inset ring-primary-foreground/22 backdrop-blur-sm">
                <Icon className="h-4 w-4 text-primary-foreground" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <dt className="text-[24px] font-bold leading-none tracking-tight tabular-nums">
                  {value}
                </dt>
                <dd className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/75">
                  {label}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <footer className="relative text-[11px] text-primary-foreground/65">
        © {new Date().getFullYear()} FPT Schools · FSC Exam Platform
      </footer>
    </aside>
  );
}

/**
 * Layered backdrop, painted z-index back to front:
 *
 *   −30  photo (low opacity — bleeds through gradient)
 *   −20  blue gradient overlay (the dominant blue tone)
 *   −10  soft radial highlights (depth)
 *
 * Photo asset is optional — drop one into `public/landing/campus.jpg`.
 * Missing image fails silently; the gradient still reads.
 */
function Backdrop() {
  return (
    <>
      {/* Photo (silent fallback if missing) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-30"
        style={{
          backgroundImage: "url('/landing/campus.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Blue gradient — primary tone, mostly opaque so brand stays clear */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          background:
            "linear-gradient(145deg, var(--color-brand-deep) 0%, var(--color-primary) 55%, var(--color-brand-deep) 100%)",
          opacity: 0.92,
        }}
      />

      {/* Radial wash for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 55% at 100% 0%, rgba(255,255,255,0.16) 0%, transparent 60%), radial-gradient(55% 45% at 0% 100%, rgba(0,0,0,0.32) 0%, transparent 55%)",
        }}
      />
    </>
  );
}
