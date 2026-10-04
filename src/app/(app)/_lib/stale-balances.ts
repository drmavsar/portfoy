/* ============================================================
   Bayat bakiye tespiti (saf). Hesap bakiyeleri elle girilir; uzun
   süre güncellenmeyen ya da güncellendikten SONRA hareket girilmiş
   hesap, toplam serveti sessizce yanlış gösterir.
   ============================================================ */

import { istanbulToday } from "@/lib/finance/istanbul-date";

export interface BalanceAccount {
  id: string;
  name: string;
  account_type: string;
  currency: string;
  balance_try: number | null;
  balance_native: number | null;
  /** ISO zaman damgası — bakiye/hesap son düzenlenme */
  updated_at?: string | null;
  beneficiary_id: string | null;
}

export interface AccountActivity {
  last_txn_on: string;
  txn_count: number;
}

export interface StaleAccount {
  id: string;
  name: string;
  currency: string;
  beneficiary_id: string | null;
  updatedOn: string;
  daysSince: number;
  /** "activity": son güncellemeden sonra hareket girilmiş */
  reason: "age" | "activity";
  lastTxnOn: string | null;
}

/** TL nakit hesapları her gün değişir; döviz/altın hesapları daha yavaş. */
export const STALE_TRY_DAYS = 14;
export const STALE_OTHER_DAYS = 90;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function findStaleBalances(
  accounts: BalanceAccount[],
  activity: Map<string, AccountActivity>,
  today: string,
): StaleAccount[] {
  const out: StaleAccount[] = [];
  for (const a of accounts) {
    if (!a.updated_at) continue;
    const updatedOn = istanbulToday(new Date(a.updated_at));
    const daysSince = Math.max(0, daysBetween(updatedOn, today));
    const act = activity.get(a.id);
    const lastTxnOn = act?.last_txn_on ?? null;

    // Bakiye güncellendikten sonra hareket girildiyse bakiye neredeyse kesin eski
    if (lastTxnOn && lastTxnOn > updatedOn) {
      out.push({ id: a.id, name: a.name, currency: a.currency, beneficiary_id: a.beneficiary_id, updatedOn, daysSince, reason: "activity", lastTxnOn });
      continue;
    }

    // Kasadaki fiziki varlık (adet) kendiliğinden değişmez; boş hesap önemsiz
    if (a.account_type === "safe") continue;
    const empty = Number(a.balance_try ?? 0) === 0 && Number(a.balance_native ?? 0) === 0;
    if (empty) continue;

    const limit = a.currency === "TRY" ? STALE_TRY_DAYS : STALE_OTHER_DAYS;
    if (daysSince >= limit) {
      out.push({ id: a.id, name: a.name, currency: a.currency, beneficiary_id: a.beneficiary_id, updatedOn, daysSince, reason: "age", lastTxnOn });
    }
  }
  return out.sort((x, y) => (x.reason === y.reason ? y.daysSince - x.daysSince : x.reason === "activity" ? -1 : 1));
}
