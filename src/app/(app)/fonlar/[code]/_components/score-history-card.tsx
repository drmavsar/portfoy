import type { ScoreHistoryCompare } from "@/app/(app)/_lib/tefas/score-explain";

interface Props {
  history: ScoreHistoryCompare;
}

function deltaColor(delta: number | null): string {
  if (delta == null || delta === 0) return "var(--muted)";
  return delta > 0 ? "#4cc9b0" : "#e26a8f";
}

function deltaSymbol(delta: number | null): string {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta} ↑`;
  if (delta < 0) return `${delta} ↓`;
  return "0";
}

export function ScoreHistoryCard({ history }: Props) {
  if (!history.has_any_history) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
          Skor Tarihçesi
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {history.buildup_label ?? "Tarihçe oluşuyor — sonraki cron çalışmasından sonra delta görünür."}
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
        Skor Tarihçesi
      </div>
      <Row label="Bugün" score={history.current} delta={null} bold />
      <Row label="7 gün önce" score={history.d7?.score ?? null} delta={history.d7?.delta ?? null} />
      <Row label="30 gün önce" score={history.d30?.score ?? null} delta={history.d30?.delta ?? null} />
      <Row label="90 gün önce" score={history.d90?.score ?? null} delta={history.d90?.delta ?? null} />
    </div>
  );
}

function Row({
  label,
  score,
  delta,
  bold,
}: {
  label: string;
  score: number | null;
  delta: number | null;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: 10,
        alignItems: "center",
        padding: "4px 0",
        borderBottom: "1px solid var(--border-soft)",
        fontSize: 12,
      }}
    >
      <span style={{ color: bold ? "var(--fg)" : "var(--muted)", fontWeight: bold ? 600 : 400 }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
        {score ?? "—"}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: deltaColor(delta),
          minWidth: 50,
          textAlign: "right",
        }}
      >
        {delta == null ? "" : deltaSymbol(delta)}
      </span>
    </div>
  );
}
