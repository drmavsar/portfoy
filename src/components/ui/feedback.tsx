import type { ReactNode } from "react";

export type BannerTone = "warn" | "info" | "error";

const BANNER_ICON: Record<BannerTone, ReactNode> = {
  warn: (
    <>
      <path d="M7 1.5 13 12.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 5.5v3M7 10.3v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  info: (
    <>
      <circle cx="7" cy="7" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 6.2v3.6M7 4.2v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  error: (
    <>
      <circle cx="7" cy="7" r="5.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="m4.8 4.8 4.4 4.4M9.2 4.8 4.8 9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
};

export function BannerIcon({ tone, size = 18 }: { tone: BannerTone; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="banner-icon">
      {BANNER_ICON[tone]}
    </svg>
  );
}

/**
 * Uyarı bandı (bayat bakiye, eksik veri, hata). Simge, kısa açıklama ve en
 * fazla bir eylem. Sayfa başına en fazla bir band; birden fazla uyarı tek
 * bandda sayıyla birleşir.
 */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  onAction,
}: {
  tone?: BannerTone;
  title: ReactNode;
  children?: ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  const cls = tone === "warn" ? "banner banner-warn" : tone === "error" ? "banner banner-error" : "banner";
  return (
    <div className={cls} role={tone === "error" ? "alert" : "status"}>
      <BannerIcon tone={tone} />
      <div className="banner-body">
        <span className="banner-title">{title}</span>
        {children && <span className="banner-text">{children}</span>}
      </div>
      {action && (
        <button type="button" className="banner-action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  boxed = true,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  boxed?: boolean;
}) {
  return (
    <div className={boxed ? "empty empty-box" : "empty"}>
      {icon && <span className="empty-icon">{icon}</span>}
      <span className="title">{title}</span>
      {children && <span>{children}</span>}
      {actions && <span className="actions">{actions}</span>}
    </div>
  );
}

/** İskelet parçası. Nabız 1,4 sn; "hareketi azalt" açıkken durur. */
export function Skel({
  w = "100%",
  h = 12,
  r = 4,
  soft,
}: {
  w?: number | string;
  h?: number;
  r?: number;
  soft?: boolean;
}) {
  return <span className={soft ? "skel skel-soft" : "skel"} style={{ width: w, height: h, borderRadius: r }} />;
}

/** Defter listesi iskeleti — gerçek satır düzenini taklit eder. */
export function LedgerSkeleton({ rows = 3 }: { rows?: number }) {
  const widths = [
    ["70%", "45%", 56],
    ["55%", "60%", 48],
    ["65%", "35%", 60],
  ] as const;
  return (
    <div aria-busy="true" aria-label="Kayıtlar yükleniyor">
      {Array.from({ length: rows }, (_, i) => {
        const [a, b, c] = widths[i % widths.length];
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "12px 14px",
              borderTop: i ? "1px solid var(--border-soft)" : undefined,
            }}
          >
            <Skel w={40} h={40} r={8} />
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Skel w={a} />
              <Skel w={b} soft />
            </span>
            <Skel w={c} h={14} />
          </div>
        );
      })}
    </div>
  );
}
