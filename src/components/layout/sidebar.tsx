"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Ana Kokpit", short: "Dashboard" },
  { href: "/cashflow", label: "Nakit Akışı", short: "Cashflow" },
  { href: "/wealth", label: "Varlık Yönetimi", short: "Wealth" },
  { href: "/screener", label: "Piyasa Radarı", short: "Screener" },
  { href: "/settings", label: "Kurallar & Ayarlar", short: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-[color:var(--border)] bg-[color:var(--surface)] flex flex-col">
      <div className="px-5 py-5 border-b border-[color:var(--border)]">
        <p className="text-xs uppercase tracking-widest text-[color:var(--muted)]">
          Mehmet&apos;s
        </p>
        <p className="text-lg font-semibold leading-tight">Wealth OS</p>
      </div>
      <nav className="flex-1 px-2 py-4 flex flex-col gap-1 text-sm">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "px-3 py-2 rounded-md transition-colors",
                active
                  ? "bg-[color:var(--surface-muted)] text-[color:var(--foreground)] font-medium"
                  : "text-[color:var(--muted)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--foreground)]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 text-xs text-[color:var(--muted)] border-t border-[color:var(--border)]">
        v0.1 — MVP
      </div>
    </aside>
  );
}
