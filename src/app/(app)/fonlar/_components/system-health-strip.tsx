import type {
  CpiMonthly,
  FundReturns,
  FundReturnsIngestLog,
  FundScoresIngestLog,
  TefasIngestLog,
} from "@/app/(app)/_lib/tefas/types";
import { istanbulToday } from "@/lib/finance/istanbul-date";

interface Props {
  lastNavIngest: TefasIngestLog | null;
  lastReturnsRefresh: FundReturnsIngestLog | null;
  lastScoresRefresh: FundScoresIngestLog | null;
  latestCpi: CpiMonthly | null;
  /** CPI lag fallback durumunu göstermek için returns cache satırları. */
  returns?: FundReturns[];
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const today = istanbulToday();
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function chipStyle(status: "ok" | "warn" | "stale"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };
  if (status === "ok") return { ...base, background: "#4cc9b022", borderColor: "#4cc9b055", color: "#4cc9b0" };
  if (status === "warn") return { ...base, background: "#e0b34122", borderColor: "#e0b34155", color: "#e0b341" };
  return { ...base, background: "#e26a8f22", borderColor: "#e26a8f55", color: "#e26a8f" };
}

function statusFor(daysAgo: number | null, okThreshold = 1, warnThreshold = 3): "ok" | "warn" | "stale" {
  if (daysAgo === null) return "stale";
  if (daysAgo <= okThreshold) return "ok";
  if (daysAgo <= warnThreshold) return "warn";
  return "stale";
}

export function SystemHealthStrip({
  lastNavIngest,
  lastReturnsRefresh,
  lastScoresRefresh,
  latestCpi,
  returns = [],
}: Props) {
  const navDays = daysSince(lastNavIngest?.ran_at ?? null);
  const returnsDays = daysSince(lastReturnsRefresh?.ran_at ?? null);
  const scoresDays = daysSince(lastScoresRefresh?.ran_at ?? null);
  const cpiAge = latestCpi ? daysSince(`${latestCpi.period_month}-15`) : null;

  // CPI lag fallback metriği: kaç fonun real_* değeri stale CPI ile hesaplandı
  let fallbackCount = 0;
  let maxLagMonths = 0;
  for (const r of returns) {
    const ws = r.warnings ?? [];
    if (ws.includes("cpi_lag_fallback_used")) {
      fallbackCount++;
      for (const w of ws) {
        const m = /^cpi_lag_months=(\d+)$/.exec(w);
        if (m) {
          const n = Number(m[1]);
          if (n > maxLagMonths) maxLagMonths = n;
        }
      }
    }
  }

  const chips: Array<{ label: string; info: string; status: "ok" | "warn" | "stale" }> = [
    {
      label: "NAV ingest",
      info: lastNavIngest ? `${navDays}g önce · ${lastNavIngest.succeeded}/${lastNavIngest.requested}` : "hiç çalışmadı",
      status: statusFor(navDays),
    },
    {
      label: "Returns refresh",
      info: lastReturnsRefresh ? `${returnsDays}g önce · ${lastReturnsRefresh.upserted} satır` : "hiç çalışmadı",
      status: statusFor(returnsDays),
    },
    {
      label: "Mehmet Score refresh",
      info: lastScoresRefresh ? `${scoresDays}g önce · ${lastScoresRefresh.upserted} satır` : "hiç çalışmadı",
      status: statusFor(scoresDays),
    },
    {
      label: "CPI",
      info: latestCpi ? `${latestCpi.period_month} (${cpiAge}g eski)` : "veri yok",
      status: latestCpi ? statusFor(cpiAge, 35, 60) : "stale",
    },
  ];

  if (fallbackCount > 0) {
    chips.push({
      label: "CPI fallback",
      info: `${fallbackCount} fon · gecikme ${maxLagMonths} ay`,
      status: "warn",
    });
  }

  return (
    <div
      style={{
        padding: "12px 16px",
        background: "var(--surface-2)",
        borderRadius: 8,
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Sistem Sağlığı
      </span>
      {chips.map((c) => (
        <span key={c.label} style={chipStyle(c.status)}>
          <strong>{c.label}:</strong> {c.info}
        </span>
      ))}
    </div>
  );
}
