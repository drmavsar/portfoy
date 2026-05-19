/**
 * Vercel Cron — günlük servet snapshot'ı.
 *
 * vercel.json'da `crons: [{ path: "/api/cron/snapshot", schedule: "30 18 * * *" }]`
 * (UTC 18:30 → TR 21:30, BIST kapanışı sonrası).
 *
 * Authorization: Vercel cron `Authorization: Bearer ${CRON_SECRET}` gönderir.
 * Service role ile Supabase'e bağlanıp tüm hesap sahibi user'lar için snapshot
 * alır → daily_snapshots upsert.
 *
 * Gerekli env vars (Vercel Project Settings → Environment Variables):
 * - CRON_SECRET (rasgele üret)
 * - SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Settings → API → service_role)
 *
 * Test: `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/snapshot`
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import { getStockPrices } from "@/app/(app)/_lib/stock-prices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Aynı classifyAccountClass mantığı — _lib/ozet'te export edilmediği için tekrar.
function classifyAccountClass(currency: string): "cash_try" | "fx" | "metal" | "crypto" {
  if (currency === "TRY") return "cash_try";
  if (["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"].includes(currency)) return "fx";
  if (
    currency === "XAU_OZ" ||
    currency === "XAU" ||
    currency === "XAG" ||
    ["CEYREK", "YARIM", "TAM", "CUMHURIYET", "ATA", "RESAT", "BILEZIK22", "BILEZIK14", "BILEZIK18"].includes(currency)
  ) {
    return "metal";
  }
  if (["BTC", "ETH", "SOL", "USDT", "BNB"].includes(currency)) return "crypto";
  return "cash_try";
}

interface AccountRow {
  id: string;
  user_id: string;
  currency: string;
  balance_try: number | null;
  balance_native: number | null;
  opening_balance: number | null;
  beneficiary_id: string | null;
}

interface HoldingRow {
  user_id: string;
  portfolio_id: string;
  asset_id: string;
  quantity: number;
  cost_basis_try: number;
}

interface AssetRow {
  id: string;
  symbol: string;
  asset_class: string;
}

interface TradeRow {
  user_id: string;
  portfolio_id: string;
  beneficiary_id: string | null;
}

function accountTryValue(a: AccountRow, fxRates: Record<string, number>): number {
  if (a.currency === "TRY") return Number(a.balance_try ?? a.opening_balance ?? 0);
  const native = a.balance_native != null ? Number(a.balance_native) : null;
  const rate = fxRates[a.currency];
  if (native != null && rate != null) return native * rate;
  return Number(a.balance_try ?? 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

async function computeUserSnapshot(
  supabase: SupabaseLike,
  userId: string,
  fxRates: Record<string, number>,
) {
  const { data: accounts = [] } = await supabase
    .from("accounts")
    .select("id, user_id, currency, balance_try, balance_native, opening_balance, beneficiary_id")
    .eq("user_id", userId)
    .is("archived_at", null);

  const { data: holdings = [] } = await supabase
    .from("holdings")
    .select("user_id, portfolio_id, asset_id, quantity, cost_basis_try")
    .eq("user_id", userId);

  const { data: assets = [] } = await supabase
    .from("assets")
    .select("id, symbol, asset_class")
    .eq("user_id", userId);

  const { data: trades = [] } = await supabase
    .from("trades")
    .select("user_id, portfolio_id, beneficiary_id")
    .eq("user_id", userId);

  const assetMap = new Map<string, AssetRow>(
    ((assets ?? []) as AssetRow[]).map((a) => [a.id, a]),
  );

  // Hesap class'ları
  let cashTotal = 0;
  let fxTotal = 0;
  let metalTotal = 0;
  for (const a of ((accounts ?? []) as AccountRow[])) {
    const v = accountTryValue(a, fxRates);
    const c = classifyAccountClass(a.currency);
    if (c === "cash_try") cashTotal += v;
    else if (c === "fx") fxTotal += v;
    else if (c === "metal") metalTotal += v;
  }

  // Yatırım MV — BIST sembolleri için Yahoo quote
  const bistSymbols: string[] = [];
  const equityHoldings: Array<HoldingRow & { symbol: string }> = [];
  for (const h of ((holdings ?? []) as HoldingRow[])) {
    const a = assetMap.get(h.asset_id);
    if (!a) continue;
    if (a.asset_class === "equity_tr") {
      bistSymbols.push(a.symbol);
      equityHoldings.push({ ...h, symbol: a.symbol });
    }
  }
  const quotes = bistSymbols.length > 0 ? await getStockPrices(bistSymbols) : {};

  let investmentMv = 0;
  const equityByPerson: Record<string, number> = {};
  // Portföy → ilk trade beneficiary
  const portfolioBen = new Map<string, string>();
  for (const t of ((trades ?? []) as TradeRow[])) {
    if (t.beneficiary_id && !portfolioBen.has(t.portfolio_id)) {
      portfolioBen.set(t.portfolio_id, t.beneficiary_id);
    }
  }
  for (const h of equityHoldings) {
    const q = quotes[h.symbol];
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis_try);
    const mv = q ? qty * q.price : cost;
    investmentMv += mv;
    const benId = portfolioBen.get(h.portfolio_id);
    if (benId) equityByPerson[benId] = (equityByPerson[benId] ?? 0) + mv;
  }

  const totalWealth = cashTotal + fxTotal + metalTotal + investmentMv;

  return {
    total_wealth: totalWealth,
    cash_try: cashTotal,
    fx_try: fxTotal,
    metal_try: metalTotal,
    equity_mv: investmentMv,
    crypto_try: 0,
    equity_by_person: equityByPerson,
  };
}

export async function GET(req: NextRequest) {
  // Vercel Cron: Authorization: Bearer CRON_SECRET
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing env: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 },
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Distinct user_id'leri çek (account'u olan)
  const { data: accountUsers, error: usersErr } = await supabase
    .from("accounts")
    .select("user_id")
    .is("archived_at", null);
  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }
  const userIds = Array.from(
    new Set(((accountUsers ?? []) as { user_id: string }[]).map((a) => a.user_id)),
  );

  // FX rates bir kez çekilir, tüm user'lar için kullanılır
  const fxRates = await getAssetRates();

  const today = new Date().toISOString().slice(0, 10);
  const results: Array<{ user_id: string; ok: boolean; total?: number; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const snap = await computeUserSnapshot(supabase, userId, fxRates);
      if (snap.total_wealth <= 0) {
        results.push({ user_id: userId, ok: false, error: "total_wealth = 0" });
        continue;
      }
      const { error } = await supabase.from("daily_snapshots").upsert(
        {
          user_id: userId,
          snapshot_date: today,
          ...snap,
        } as never,
        { onConflict: "user_id,snapshot_date" },
      );
      if (error) {
        results.push({ user_id: userId, ok: false, error: error.message });
      } else {
        results.push({ user_id: userId, ok: true, total: snap.total_wealth });
      }
    } catch (err) {
      results.push({
        user_id: userId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    snapshot_date: today,
    user_count: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
