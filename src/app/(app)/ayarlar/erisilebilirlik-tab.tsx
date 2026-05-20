"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
type FontScale = "normal" | "buyuk" | "cokbuyuk";

const FONT_LABELS: Record<FontScale, { label: string; desc: string }> = {
  normal: { label: "Normal", desc: "Standart boyut" },
  buyuk: { label: "Büyük", desc: "Önerilen — yakın görme için" },
  cokbuyuk: { label: "Çok Büyük", desc: "Maksimum okunabilirlik" },
};

export function ErisilebilirlikTab() {
  const [theme, setTheme] = useState<Theme>("light");
  const [fontScale, setFontScale] = useState<FontScale>("buyuk");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = (document.documentElement.dataset.theme as Theme) || "light";
    const f = (document.documentElement.dataset.fontscale as FontScale) || "buyuk";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(t);
    setFontScale(f);
    setReady(true);
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    // eslint-disable-next-line react-hooks/immutability
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("ma-theme", t);
    } catch {
      /* ignore */
    }
  };

  const applyFontScale = (f: FontScale) => {
    setFontScale(f);
    // eslint-disable-next-line react-hooks/immutability
    document.documentElement.dataset.fontscale = f;
    try {
      localStorage.setItem("ma-fontscale", f);
    } catch {
      /* ignore */
    }
  };

  if (!ready) {
    return <div className="empty"><div>Yükleniyor…</div></div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 8,
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
      >
        Görme rahatlığı ayarları. Seçimler tarayıcıda saklanır (localStorage),
        her cihazda ayrı.
      </div>

      {/* Tema */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Tema</div>
        </div>
        <div className="card-pad" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => applyTheme(t)}
              className={`btn ${theme === t ? "btn-prim" : ""}`}
              style={{ minWidth: 140, justifyContent: "center" }}
            >
              {t === "light" ? "Açık (Light)" : "Koyu (Dark)"}
              {theme === t && " ✓"}
            </button>
          ))}
        </div>
      </div>

      {/* Font ölçeği */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Yazı Boyutu</div>
        </div>
        <div className="card-pad" style={{ display: "grid", gap: 8 }}>
          {(["normal", "buyuk", "cokbuyuk"] as const).map((f) => {
            const active = fontScale === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => applyFontScale(f)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 8,
                  border:
                    "2px solid " + (active ? "var(--accent)" : "var(--border-soft)"),
                  background: active ? "var(--accent-soft)" : "var(--surface-2)",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    fontSize:
                      f === "normal" ? 15 : f === "buyuk" ? 18 : 22,
                    fontWeight: 700,
                    color: "var(--fg)",
                    minWidth: 36,
                  }}
                >
                  Aa
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>
                    {FONT_LABELS[f].label}
                  </span>
                  <span
                    style={{ display: "block", fontSize: 12, color: "var(--muted)" }}
                  >
                    {FONT_LABELS[f].desc}
                  </span>
                </span>
                {active && (
                  <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 16 }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
      >
        İpucu: Tema değiştiriciye topbar&apos;daki güneş/ay ikonundan da hızlı
        erişebilirsin. Yazı boyutu tüm sayfaları orantılı büyütür.
      </div>
    </div>
  );
}
