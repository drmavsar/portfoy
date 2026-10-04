import { describe, expect, it } from "vitest";

import { findStaleBalances, type AccountActivity, type BalanceAccount } from "./stale-balances";

function acc(o: Partial<BalanceAccount>): BalanceAccount {
  return {
    id: o.id ?? "a",
    name: o.name ?? "Vadesiz",
    account_type: o.account_type ?? "checking",
    currency: o.currency ?? "TRY",
    balance_try: o.balance_try ?? 1000,
    balance_native: o.balance_native ?? null,
    updated_at: o.updated_at === undefined ? "2026-09-15T09:00:00Z" : o.updated_at,
    beneficiary_id: o.beneficiary_id ?? null,
  };
}

const TODAY = "2026-10-04";

describe("findStaleBalances", () => {
  it("TL hesabı 14+ gün güncellenmediyse bayat; 13 gün değil", () => {
    const out = findStaleBalances(
      [acc({ id: "old", updated_at: "2026-09-15T09:00:00Z" }), acc({ id: "fresh", updated_at: "2026-09-21T09:00:00Z" })],
      new Map(),
      TODAY,
    );
    expect(out.map((s) => s.id)).toEqual(["old"]);
    expect(out[0].daysSince).toBe(19);
    expect(out[0].reason).toBe("age");
  });

  it("güncellemeden sonra hareket girilmişse yaşa bakmadan bayat", () => {
    const act = new Map<string, AccountActivity>([["a", { last_txn_on: "2026-10-03", txn_count: 40 }]]);
    const out = findStaleBalances([acc({ updated_at: "2026-10-01T09:00:00Z" })], act, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe("activity");
    expect(out[0].lastTxnOn).toBe("2026-10-03");
  });

  it("aynı gün güncellenen, kasadaki ve boş hesaplar atlanır", () => {
    const act = new Map<string, AccountActivity>([["same", { last_txn_on: "2026-10-04", txn_count: 3 }]]);
    const out = findStaleBalances(
      [
        acc({ id: "same", updated_at: "2026-10-04T08:00:00Z" }),
        acc({ id: "safe", account_type: "safe", currency: "XAU", balance_try: 0, balance_native: 41, updated_at: "2026-05-17T09:00:00Z" }),
        acc({ id: "empty", balance_try: 0, updated_at: "2026-05-17T09:00:00Z" }),
      ],
      act,
      TODAY,
    );
    expect(out).toHaveLength(0);
  });

  it("döviz/altın hesabı için eşik 90 gün", () => {
    const out = findStaleBalances(
      [
        acc({ id: "usd", currency: "USD", balance_try: 0, balance_native: 10_000, updated_at: "2026-05-17T09:00:00Z" }),
        acc({ id: "eur", currency: "EUR", balance_try: 0, balance_native: 500, updated_at: "2026-07-17T09:00:00Z" }),
      ],
      new Map(),
      TODAY,
    );
    expect(out.map((s) => s.id)).toEqual(["usd"]);
  });

  it("gece yarısına yakın UTC zaman damgası İstanbul gününe çevrilir", () => {
    // 2026-09-20T22:30Z = 21 Eylül 01:30 İstanbul → 13 gün → bayat değil
    const out = findStaleBalances([acc({ updated_at: "2026-09-20T22:30:00Z" })], new Map(), TODAY);
    expect(out).toHaveLength(0);
  });
});
