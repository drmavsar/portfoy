import { fmt } from "@/lib/finance/fmt";

interface SectorRow {
  code: string;
  name: string;
  chg: number;
}

export function SectorBars({ sectors }: { sectors: SectorRow[] }) {
  const max = Math.max(...sectors.map((s) => Math.abs(s.chg)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {sectors.map((s) => {
        const w = (Math.abs(s.chg) / max) * 100;
        const pos = s.chg >= 0;
        return (
          <div
            key={s.code}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 1fr 60px",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              padding: "4px 0",
            }}
          >
            <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              {s.code}
            </span>
            <span style={{ color: "var(--fg-soft)" }}>{s.name}</span>
            <div
              style={{
                height: 14,
                position: "relative",
                background: "var(--surface-2)",
                borderRadius: 3,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: "var(--border)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  bottom: 2,
                  ...(pos
                    ? { left: "50%", width: `${w / 2}%` }
                    : { right: "50%", width: `${w / 2}%` }),
                  background: pos ? "var(--positive)" : "var(--negative)",
                  borderRadius: 2,
                  opacity: 0.85,
                }}
              />
            </div>
            <span
              className="tabular"
              style={{
                textAlign: "right",
                color: pos ? "var(--positive)" : "var(--negative)",
                fontWeight: 600,
              }}
            >
              {fmt.pct(s.chg)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
