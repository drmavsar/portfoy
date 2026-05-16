"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { FxStrip } from "@/components/layout/fx-strip";
import { Icon, type IconName } from "@/components/ui/icon";

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
  { href: "/yatirimlar", label: "Yatırımlar", icon: "wealth", section: "Genel" },
  { href: "/islemler", label: "İşlemler", icon: "swap", section: "Genel" },
  { href: "/hesaplar", label: "Hesaplar", icon: "bank", section: "Genel" },
  { href: "/raporlar", label: "Raporlar", icon: "report", section: "Genel" },
  { href: "/radar", label: "Piyasa Radarı", icon: "screener", badge: "6", section: "Piyasa" },
  { href: "/ayarlar", label: "Ayarlar", icon: "settings", section: "Sistem" },
];

const SECTIONS: Array<NavEntry["section"]> = ["Genel", "Piyasa", "Sistem"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  const sub = active?.label ?? "Özet";
  const [drawerOpen, setDrawerOpen] = useState(false);

  // route değişince drawer'ı kapat
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="shell">
      <div
        className={`sidebar-backdrop ${drawerOpen ? "open" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">M·A</div>
          <div>
            <div className="brand-name">Mehmet&apos;s Assets</div>
            <div className="brand-sub">Varlık</div>
          </div>
        </div>

        {SECTIONS.map((s) => {
          const items = NAV.filter((n) => n.section === s);
          if (items.length === 0) return null;
          return (
            <div key={s}>
              <div className="nav-section-title">{s}</div>
              {items.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`nav-item ${active?.href === n.href ? "active" : ""}`}
                >
                  <span className="icon">
                    <Icon name={n.icon} size={15} />
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
                fontSize: 12,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Mehmet
            </div>
            <div className="hint">mehmet@eku.com.tr</div>
          </div>
          <button className="icon-btn" data-tip="Tema">
            <Icon name="moon" size={14} />
          </button>
          <button className="icon-btn" data-tip="Çıkış">
            <Icon name="power" size={14} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <button
          className="menu-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Menüyü aç"
        >
          <Icon name="filter" size={16} />
        </button>

        <div className="crumb">
          <span>Mehmet&apos;s Assets</span>
          <Icon name="chev" size={11} />
          <b>{sub}</b>
        </div>

        <FxStrip />

        <div className="topbar-filters">
          <div className="search">
            <Icon name="search" size={12} />
            <input placeholder="Ara…" />
            <span className="kbd">⌘K</span>
          </div>
          <button className="tb-filter">
            <span className="lbl">Hane</span>
            <span className="val">Tümü</span>
            <Icon name="chev" size={10} stroke={2} />
          </button>
          <button className="tb-filter">
            <Icon name="calendar" size={12} />
            <span className="val">Son 30 Gün</span>
            <Icon name="chev" size={10} stroke={2} />
          </button>
          <button className="tb-filter">
            <span className="lbl">Görünüm</span>
            <span className="val">₺ Nominal</span>
          </button>
          <button className="icon-btn" data-tip="Bildirimler">
            <Icon name="bell" size={14} />
          </button>
        </div>
      </header>

      <main className="main">{children}</main>
    </div>
  );
}
