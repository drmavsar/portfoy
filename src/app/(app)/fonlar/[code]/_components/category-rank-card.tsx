import type { CategoryRank } from "@/app/(app)/_lib/tefas/score-explain";

interface Props {
  categoryName: string | null;
  rank: CategoryRank | null;
}

function bandColor(band: CategoryRank["band"]): string {
  if (band === "ust_5" || band === "ust_10") return "#4cc9b0";
  if (band === "ust_ceyrek" || band === "ust_yari") return "#e0b341";
  return "#e26a8f";
}

export function CategoryRankCard({ categoryName, rank }: Props) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
        Kategori Sıralaması
      </div>
      <div style={{ fontSize: 13, color: "var(--fg)", marginBottom: 4 }}>
        {categoryName ?? "—"}
      </div>
      {rank == null ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Bu fon için kategori sıralaması hesaplanamadı.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            {rank.medal && (
              <span style={{ fontSize: 22 }} title={rank.medal_label ?? ""}>
                {rank.medal}
              </span>
            )}
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--fg)" }}>
              {rank.rank} / {rank.total}
            </span>
            {rank.medal_label && (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                {rank.medal_label}
              </span>
            )}
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: 8,
              padding: "3px 10px",
              borderRadius: 12,
              background: `${bandColor(rank.band)}22`,
              color: bandColor(rank.band),
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {rank.band_label}
          </div>
          {rank.category_size_note && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
              ℹ {rank.category_size_note}
            </div>
          )}
        </>
      )}
    </div>
  );
}
