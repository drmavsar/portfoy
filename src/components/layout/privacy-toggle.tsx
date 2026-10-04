"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";

const STORAGE_KEY = "privacy-mode";

/** Topbar'da göz ikonu — sayısal verileri (.tabular) blur eder.
 *  Özet sayfasının default'u GİZLİ olur; toggle ile aç/kapat,
 *  sessionStorage ile session boyunca hatırlanır. */
export function PrivacyToggle() {
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);

  // Hydration için sessionStorage'ı effect içinde oku; SSR'da window yok.
  // Default: GÖRÜNÜR (false). Kullanıcı isterse göz butonuna basıp gizler.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const initial = saved === "1";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || typeof document === "undefined") return;
    document.body.dataset.private = hidden ? "true" : "false";
    sessionStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  }, [hidden, ready]);

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setHidden((v) => !v)}
      aria-label={hidden ? "Tutarları göster" : "Tutarları gizle"}
      aria-pressed={hidden}
      title={hidden ? "Tutarları göster" : "Tutarları gizle"}
    >
      <Icon name="eye" size={18} />
      {hidden && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            width: 20,
            height: 2,
            background: "currentColor",
            transform: "rotate(-25deg)",
            borderRadius: 2,
          }}
        />
      )}
    </button>
  );
}
