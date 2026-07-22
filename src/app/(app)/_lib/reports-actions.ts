"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";
import { processSellTrade } from "@/app/(app)/_lib/tefas/realized-lots-processor";

export interface RawTxn {
  occurred_on: string;
  direction: "inflow" | "outflow" | "transfer";
  amount: number;
  currency: string;
  category_id: string | null;
  beneficiary_id: string | null;
  description: string | null;
  merchant_raw: string | null;
}

/**
 * Raporlar için ham transactions (son N ay, committed, transfer hariç).
 *
 * PostgREST default 1000 satır cap'ini aşmak için range() ile sayfalama
 * yapılır — ASC + no-limit varyantı en yeni ayları sessizce düşürüyordu
 * (aktif kullanıcıda 24 ay > 1000 satır).
 */
export async function listTransactionsForReports(sinceMonths: number = 24): Promise<RawTxn[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  since.setDate(1);
  const sinceIso = since.toISOString().slice(0, 10);

  const pageSize = 1000;
  const out: RawTxn[] = [];
  // Soft-delete edilen (deleted_at set) kayıtlar rapor/özet toplamlarına
  // dahil edilmemeli — silme işlemi status'ü 'committed' bıraktığından
  // yalnızca status filtresi yetmez. 0018 migration'ı çalışmamış ortamda
  // deleted_at kolonu olmayabilir; o durumda filtre düşürülür (cashflow-actions
  // ile aynı davranış).
  let filterDeleted = true;
  for (let from = 0; ; from += pageSize) {
    let q = supabase
      .from("transactions")
      .select("occurred_on, direction, amount, currency, category_id, beneficiary_id, description, merchant_raw")
      .eq("status", "committed")
      .eq("is_transfer", false)
      .gte("occurred_on", sinceIso);
    if (filterDeleted) q = q.is("deleted_at", null);
    const { data, error } = await q
      .order("occurred_on", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (filterDeleted && (msg.includes("deleted_at") || error.code === "42703")) {
        console.warn(
          "listTransactionsForReports: deleted_at kolonu yok — 0018 migration çalıştırılmamış. Filter düşürüldü.",
        );
        filterDeleted = false;
        from -= pageSize; // aynı sayfayı filtresiz tekrar dene
        continue;
      }
      console.error("listTransactionsForReports error", error);
      return [];
    }
    const batch = (data ?? []) as unknown as RawTxn[];
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

export interface RawRealizedLot {
  id: string;
  closed_at: string;
  sell_trade_id: string;
  buy_trade_id: string | null;
  asset_id: string;
  asset_symbol: string;
  asset_name: string;
  asset_class: string;
  portfolio_id: string;
  portfolio_name: string;
  beneficiary_id: string | null;
  quantity: number;
  cost_basis_try: number;
  proceeds_try: number;
  realized_pnl_try: number;
  net_realized_pnl_try: number;
  withholding_try: number;
  fees_allocated_try: number;
  holding_period_days: number | null;
  method: "FIFO" | "HIFO";
}

/**
 * Realized (kapatılmış) pozisyonlar — Yatırım Performansı raporu için.
 * sinceMonths kadar geriye gider. Lazy backfill: eksik sell trade'leri için
 * processSellTrade çağrısı yapılır (idempotent, wealth-actions hatasında
 * fallback olarak burada da tetiklenir).
 */
export async function listRealizedForReport(sinceMonths: number = 24): Promise<RawRealizedLot[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  since.setDate(1);
  const sinceIso = since.toISOString();

  // 1. Lazy backfill — kullanıcının bu dönemdeki sell'lerinden realized_lots'ta olmayanları işle.
  const { data: sells } = await supabase
    .from("trades")
    .select("id")
    .eq("user_id", user.id)
    .eq("side", "sell")
    .gte("executed_at", sinceIso);
  const sellIds = ((sells ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (sellIds.length > 0) {
    const { data: existingRaw } = await supabase
      .from("realized_lots")
      .select("sell_trade_id")
      .in("sell_trade_id", sellIds);
    const existing = new Set(
      ((existingRaw ?? []) as Array<{ sell_trade_id: string }>).map((e) => e.sell_trade_id),
    );
    const pending = sellIds.filter((id) => !existing.has(id));
    for (const sellId of pending) {
      const r = await processSellTrade(supabase, sellId);
      if (!r.ok) console.error("listRealizedForReport lazy backfill", sellId, r.error);
    }
  }

  // 2. realized_lots (backfill sonrası)
  const { data: lotsRaw, error: lotsErr } = await supabase
    .from("realized_lots")
    .select(
      "id, closed_at, sell_trade_id, buy_trade_id, asset_id, portfolio_id, quantity, cost_basis_try, proceeds_try, realized_pnl_try, net_realized_pnl_try, withholding_try, fees_allocated_try, holding_period_days, method",
    )
    .eq("user_id", user.id)
    .gte("closed_at", sinceIso)
    .order("closed_at", { ascending: false });
  if (lotsErr) {
    console.error("listRealizedForReport lots error", lotsErr);
    return [];
  }
  const lots = (lotsRaw ?? []) as Array<{
    id: string;
    closed_at: string;
    sell_trade_id: string;
    buy_trade_id: string | null;
    asset_id: string;
    portfolio_id: string;
    quantity: number;
    cost_basis_try: number;
    proceeds_try: number;
    realized_pnl_try: number;
    net_realized_pnl_try: number;
    withholding_try: number;
    fees_allocated_try: number;
    holding_period_days: number | null;
    method: "FIFO" | "HIFO";
  }>;
  if (lots.length === 0) return [];

  // 3. join lookups
  const assetIds = Array.from(new Set(lots.map((l) => l.asset_id)));
  const portfolioIds = Array.from(new Set(lots.map((l) => l.portfolio_id)));
  const sellIdSet = Array.from(new Set(lots.map((l) => l.sell_trade_id)));

  const [{ data: assetsRaw }, { data: portfoliosRaw }, { data: sellsRaw }] = await Promise.all([
    supabase.from("assets").select("id, symbol, name, asset_class").in("id", assetIds),
    supabase.from("portfolios").select("id, name").in("id", portfolioIds),
    supabase.from("trades").select("id, beneficiary_id").in("id", sellIdSet),
  ]);

  const assetMap = new Map(
    ((assetsRaw ?? []) as Array<{ id: string; symbol: string; name: string; asset_class: string }>).map(
      (a) => [a.id, a],
    ),
  );
  const portfolioMap = new Map(
    ((portfoliosRaw ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p]),
  );
  const sellBenMap = new Map(
    ((sellsRaw ?? []) as Array<{ id: string; beneficiary_id: string | null }>).map((s) => [
      s.id,
      s.beneficiary_id,
    ]),
  );

  return lots.map((l) => {
    const a = assetMap.get(l.asset_id);
    const p = portfolioMap.get(l.portfolio_id);
    return {
      id: l.id,
      closed_at: l.closed_at,
      sell_trade_id: l.sell_trade_id,
      buy_trade_id: l.buy_trade_id,
      asset_id: l.asset_id,
      asset_symbol: a?.symbol ?? "?",
      asset_name: a?.name ?? "?",
      asset_class: a?.asset_class ?? "",
      portfolio_id: l.portfolio_id,
      portfolio_name: p?.name ?? "?",
      beneficiary_id: sellBenMap.get(l.sell_trade_id) ?? null,
      quantity: Number(l.quantity),
      cost_basis_try: Number(l.cost_basis_try),
      proceeds_try: Number(l.proceeds_try),
      realized_pnl_try: Number(l.realized_pnl_try),
      net_realized_pnl_try: Number(l.net_realized_pnl_try),
      withholding_try: Number(l.withholding_try),
      fees_allocated_try: Number(l.fees_allocated_try),
      holding_period_days: l.holding_period_days,
      method: l.method,
    };
  });
}
