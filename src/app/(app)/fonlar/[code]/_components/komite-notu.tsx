import type { KomiteNotuOutput } from "@/app/(app)/_lib/tefas/komite-notu";

export function KomiteNotu({ output }: { output: KomiteNotuOutput }) {
  const lines = output.text.split("\n").filter((l) => l.length > 0);
  return (
    <div className="card" style={{ borderLeft: "3px solid #6ea8fe" }}>
      <div className="card-head">
        <div className="card-title">🤖 Algoritmik Komite Notu</div>
        <div className="card-sub">
          deterministik · {output.clauses_used.length} clause
        </div>
      </div>
      <div style={{ padding: "14px 18px", display: "grid", gap: 10 }}>
        {lines.slice(0, -1).map((line, idx) => (
          <p
            key={idx}
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--fg)",
            }}
          >
            {line}
          </p>
        ))}
        {/* Son satır disclaimer — küçük ve sönük */}
        <p
          style={{
            margin: 0,
            marginTop: 6,
            paddingTop: 8,
            borderTop: "1px solid var(--border-soft)",
            fontSize: 11,
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          ⓘ {lines[lines.length - 1]}
        </p>
        {!output.is_sufficient && (
          <div
            style={{
              padding: 10,
              background: "#e0b34122",
              borderRadius: 6,
              fontSize: 11,
              color: "#e0b341",
            }}
          >
            Bu fon için yeterli geçmiş veri yok. Daha güvenilir bir not için
            NAV/skor cache&apos;in dolması beklenmeli.
          </div>
        )}
      </div>
    </div>
  );
}
