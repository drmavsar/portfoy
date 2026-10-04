"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { FxStrip } from "@/components/layout/fx-strip";
import { PrivacyToggle } from "@/components/layout/privacy-toggle";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Icon, type IconName } from "@/components/ui/icon";
import type { FxTicker } from "@/app/(app)/_lib/asset-rates";

interface NavEntry {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  section: "Genel" | "Piyasa" | "Sistem";
}

const NAV: NavEntry[] = [
  { href: "/ozet", label: "Özet", icon: "dashboard", section: "Genel" },
  { href: "/gelirler", label: "Gelirler", icon: "arrowInc", section: "Genel" },
  { href: "/giderler", label: "Giderler", icon: "arrowExp", section: "Genel" },
  { href: "/yatirimlar", label: "Portföy", icon: "wealth", section: "Genel" },
  { href: "/islemler", label: "İşlemler", icon: "swap", section: "Genel" },
  { href: "/hesaplar", label: "Hesaplar", icon: "bank", section: "Genel" },
  { href: "/raporlar", label: "Raporlar", icon: "report", section: "Genel" },
  { href: "/komite", label: "Komite", icon: "portfolio", section: "Piyasa" },
  { href: "/radar", label: "Piyasa Radarı", icon: "screener", section: "Piyasa" },
  { href: "/tarama", label: "Tarama", icon: "search", section: "Piyasa" },
  { href: "/temel", label: "Temel Analiz", icon: "report", section: "Piyasa" },
  { href: "/takvim", label: "Ekonomik Takvim", icon: "calendar", section: "Piyasa" },
  { href: "/fonlar", label: "TEFAS Fonları", icon: "wallet", section: "Piyasa" },
  { href: "/ayarlar", label: "Ayarlar", icon: "settings", section: "Sistem" },
];

const SECTIONS: Array<NavEntry["section"]> = ["Genel", "Piyasa", "Sistem"];

export function AppShell({
  children,
  fxTickers = [],
}: {
  children: React.ReactNode;
  fxTickers?: FxTicker[];
}) {
  const pathname = usePathname();
  const active = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const sub = active?.label ?? "Özet";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  // route değişince mobil drawer'ı kapat
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrawerOpen(false);
  }, [pathname]);

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      setDrawerOpen((v) => !v);
    } else {
      setDesktopCollapsed((v) => !v);
    }
  };

  return (
    <div className={`shell${desktopCollapsed ? " desktop-collapsed" : ""}`}>
      <div
        className={`sidebar-backdrop ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">Mehmet&apos;s Assets</div>
            <div className="brand-sub">Varlık</div>
          </div>
        </div>

        {SECTIONS.map((s) => {
          const items = NAV.filter((n) => n.section === s);
          if (items.length === 0) return null;
          return (
            <div key={s} className="nav-section">
              <div className="nav-section-title">{s}</div>
              {items.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`nav-item ${active?.href === n.href ? "active" : ""}`}
                  aria-current={active?.href === n.href ? "page" : undefined}
                  aria-label={desktopCollapsed ? n.label : undefined}
                  data-tip={n.label}
                >
                  <span className="icon">
                    <Icon name={n.icon} size={18} />
                  </span>
                  <span>{n.label}</span>
                  {n.badge && <span className="badge">{n.badge}</span>}
                </Link>
              ))}
            </div>
          );
        })}

        <div className="sidebar-foot">
          <div className="avatar">M</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Mehmet Avşar
            </div>
            <div className="hint">mavsar@gmail.com</div>
          </div>
          <button className="icon-btn icon-btn-ghost" data-tip="Çıkış" aria-label="Çıkış">
            <Icon name="power" size={16} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button
          className="menu-btn"
          onClick={toggleSidebar}
          aria-label={desktopCollapsed || !drawerOpen ? "Menüyü aç" : "Menüyü kapat"}
          title={desktopCollapsed ? "Menüyü genişlet" : "Menüyü daralt"}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="2" y="2.5" width="12" height="11" rx="2" />
            <path d="M6 2.5v11" />
          </svg>
        </button>

        <div className="crumb">
          <span>Mehmet&apos;s Assets</span>
          <Icon name="chev" size={12} />
          <b>{sub}</b>
        </div>

        <FxStrip tickers={fxTickers} />
        <ThemeToggle />
        <PrivacyToggle />
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
