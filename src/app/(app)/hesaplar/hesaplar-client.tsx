"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

import type {
  AssetRow,
  HoldingRow,
  PortfolioRow,
  TradeRow,
} from "@/app/(app)/_lib/wealth-actions";
import type { StockQuote } from "@/app/(app)/_lib/stock-prices";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "./actions";
import { deleteAccount } from "./actions";
import { NewAccountModal } from "./new-account-modal";

const subIcon: Record<string, IconName> = {
  checking: "wallet",
  savings: "wallet",
  brokerage: "wealth",
  credit_card: "wallet",
  loan: "wallet",
  crypto: "coins",
  safe: "diamond",
  other: "wallet",
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: "VADESİZ",
  savings: "VADELİ",
  brokerage: "YATIRIM",
  credit_card: "KREDİ KARTI",
  loan: "KREDİ",
  crypto: "KRİPTO",
  safe: "FİZİKİ",
  other: "DİĞER",
};

function maskIBAN(iban: string | null): string {
  if (!iban || iban === "—") return "";
  const clean = iban.replace(/\s/g, "");
  if (clean.length < 12) return iban;
  return clean.slice(0, 4) + " •••• •••• •••• " + clean.slice(-4);
}

function shortOf(custody: CustodyRow): string {
  return custody.short ?? custody.name.slice(0, 3).toUpperCase();
}

function decimalsFor(currency: string): number {
  if (currency === "BTC") return 8;
  if (["ETH", "SOL", "BNB"].includes(currency)) return 6;
  if (["XAU", "XAG", "BILEZIK22", "BILEZIK14", "BILEZIK18"].includes(currency)) return 2;
  if (currency === "XAU_OZ") return 4;
  return 0;
}

const CURRENCY_LABEL_SHORT: Record<string, string> = {
  XAU: "gr Altın",
  XAG: "gr Gümüş",
  XAU_OZ: "ons",
  CEYREK: "Çeyrek",
  YARIM: "Yarım",
  TAM: "Tam",
  CUMHURIYET: "Cumhuriyet",
  ATA: "Ata",
  RESAT: "Reşat",
  BILEZIK22: "gr 22ay",
  BILEZIK14: "gr 14ay",
  BILEZIK18: "gr 18ay",
};

function tryValueOf(a: AccountRow, fxRates: Record<string, number | undefined>): number {
  if (a.currency === "TRY") return a.balance_try ?? a.opening_balance ?? 0;
  const native = a.balance_native;
  const rate = fxRates[a.currency];
  if (native != null && rate != null) return Number(native) * rate;
  return a.balance_try ?? 0;
}

interface Props {
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  supabaseConfigured: boolean;
  fxRates: Record<string, number | undefined>;
  holdings: HoldingRow[];
  assets: AssetRow[];
  portfolios: PortfolioRow[];
  trades: TradeRow[];
  stockQuotes: Record<string, StockQuote>;
}

