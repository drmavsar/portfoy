import Link from "next/link";

import type { SimilarFundsResult } from "@/app/(app)/_lib/tefas/score-explain";

interface Props {
  similar: SimilarFundsResult;
}

export function SimilarFundsCard({ similar }: Props) {
  const hasAny =
    similar.near_score.length > 0 || similar.category_leaders.length > 0;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>
        Benzer Fonlar
      </div>

      {similar.is_self_leader && (
        <div
          style={{
            padding: "6px 10px",
            background: "#4cc9b022",
            color: "#4cc9b0",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          🥇 Bu fon kategorisinde 1. sırada
        </div>
      )}

      {!hasAny && !similar.is_self_leader ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Kategoride karşılaştırılabilir başka fon yok.
        </div>
      ) : (
        <>
          {similar.category_leaders.length > 0 && (
            <FundList
              title="Kategori Liderleri"
              accent="#4cc9b0"
              items={similar.category_leaders}
            />
          )}
          {similar.near_score.length > 0 && (
            <FundList
              title="Yakın Skorlu Fonlar"
              accent="#6ea8fe"
              items={similar.near_score}
            />
          )}
        </>
      )}

      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 10, lineHeight: 1.4 }}>
        {similar.disclaimer}
      </div>
    </div>
  );
}

function FundList({
  title,
  accent,
  items,
}: {
  title: string;
  accent: string;
  items: SimilarFundsResult["near_score"];
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: accent, fontWeight: 600, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title}
      </div>
      {items.map((f) => (
        <Link
          key={f.code}
          href={`/fonlar/${encodeURIComponent(f.code)}`}
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr auto",
            gap: 8,
            alignItems: "center",
            padding: "5px 0",
            color: "inherit",
            textDecoration: "none",
            fontSize: 12,
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{f.code}</code>
          <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {f.name ?? "—"}
          </span>
          <strong style={{ color: accent, fontFamily: "var(--font-mono)" }}>{f.score}</strong>
        </Link>
      ))}
    </div>
  );
}
