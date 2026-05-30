import type { FundScores, FundScoresHealth } from "@/app/(app)/_lib/tefas/types";

interface Props {
  scoresHealth: FundScoresHealth[];
  scores: FundScores[];
}

export function WarningsCard({ scoresHealth, scores }: Props) {
  const stale = scoresHealth.filter(
    (h) => h.last_as_of === null || (h.days_stale ?? 0) >= 3,
  );
  const neverScored = scoresHealth.filter((h) => h.last_as_of === null);

  const partialComponents = scores.filter(
    (s) => s.components_used !== null && s.components_used < 5,
  );

  const noComponents: Array<{ code: string; reasons: string[] }> = [];
  for (const s of scores) {
    const reasons: string[] = [];
    if (s.components_used !== null && s.components_used < 3) reasons.push("3 bileşenden az");
    if (s.mehmet_score === null) reasons.push("Mehmet Score üretilemedi");
    if (reasons.length > 0) noComponents.push({ code: s.fund_code, reasons });
  }

  const items: Array<{ severity: "info" | "warn" | "critical"; text: string }> = [];
  if (stale.length > 0) {
    items.push({
      severity: "warn",
      text: `${stale.length} fon × persona için skor 3+ günden eski (${neverScored.length} hiç skor üretilmemiş)`,
    });
  }
  if (partialComponents.length > 0) {
    items.push({
      severity: "info",
      text: `${partialComponents.length} fonda eksik bileşen var (kısa NAV geçmişi veya CPI yok)`,
    });
  }
  if (noComponents.length > 0) {
    items.push({
      severity: "critical",
      text: `${noComponents.length} fon için Mehmet Score üretilemedi (3/5 minimum eşik)`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Uyarılar</div>
        <div className="card-sub">{items.length}</div>
      </div>
      <div>
        {items.map((it, idx) => {
          const color =
            it.severity === "critical" ? "#e26a8f" :
            it.severity === "warn" ? "#e0b341" : "#6ea8fe";
          return (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: idx < items.length - 1 ? "1px solid var(--border-soft)" : "none",
                borderLeft: `3px solid ${color}`,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: `${color}22`,
                  color,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  whiteSpace: "nowrap",
                }}
              >
                {it.severity}
              </span>
              <span>{it.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
