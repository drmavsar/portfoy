import Link from "next/link";
import { notFound } from "next/navigation";
import { listAccounts, listBeneficiariesLite } from "../actions";
import { listAccountActivity } from "../activity-actions";
import { listAssets } from "@/app/(app)/_lib/wealth-actions";
import { listCategories } from "@/app/(app)/ayarlar/actions";
import { ActivityGrid, type ActivityRow } from "./activity-grid";

export const dynamic = "force-dynamic";
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = (await listAccounts()).find(a => a.id === id);
  if (!account) notFound();
  const [{ transactions, trades }, assets, people, categories] = await Promise.all([
    listAccountActivity(id), listAssets(), listBeneficiariesLite(), listCategories(),
  ]);
  const assetMap = Object.fromEntries(assets.map(a => [a.id, a.symbol]));
  const peopleMap = Object.fromEntries(people.map(p => [p.id, p.name]));
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const person = (id: string | null) => id ? peopleMap[id] ?? "Atanmamış" : "Atanmamış";
  const rows: ActivityRow[] = [
    ...transactions.map(t => ({ id: `cash-${t.id}`, date: t.occurred_on.slice(0, 10), kind: t.is_transfer || t.direction === "transfer" ? "Transfer" : t.direction === "inflow" ? "Gelir" : "Gider", description: t.description ?? "—", category: t.category_id ? categoryMap[t.category_id] ?? "Atanmamış" : "Atanmamış", person: person(t.beneficiary_id), amount: Number(t.amount), currency: t.currency, notes: t.notes })),
    ...trades.map(t => ({ id: `trade-${t.id}`, date: t.executed_at.slice(0, 10), kind: t.side === "buy" ? "Alış" : "Satış", description: assetMap[t.asset_id] ?? t.asset_id, category: "Yatırım", person: person(t.beneficiary_id), amount: Number(t.quantity) * Number(t.price) + (t.side === "buy" ? Number(t.fees) : -Number(t.fees)), currency: t.currency, notes: t.notes })),
  ];
  return <div><div className="page-head"><div><div className="page-title">{account.name}</div><div className="page-sub">Hesaba bağlı hareketler · {account.currency}</div></div><Link className="btn" href="/hesaplar">Hesaplara dön</Link></div>
    <ActivityGrid rows={rows} accountId={id} />
    <p className="hint" style={{ marginTop: 12 }}>Yalnızca bu hesaba açıkça bağlanan kayıtlar gösterilir. Yatırım tutarları alışta komisyon dahil, satışta komisyon düşülmüş tutardır. Hareketler hesap bakiyesinin yeniden hesaplaması değildir; transferler ayrı gösterilir.</p>
  </div>;
}