export function HesaplarClient({
  accounts,
  custodies,
  beneficiaries,
  supabaseConfigured,
  fxRates,
  holdings,
  assets,
  portfolios,
  trades,
  stockQuotes,
}: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const custodyMap = useMemo(
    () => Object.fromEntries(custodies.map((c) => [c.id, c])),
    [custodies],
  );
  const assetMap = useMemo(
    () => Object.fromEntries(assets.map((a) => [a.id, a])),
    [assets],
  );

  // Portföy → beneficiary mapping (trade'lerin ilk beneficiary_id'sinden)
  const portfolioBeneficiary = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trades) {
      if (t.beneficiary_id && !map.has(t.portfolio_id)) {
        map.set(t.portfolio_id, t.beneficiary_id);
      }
    }
    return map;
  }, [trades]);

  // Holding'lerin MV'si (Yahoo varsa anlık, yoksa cost)
  const holdingsWithMv = useMemo(() => {
    return holdings.map((h) => {
      const asset = assetMap[h.asset_id];
      const quote = asset ? stockQuotes[asset.symbol] : undefined;
      const qty = Number(h.quantity);
      const cost = Number(h.cost_basis_try);
      const mv = quote ? qty * quote.price : cost;
      return { ...h, mv, cost, asset };
    });
  }, [holdings, assetMap, stockQuotes]);

  // Her kişi için: hesaplar + portföy MV
  interface PersonGroup {
    id: string;
    name: string;
    color: string;
    accounts: AccountRow[];
    accountsTotal: number;
    portfolios: Array<{ portfolio: PortfolioRow; positionCount: number; mv: number; cost: number }>;
    portfolioTotal: number;
    grandTotal: number;
  }

  const groups: PersonGroup[] = useMemo(() => {
    const map = new Map<string, PersonGroup>();
    // Tanımlı kişiler
    for (const b of beneficiaries) {
      map.set(b.id, {
        id: b.id,
        name: b.name,
        color: b.color ?? "#7d8699",
        accounts: [],
        accountsTotal: 0,
        portfolios: [],
        portfolioTotal: 0,
        grandTotal: 0,
      });
    }
    // Atanmamış grubu
    map.set("__none__", {
      id: "__none__",
      name: "(Atanmamış)",
      color: "#7d8699",
      accounts: [],
      accountsTotal: 0,
      portfolios: [],
      portfolioTotal: 0,
      grandTotal: 0,
    });

    // Hesapları kişiye ekle
    for (const a of accounts) {
      const key = a.beneficiary_id ?? "__none__";
      const g = map.get(key);
      if (!g) continue;
      g.accounts.push(a);
      g.accountsTotal += tryValueOf(a, fxRates);
    }

    // Portföyleri kişiye ekle
    for (const p of portfolios) {
      const benId = portfolioBeneficiary.get(p.id);
      const rows = holdingsWithMv.filter((h) => h.portfolio_id === p.id);
      if (rows.length === 0) continue;
      const mv = rows.reduce((s, h) => s + h.mv, 0);
      const cost = rows.reduce((s, h) => s + h.cost, 0);
      const key = benId ?? "__none__";
      const g = map.get(key);
      if (!g) continue;
      g.portfolios.push({ portfolio: p, positionCount: rows.length, mv, cost });
      g.portfolioTotal += mv;
    }

    // Grand total + filter empty
    for (const g of map.values()) {
      g.grandTotal = g.accountsTotal + g.portfolioTotal;
    }

    return Array.from(map.values())
      .filter((g) => g.grandTotal > 0 || g.accounts.length > 0 || g.portfolios.length > 0)
      .sort((a, b) => b.grandTotal - a.grandTotal);
  }, [accounts, beneficiaries, portfolios, holdingsWithMv, portfolioBeneficiary, fxRates]);

  const grandTotal = groups.reduce((s, g) => s + g.grandTotal, 0);

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const r = await deleteAccount(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  if (!supabaseConfigured) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Hesaplar</div>
            <div className="page-sub">Kişi bazlı varlık dökümü.</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">Supabase yapılandırılmamış</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Hesaplar</div>
          <div className="page-sub">Kişi bazlı · banka hesapları + yatırım portföyü</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-prim" onClick={() => setNewOpen(true)} disabled={busy}>
            <Icon name="plus" size={14} /> Yeni Hesap
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      )}

      {accounts.length === 0 && holdingsWithMv.length === 0 ? (
        <div className="empty">
          <div className="title">Henüz hesap yok</div>
          <div>Sağ üstteki &quot;Yeni Hesap&quot; ile başla.</div>
        </div>
      ) : (
        <>
          {/* Üstte kişi bazlı özet */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div className="card-title">Kişi Bazlı Servet Özeti</div>
              <div className="card-sub">{groups.length} kişi</div>
            </div>
            <div style={{ padding: "12px 0" }}>
              {groups.map((g) => {
                const pct = grandTotal > 0 ? (g.grandTotal / grandTotal) * 100 : 0;
                return (
                  <div
                    key={g.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 70px",
                      gap: 12,
                      padding: "10px 20px",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{ width: 12, height: 12, borderRadius: 50, background: g.color }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{g.name}</span>
                      <span className="hint" style={{ fontSize: 11 }}>
                        · {g.accounts.length} hesap · {g.portfolios.length} portföy
                      </span>
                    </div>
                    <div className="tabular" style={{ fontWeight: 600, fontSize: 15 }}>
                      {fmt.trydp(g.grandTotal)}
                    </div>
                    <div className="hint tabular" style={{ textAlign: "right" }}>
                      %{pct.toFixed(1)}
                    </div>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid var(--border)", margin: "10px 16px 4px" }} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 70px",
                  gap: 12,
                  padding: "12px 20px",
                  background: "var(--accent-soft)",
                  margin: "0 16px",
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>
                  Toplam Servet
                </div>
                <div
                  className="tabular"
                  style={{ fontWeight: 700, fontSize: 20, color: "var(--accent)" }}
                >
                  {fmt.trydp(grandTotal)}
                </div>
                <span />
              </div>
            </div>
          </div>

          {/* Her kişi için ayrıntı */}
          <div style={{ display: "grid", gap: 18 }}>
            {groups.map((g) => (
              <div key={g.id} className="card">
                <div className="card-head">
                  <div
                    className="avatar"
                    style={{
                      background: g.color,
                      color: "#0a0d14",
                      width: 32,
                      height: 32,
                      fontSize: 13,
                    }}
                  >
                    {g.name[0]}
                  </div>
                  <div>
                    <div className="card-title">{g.name}</div>
                    <div className="card-sub">
                      Hesaplar {fmt.trydp(g.accountsTotal)} · Yatırım {fmt.trydp(g.portfolioTotal)}
                    </div>
                  </div>
                  <div
                    className="tabular"
                    style={{ marginLeft: "auto", fontWeight: 700, fontSize: 18 }}
                  >
                    {fmt.trydp(g.grandTotal)}
                  </div>
                </div>

                {/* Hesaplar — custody bazında gruplu */}
                {g.accounts.length > 0 && (() => {
                  const byCustody = new Map<string | null, AccountRow[]>();
                  for (const a of g.accounts) {
                    const k = a.custody_id;
                    if (!byCustody.has(k)) byCustody.set(k, []);
                    byCustody.get(k)!.push(a);
                  }
                  return (
                    <div>
                      <div
                        style={{
                          padding: "10px 18px 6px",
                          fontSize: 11,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        Hesaplar
                      </div>
                      {Array.from(byCustody.entries()).map(([custodyId, accs]) => {
                        const custody = custodyId ? custodyMap[custodyId] : null;
                        const custodyTotal = accs.reduce((s, a) => s + tryValueOf(a, fxRates), 0);
                        return (
                          <div key={custodyId ?? "no-custody"}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "28px 1fr auto",
                                gap: 10,
                                alignItems: "center",
                                padding: "6px 18px",
                                background: "var(--surface-2)",
                              }}
                            >
                              {custody ? (
                                <div
                                  className="bank-logo"
                                  style={{ background: custody.color ?? "#6ea8fe", width: 22, height: 22, fontSize: 9 }}
                                >
                                  {shortOf(custody)}
                                </div>
                              ) : (
                                <span />
                              )}
                              <div style={{ fontSize: 12, fontWeight: 600 }}>
                                {custody?.name ?? "(Kurum atanmamış)"}
                              </div>
                              <div className="tabular" style={{ fontSize: 12, fontWeight: 600 }}>
                                {fmt.trydp(custodyTotal)}
                              </div>
                            </div>
                            <table className="dg">
                              <tbody>
                                {accs.map((a) => (
                                  <tr key={a.id}>
                                    <td style={{ width: 28, padding: "6px 6px 6px 18px" }}>
                                      <Icon name={subIcon[a.account_type] ?? "wallet"} size={13} />
                                    </td>
                                    <td style={{ fontSize: 13, fontWeight: 500, padding: "6px 8px" }}>
                                      {a.name}
                                      <span
                                        className="hint"
                                        style={{ marginLeft: 8, fontSize: 10, letterSpacing: "0.06em" }}
                                      >
                                        {ACCOUNT_TYPE_LABEL[a.account_type] ?? a.account_type.toUpperCase()}
                                      </span>
                                    </td>
                                    <td
                                      className="mono"
                                      style={{ fontSize: 11, color: "var(--muted)", padding: "6px 8px" }}
                                    >
                                      {maskIBAN(a.iban)}
                                    </td>
                                    <td className="num tabular" style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                                      {a.currency !== "TRY" && a.balance_native != null ? (
                                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                          {fmt.tr(a.balance_native, decimalsFor(a.currency))}{" "}
                                          {CURRENCY_LABEL_SHORT[a.currency] ?? a.currency}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td
                                      className="num tabular"
                                      style={{ fontWeight: 600, padding: "6px 12px", whiteSpace: "nowrap" }}
                                    >
                                      {fmt.tr(tryValueOf(a, fxRates), 2)} ₺
                                    </td>
                                    <td style={{ width: 64, padding: "6px 12px 6px 6px" }}>
                                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                        <button
                                          className="icon-btn"
                                          onClick={() => setEditing(a)}
                                          disabled={busy}
                                          title="Düzenle"
                                        >
                                          <Icon name="edit" size={12} />
                                        </button>
                                        <button
                                          className="icon-btn"
                                          onClick={() => remove(a.id)}
                                          disabled={busy}
                                          title="Sil"
                                        >
                                          <Icon name="trash" size={12} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Yatırım portföyleri */}
                {g.portfolios.length > 0 && (
                  <div>
                    <div
                      style={{
                        padding: "10px 18px 6px",
                        fontSize: 11,
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderTop: "1px solid var(--border-soft)",
                      }}
                    >
                      Yatırım Portföyü
                    </div>
                    {g.portfolios.map((p) => {
                      const pnl = p.mv - p.cost;
                      const pnlPct = p.cost > 0 ? (pnl / p.cost) * 100 : null;
                      const color = pnl >= 0 ? "var(--positive)" : "var(--negative)";
                      return (
                        <div
                          key={p.portfolio.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "32px 1fr auto auto",
                            gap: 12,
                            alignItems: "center",
                            padding: "10px 18px",
                            borderTop: "1px solid var(--border-soft)",
                          }}
                        >
                          <div className="subacc-icon">
                            <Icon name="wealth" size={14} />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.portfolio.name}</div>
                            <div className="hint" style={{ fontSize: 11 }}>
                              {p.positionCount} pozisyon · maliyet {fmt.tr(p.cost, 0)} ₺
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div className="tabular" style={{ fontWeight: 600, fontSize: 13 }}>
                              {fmt.trydp(p.mv)}
                            </div>
                            {pnlPct != null && (
                              <div className="tabular" style={{ fontSize: 11, color }}>
                                {pnl >= 0 ? "+" : ""}
                                {fmt.tr(pnl, 0)} ₺ · {pnl >= 0 ? "+" : ""}
                                {pnlPct.toFixed(1)}%
                              </div>
                            )}
                          </div>
                          <Link
                            href="/yatirimlar"
                            className="icon-btn"
                            title="Yatırımlar sayfasına git"
                          >
                            <Icon name="ext" size={12} />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {newOpen && (
        <NewAccountModal
          custodies={custodies}
          beneficiaries={beneficiaries}
          onClose={() => setNewOpen(false)}
        />
      )}
      {editing && (
        <NewAccountModal
          custodies={custodies}
          beneficiaries={beneficiaries}
          initial={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
