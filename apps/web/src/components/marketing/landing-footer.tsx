export function LandingFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-2 px-4 py-3.5 text-meta sm:flex-row sm:items-center lg:px-6">
        <p className="flex flex-wrap items-center gap-2">
          <span>© {new Date().getFullYear()} FPT Schools</span>
          <span className="text-foreground/25">·</span>
          <span>FSC Exam Platform · Phiên bản 1.0</span>
        </p>
        <nav aria-label="Liên kết hỗ trợ">
          <ul className="flex items-center gap-4">
            {[
              { href: "#privacy", label: "Chính sách bảo mật" },
              { href: "#terms", label: "Điều khoản sử dụng" },
              { href: "mailto:khaothi@fpt.edu.vn", label: "Hỗ trợ" },
            ].map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="font-medium text-foreground/70 transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
