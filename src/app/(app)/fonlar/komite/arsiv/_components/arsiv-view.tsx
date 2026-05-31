"use client";

import Link from "next/link";

import type {
  KomiteArsivDeltaItem,
  KomiteArsivSnapshot,
} from "@/app/(app)/_lib/tefas/komite-arsiv-loader";

interface Props {
  snapshot: KomiteArsivSnapshot;
  fundNameByCode: Map<string, string>;
}

export function ArsivView({ snapshot, fundNameByCode }: Props) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Tarih navigasyon (print-hide) */}
      <div className="card" style={{ padding: 14 }} data-print-hide>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Tarih:
          </div>
          {snapshot.previous_date ? (
            <Link
              href={`/fonlar/komite/arsiv?date=${snapshot.previous_date}`}
              style={{ fontSize: 12, color: "#6ea8fe", textDecoration: "none" }}
            >
              ← {snapshot.previous_date}
            </Link>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>← (yok)</span>
          )}
          <div style={{ fontSize: 16, fontWeight: 700, padding: "0 12px" }}>
            {snapshot.date}
          </div>
          {snapshot.next_date ? (
            <Link
              href={`/fonlar/komite/arsiv?date=${snapshot.next_date}`}
              style={{ fontSize: 12, color: "#6ea8fe", textDecoration: "none" }}
            >
              {snapshot.next_date} →
            </Link>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>(yok) →</span>
          )}
          <button
            onClick={() => window.print()}
            style={{
              marginLeft: "auto",
              fontSize: 11,
              padding: "4px 12px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--muted)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            🖨 Yazdır
          </button>
        </div>
        {snapshot.available_dates.length > 1 && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
            {snapshot.available_dates.length} tarih arşivde · {snapshot.available_dates[0]} → {snapshot.available_dates[snapshot.available_dates.length - 1]}
          </div>
        )}
      </div>

      {/* Header (print-friendly) */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
          Komite Toplantı Raporu
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{snapshot.date}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Persona: {snapshot.persona_name ?? "—"} · Top {snapshot.top_n.length}
        </div>
      </div>

      {/* Top N listesi */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>📋 Top {snapshot.top_n.length} Fon</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Mehmet Score sıralı (DESC). Detay için fon koduna tıklayın.
          </div>
        </div>
        {snapshot.top_n.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: "var(--muted)" }}>
            Bu tarihte hiç Top N hesaplanmamış.
          </div>
        ) : (
          snapshot.top_n.map((f, i) => (
            <Link
              key={f.fund_code}
              href={`/fonlar/${encodeURIComponent(f.fund_code)}`}
              style={{
                display: "grid",
                gridTemplateColumns: "30px 80px 1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "8px 16px",
                borderBottom: "1px solid var(--border-soft)",
                textDecoration: "none",
                color: "inherit",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--muted)", textAlign: "right" }}>
                #{i + 1}
              </span>
              <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                {f.fund_code}
              </code>
              <span style={{ color: "var(--muted)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fundNameByCode.get(f.fund_code) ?? "—"}
              </span>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                {f.components_used}/5
              </span>
              <strong
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 16,
                  color: f.mehmet_score >= 70 ? "#4cc9b0" : f.mehmet_score >= 55 ? "#e0b341" : "#e26a8f",
                  textAlign: "right",
                  minWidth: 40,
                }}
              >
                {f.mehmet_score}
              </strong>
            </Link>
          ))
        )}
      </div>

      {/* Delta paneli */}
      {snapshot.has_comparison ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            📊 Önceki güne göre değişim
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
            Karşılaştırma: {snapshot.previous_date} → {snapshot.date}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <DeltaList title="+ Yeni Giren" color="#4cc9b0" items={snapshot.newcomers} fundNameByCode={fundNameByCode} kind="newcomer" />
            <DeltaList title="− Çıkan" color="#e26a8f" items={snapshot.dropouts} fundNameByCode={fundNameByCode} kind="dropout" />
            <DeltaList title="↑ En Büyük Skor Artışı (top 3)" color="#4cc9b0" items={snapshot.top_gainers} fundNameByCode={fundNameByCode} kind="gainer" />
            <DeltaList title="↓ En Büyük Skor Düşüşü (top 3)" color="#e26a8f" items={snapshot.top_losers} fundNameByCode={fundNameByCode} kind="loser" />
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 16, fontSize: 12, color: "var(--muted)" }}>
          ℹ İlk gün — karşılaştırma için önceki snapshot yok.
        </div>
      )}
    </div>
  );
}

function DeltaList({
  title,
  color,
  items,
  fundNameByCode,
  kind,
}: {
  title: string;
  color: string;
  items: KomiteArsivDeltaItem[];
  fundNameByCode: Map<string, string>;
  kind: "newcomer" | "dropout" | "gainer" | "loser";
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>—</div>
      ) : (
        items.map((it) => {
          const deltaStr = it.delta != null ? (it.delta > 0 ? `+${it.delta}` : String(it.delta)) : "—";
          const scoreLabel = kind === "newcomer"
            ? `${it.score_yesterday ?? "—"} → ${it.score_today ?? "—"}`
            : kind === "dropout"
            ? `${it.score_yesterday ?? "—"} → ${it.score_today ?? "—"}`
            : `${it.score_yesterday ?? "—"} → ${it.score_today ?? "—"}`;
          return (
            <Link
              key={it.fund_code}
              href={`/fonlar/${encodeURIComponent(it.fund_code)}`}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr auto auto",
                gap: 8,
                alignItems: "center",
                padding: "4px 0",
                fontSize: 11,
                textDecoration: "none",
                color: "inherit",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{it.fund_code}</code>
              <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {fundNameByCode.get(it.fund_code) ?? "—"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: 10 }}>
                {scoreLabel}
              </span>
              <strong style={{ fontFamily: "var(--font-mono)", color, minWidth: 30, textAlign: "right" }}>
                {deltaStr}
              </strong>
            </Link>
          );
        })
      )}
    </div>
  );
}
