"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";

type Theme = "light" | "dark";

/** Topbar'da güneş/ay ikonu — light/dark tema değiştirir, localStorage'da saklar. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cur = (document.documentElement.dataset.theme as Theme) || "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(cur);
    setReady(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ma-theme", next);
    } catch {
      /* private mode */
    }
  };

  if (!ready) return null;

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={theme === "light" ? "Koyu temaya geç" : "Açık temaya geç"}
      title={theme === "light" ? "Koyu tema" : "Açık tema"}
      style={{ width: 30, height: 30 }}
    >
      <Icon name={theme === "light" ? "moon" : "sun"} size={14} />
    </button>
  );
}
