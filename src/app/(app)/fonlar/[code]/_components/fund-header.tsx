import type { Fund, FundCategory } from "@/app/(app)/_lib/tefas/types";
import { INVESTMENT_UNIVERSE_LABELS } from "@/app/(app)/_lib/tefas/constants";

export function FundHeader({
  fund,
  category,
}: {
  fund: Fund;
  category: FundCategory | undefined;
}) {
  const badges: Array<[string, string]> = [];
  if (fund.is_equity_intensive) badges.push(["HSYF · %0 stopaj", "#c44569"]);
  if (fund.is_free_fund) badges.push(["Serbest fon", "#9b59b6"]);
  if (fund.is_fx_denominated) badges.push([`${fund.currency} bazlı`, "#6ea8fe"]);
  if (!fund.is_tefas_traded) badges.push(["TEFAS dışı", "#e0b341"]);

  return (
    <div>
      <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 24 }}>{fund.code}</code>
        <span>·</span>
        <span>{fund.name}</span>
      </div>
      <div className="page-sub" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
        <span>{category?.name_tr ?? "—"}</span>
        <span>·</span>
        <span>{INVESTMENT_UNIVERSE_LABELS[fund.investment_universe]}</span>
        {fund.management_firm && (
          <>
            <span>·</span>
            <span>{fund.management_firm}</span>
          </>
        )}
        {fund.risk_level !== null && (
          <>
            <span>·</span>
            <span>Risk {fund.risk_level}/7</span>
          </>
        )}
        {badges.map(([label, color]) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 4,
              background: `${color}22`,
              color,
              fontWeight: 600,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
