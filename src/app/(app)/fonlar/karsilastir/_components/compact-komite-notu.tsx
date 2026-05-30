import Link from "next/link";

import type { Fund } from "@/app/(app)/_lib/tefas/types";

interface Props {
  fund: Fund;
  note: string | undefined;
  color: string;
}

export function CompactKomiteNotu({ fund, note, color }: Props) {
  if (!note) {
    return (
      <div
        className="card"
        style={{ borderLeft: `3px solid ${color}`, padding: "10px 14px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color }}>
              {fund.code}
            </code>
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>
              komite notu üretilmedi (yetersiz veri)
            </span>
          </div>
          <Link
            href={`/fonlar/${encodeURIComponent(fund.code)}`}
            style={{ fontSize: 11, color: "var(--muted)", textDecoration: "none" }}
          >
            Detay →
          </Link>
        </div>
      </div>
    );
  }

  const lines = note.split("\n").filter((l) => l.length > 0);
  const body = lines.slice(0, -1).join(" ");
  const disclaimer = lines[lines.length - 1];

  return (
    <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color }}>
              {fund.code}
            </code>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{fund.name}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{body}</p>
          <p
            style={{
              margin: 0,
              marginTop: 8,
              paddingTop: 6,
              borderTop: "1px solid var(--border-soft)",
              fontSize: 10,
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            ⓘ {disclaimer}
          </p>
        </div>
        <Link
          href={`/fonlar/${encodeURIComponent(fund.code)}`}
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Detay →
        </Link>
      </div>
    </div>
  );
}
