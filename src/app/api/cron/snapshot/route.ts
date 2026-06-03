/**
 * Vercel Cron — günlük servet snapshot'ı.
 *
 * vercel.json'da `crons: [{ path: "/api/cron/snapshot", schedule: "0 20 * * *" }]`
 * (UTC 20:00 → TR 23:00, gün sonu kanonik snapshot).
 *
 * `snapshot_date` İstanbul takvim gününe göre yazılır — UTC ile TR arasındaki
 * 3 saatlik kayma cron çalışırken aynı günü hedeflesin diye.
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
import { istanbulToday } from "@/lib/finance/istanbul-date";

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
  // Sorgu hataları sessizce yutulmamalı: hata olursa snapshot'ı YAZMA. upsert
  // ile boş/0 bir satır yazmak, daha önce alınmış doğru kaydı ezerdi (geçmiş
  // bozulur). Throw → dış catch → o user atlanır, eski kayıt korunur.
  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("id, user_id, currency, balance_try, balance_native, opening_balance, beneficiary_id")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (accErr) throw new Error(`accounts: ${accErr.message}`);

  const { data: holdings, error: holdErr } = await supabase
    .from("v_holdings_wac")
    .select("user_id, portfolio_id, asset_id, quantity, cost_basis_try")
    .eq("user_id", userId);
  if (holdErr) throw new Error(`holdings: ${holdErr.message}`);
  const holdingRows = (holdings ?? []) as HoldingRow[];

  // `assets` global bir tablodur — user_id kolonu YOK. Eskiden `.eq("user_id",
  // userId)` filtresi sorguyu hataya düşürüp assetMap'i boşaltıyordu; o yüzden
  // her holding `if (!a) continue` ile atlanıp equity_mv=0 yazılıyordu. Holding'-
  // lerin asset_id'leriyle çek.
  const assetIds = Array.from(new Set(holdingRows.map((h) => h.asset_id)));
  let assets: AssetRow[] = [];
  if (assetIds.length > 0) {
    const { data: assetData, error: assetErr } = await supabase
      .from("assets")
      .select("id, symbol, asset_class")
      .in("id", assetIds);
    if (assetErr) throw new Error(`assets: ${assetErr.message}`);
    assets = (assetData ?? []) as AssetRow[];
  }

  const { data: trades, error: tradeErr } = await supabase
    .from("trades")
    .select("user_id, portfolio_id, beneficiary_id")
    .eq("user_id", userId);
  if (tradeErr) throw new Error(`trades: ${tradeErr.message}`);

  const assetMap = new Map<string, AssetRow>(assets.map((a) => [a.id, a]));

  // Hesap class kırılımı + tüm hesapların toplamı. accountTotal, ozet
  // sayfasındaki grandTotal ile tutarlı olması için TÜM hesapları içerir
  // (kripto/diğer dahil); class total'ları yalnızca kart kırılımı içindir.
  let cashTotal = 0;
  let fxTotal = 0;
  let metalTotal = 0;
  let accountTotal = 0;
  for (const a of ((accounts ?? []) as AccountRow[])) {
    const v = accountTryValue(a, fxRates);
    accountTotal += v;
    const c = classifyAccountClass(a.currency);
    if (c === "cash_try") cashTotal += v;
    else if (c === "fx") fxTotal += v;
    else if (c === "metal") metalTotal += v;
  }

  // Portföy → ilk trade beneficiary
  const portfolioBen = new Map<string, string>();
  for (const t of ((trades ?? []) as TradeRow[])) {
    if (t.beneficiary_id && !portfolioBen.has(t.portfolio_id)) {
      portfolioBen.set(t.portfolio_id, t.beneficiary_id);
    }
  }

  // Yatırım MV — BIST sembolleri için Yahoo quote çekilir.
  const bistSymbols: string[] = [];
  for (const h of holdingRows) {
    const a = assetMap.get(h.asset_id);
    if (a && a.asset_class === "equity_tr") bistSymbols.push(a.symbol);
  }
  const quotes = bistSymbols.length > 0 ? await getStockPrices(bistSymbols) : {};

  // TÜM holding'ler dahil — BIST dışı varlıklar (equity_us, crypto, metal)
  // Yahoo quote'u olmadığından cost_basis ile değerlenir; aksi halde
  // total_wealth eksik kalırdı. Asset bulunamasa da (ör. is_active=false)
  // cost ile değerlenir — ozet sayfasıyla aynı; pozisyon sessizce 0'lanmaz.
  let investmentMv = 0;
  const equityByPerson: Record<string, number> = {};
  for (const h of holdingRows) {
    const a = assetMap.get(h.asset_id);
    const qty = Number(h.quantity);
    const cost = Number(h.cost_basis_try);
    const q = a ? quotes[a.symbol] : undefined;
    const mv = q ? qty * q.price : cost;
    investmentMv += mv;
    const benId = portfolioBen.get(h.portfolio_id);
    if (benId) equityByPerson[benId] = (equityByPerson[benId] ?? 0) + mv;
  }

  // Açık pozisyon varken equity 0 çıkmamalı (cost fallback var). 0 çıkıyorsa
  // bir şeyler ters gitmiştir — upsert ile geçmişteki doğru değeri ezme.
  if (holdingRows.length > 0 && investmentMv <= 0) {
    throw new Error(
      `equity_mv=0 with ${holdingRows.length} holdings — snapshot atlandı (geçmiş korunuyor)`,
    );
  }

  const totalWealth = accountTotal + investmentMv;

  return {
    total_wealth: totalWealth,
    cash_try: cashTotal,
    fx_try: fxTotal,
    metal_try: metalTotal,
    equity_mv: investmentMv,
    // ozet sayfasıyla aynı: kripto total_wealth'e dahil ama ayrı kolona yazılmıyor.
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

  const today = istanbulToday();
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
