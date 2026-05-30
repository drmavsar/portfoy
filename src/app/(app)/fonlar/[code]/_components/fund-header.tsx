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

  // funds.name seed sırasında bazen kodun kendisi olarak doldurulur. Gerçek
  // ad TEFAS title'ından gelir (PR-C backfill funds.name'i UPDATE eder).
  // Burada code === name durumunda subtitle'ı gizle — "KPC · KPC" tekrarını
  // göstermemek için.
  const hasRealName =
    typeof fund.name === "string" && fund.name.trim() !== "" && fund.name.trim() !== fund.code;

  return (
    <div>
      <div className="page-title">
        <code style={{ fontFamily: "var(--font-mono)", fontSize: 24 }}>{fund.code}</code>
      </div>
      {hasRealName && (
        <div
          style={{
            fontSize: 14,
            color: "var(--fg)",
            marginTop: 2,
            opacity: 0.85,
            // Desktop'ta tam görünsün; mobilde uzun adlar ellipsis ile kesilsin.
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 720,
          }}
          title={fund.name}
        >
          {fund.name}
        </div>
      )}
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
