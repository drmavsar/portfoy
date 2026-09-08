import { describe, expect, it } from "vitest";
import type { AccountRow } from "./actions";
import { accountTryValue, nativeBalance, nativeTotals } from "./account-grid-model";
const account = (patch: Partial<AccountRow>): AccountRow => ({ id: "a", name: "Test", custody_id: null, beneficiary_id: null, account_type: "checking", currency: "TRY", iban: null, balance_try: null, balance_native: null, opening_balance: 0, ...patch });
describe("account balances", () => {
  it("keeps units apart including gold and small crypto balances", () => {
    const rows = [account({ currency: "BTC", balance_native: 0.00000012 }), account({ currency: "BILEZIK22", balance_native: 2.5 }), account({ balance_try: -100 })];
    expect(nativeTotals(rows)).toContain("0,00000012 BTC");
    expect(nativeTotals(rows)).toContain("2,5 BILEZIK22");
    expect(nativeTotals(rows)).toContain("-100 TRY");
  });
  it("does not substitute a TRY opening balance for missing foreign units", () => {
    const a = account({ currency: "USD", opening_balance: 1000 });
    expect(nativeBalance(a)).toBeNull();
    expect(nativeTotals([a])).toContain("1 hesapta birim bakiyesi eksik");
    expect(accountTryValue(a, {})).toBeNull();
  });
  it("uses current rates when possible and stored TRY values otherwise", () => {
    const a = account({ currency: "USD", balance_native: 10, balance_try: 300 });
    expect(accountTryValue(a, { USD: 40 })).toBe(400);
    expect(accountTryValue(a, {})).toBe(300);
    expect(accountTryValue(account({ balance_try: 0, opening_balance: 500 }), {})).toBe(0);
  });
});
