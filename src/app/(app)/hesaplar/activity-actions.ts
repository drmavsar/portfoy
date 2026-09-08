"use server";

import { createClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import type { TransactionRow } from "@/app/(app)/_lib/cashflow-actions";
import type { TradeRow } from "@/app/(app)/_lib/wealth-actions";

export async function listAccountActivity(accountId: string) {
  const supabase = await createClient();
  const [transactions, trades] = await Promise.all([
    readAll<TransactionRow>((from, to) => supabase.from("transactions")
      .select("id, account_id, occurred_on, direction, amount, currency, description, category_id, beneficiary_id, is_transfer, notes", { count: "exact" })
      .eq("account_id", accountId).eq("status", "committed").is("deleted_at", null)
      .order("occurred_on", { ascending: false }).order("id", { ascending: true }).range(from, to), r => r.id),
    readAll<TradeRow>((from, to) => supabase.from("trades")
      .select("id, portfolio_id, custody_id, account_id, asset_id, beneficiary_id, side, executed_at, quantity, price, currency, fees, notes", { count: "exact" })
      .eq("account_id", accountId).order("executed_at", { ascending: false }).order("id", { ascending: true }).range(from, to), r => r.id),
  ]);
  return { transactions, trades };
}
