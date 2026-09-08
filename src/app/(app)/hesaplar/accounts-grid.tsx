"use client";

import Link from "next/link";
import { DataGrid, type GridColumn } from "@/components/grid/data-grid";
import { moneyTotals } from "@/components/grid/model";
import { Icon } from "@/components/ui/icon";
import type { AccountRow, BeneficiaryLite, CustodyRow } from "./actions";
import { accountTryValue, nativeBalance, nativeTotals } from "./account-grid-model";

const types: Record<string, string> = { checking: "Vadesiz", savings: "Vadeli", brokerage: "Yatırım", credit_card: "Kredi Kartı", loan: "Kredi", crypto: "Kripto", safe: "Fiziki", other: "Diğer" };
function maskedIban(iban: string | null) {
  const clean = (iban ?? "").replace(/\s/g, "");
  return clean.length >= 12 ? `${clean.slice(0, 4)} •••• ${clean.slice(-4)}` : clean;
}
interface Props {
  accounts: AccountRow[]; beneficiaries: BeneficiaryLite[]; custodies: CustodyRow[];
  fxRates: Record<string, number | undefined>; busy: boolean;
  onEdit: (row: AccountRow) => void; onRemove: (id: string) => void;
}
export function AccountsGrid({ accounts, beneficiaries, custodies, fxRates, busy, onEdit, onRemove }: Props) {
  const people = Object.fromEntries(beneficiaries.map(b => [b.id, b.name]));
  const banks = Object.fromEntries(custodies.map(c => [c.id, c.name]));
  const columns: GridColumn<AccountRow>[] = [
    { id: "name", title: "Hesap", value: a => a.name, width: 240, render: a => <Link href={`/hesaplar/${encodeURIComponent(a.id)}`}>{a.name}</Link> },
    { id: "person", title: "Kişi", value: a => a.beneficiary_id ? people[a.beneficiary_id] ?? "Atanmamış" : "Atanmamış", groupable: true },
    { id: "custody", title: "Kurum", value: a => a.custody_id ? banks[a.custody_id] ?? "Atanmamış" : "Atanmamış", groupable: true },
    { id: "type", title: "Hesap Türü", value: a => types[a.account_type] ?? a.account_type, groupable: true },
    { id: "currency", title: "Para Birimi / Birim", value: a => a.currency, groupable: true },
    { id: "native", title: "Birim Bakiyesi", value: nativeBalance, numeric: true, render: a => nativeBalance(a)?.toLocaleString("tr-TR", { maximumFractionDigits: 8 }) ?? "—" },
    { id: "try", title: "TL Karşılığı", value: a => accountTryValue(a, fxRates), numeric: true, render: a => accountTryValue(a, fxRates)?.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—" },
    { id: "iban", title: "IBAN", value: a => maskedIban(a.iban), width: 210 },
  ];
  const summary = (rows: AccountRow[]) => {
    const known = rows.filter(a => accountTryValue(a, fxRates) != null);
    const missing = rows.length - known.length;
    return <span>Birim bakiyeleri: {nativeTotals(rows)}<br />TL karşılığı: {moneyTotals(known, a => accountTryValue(a, fxRates)!, () => "TRY")}{missing > 0 && ` · ${missing} hesapta TL karşılığı eksik`}</span>;
  };
  return <div className="card" style={{ marginBottom: 18 }}>
    <div className="card-head"><div className="card-title">Tüm Hesaplar</div><div className="card-sub">Hareketler için hesap adına tıklayın</div></div>
    <DataGrid rows={accounts} columns={columns} rowId={a => a.id} storageKey="accounts-grid-v1" summary={summary} actions={a => <div style={{ display: "flex", gap: 4 }}>
      <button className="icon-btn" disabled={busy} title="Düzenle" onClick={() => onEdit(a)}><Icon name="edit" size={12} /></button>
      <button className="icon-btn" disabled={busy} title="Sil" onClick={() => onRemove(a.id)}><Icon name="trash" size={12} /></button>
    </div>} />
    <p className="hint" style={{ padding: "0 14px 12px" }}>TL karşılığı mevcut kur varsa kurla, yoksa kayıtlı TL bakiyesiyle gösterilir. Servet kartları tüm hesap ve portföyleri kapsar; tablo filtreleri kartları etkilemez.</p>
  </div>;
}
