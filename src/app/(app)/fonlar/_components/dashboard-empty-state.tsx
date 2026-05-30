import type {
  FundReturnsIngestLog,
  FundScoresIngestLog,
  TefasIngestLog,
} from "@/app/(app)/_lib/tefas/types";
import { Icon } from "@/components/ui/icon";

interface Props {
  navIngestLog: TefasIngestLog | null;
  returnsLog: FundReturnsIngestLog | null;
  scoresLog: FundScoresIngestLog | null;
}

export function DashboardEmptyState({ navIngestLog, returnsLog, scoresLog }: Props) {
  const steps = [
    { label: "1. NAV ingest", done: navIngestLog !== null, endpoint: "/api/cron/tefas-prices" },
    { label: "2. Returns refresh", done: returnsLog !== null, endpoint: "/api/cron/fund-returns-refresh" },
    { label: "3. Mehmet Score refresh", done: scoresLog !== null, endpoint: "/api/cron/fund-scores-refresh" },
  ];

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <Icon name="calendar" size={20} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            Mehmet Score cache&apos;i henüz dolmadı
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Aşağıdaki cron zincirini sırayla tetikleyin
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {steps.map((s) => (
          <div
            key={s.label}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 12,
              alignItems: "center",
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid var(--border-soft)",
              background: s.done ? "#4cc9b011" : "var(--surface)",
              fontSize: 13,
            }}
          >
            <span style={{ fontSize: 16 }}>{s.done ? "✅" : "⏳"}</span>
            <span>{s.label}</span>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
              {s.endpoint}
            </code>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 6,
          fontSize: 11,
          color: "var(--muted)",
          fontFamily: "var(--font-mono)",
          overflowX: "auto",
        }}
      >
        curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://&lt;host&gt;/api/cron/...
      </div>
    </div>
  );
}
