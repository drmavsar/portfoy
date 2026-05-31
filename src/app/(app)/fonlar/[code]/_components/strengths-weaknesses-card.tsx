interface Props {
  strengths: string[];
  weaknesses: string[];
}

export function StrengthsWeaknessesCard({ strengths, weaknesses }: Props) {
  const empty = strengths.length === 0 && weaknesses.length === 0;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 12 }}>
        Güçlü / Zayıf Yönler
      </div>
      {empty ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Belirgin güçlü/zayıf yön tespit edilmedi (orta seviyede bileşenler).
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#4cc9b0", fontWeight: 600, marginBottom: 6 }}>
              ✓ Güçlü
            </div>
            {strengths.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {strengths.map((s, i) => (
                  <li key={i} style={{ fontSize: 12, padding: "3px 0", color: "var(--fg)", lineHeight: 1.4 }}>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#e26a8f", fontWeight: 600, marginBottom: 6 }}>
              ⚠ Dikkat
            </div>
            {weaknesses.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>—</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {weaknesses.map((s, i) => (
                  <li key={i} style={{ fontSize: 12, padding: "3px 0", color: "var(--fg)", lineHeight: 1.4 }}>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
