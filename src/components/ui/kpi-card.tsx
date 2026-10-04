import type { ReactNode } from "react";

import { Sparkline } from "@/components/charts/sparkline";
import { Delta } from "@/components/ui/delta";
import { Skel } from "@/components/ui/feedback";
import type { Currency } from "@/lib/design/format";

export interface KpiSecondary {
  /** USD, EUR, ALTIN */
  label: string;
  value: string;
}

interface KpiCardProps {
  label: string;
  /** Ana tutar, ör. "₺5.214.300" ya da kısaltılmış "₺5,21 Mn". */
  value: string;
  /** Kısaltılmış değerin tam hali — ipucunda gösterilir (noktalı alt çizgi). */
  fullValue?: string;
  /** Tutar olarak değişim (+₺18.450). */
  change?: number | null;
  changeCur?: Currency;
  /** Yüzde olarak değişim (+%0,35). */
  changePct?: number | null;
  /** Değişim etiketi, ör. "bugün", "geçen aya göre". */
  changeLabel?: string;
  /** Artışın kötü olduğu ölçüler (gider): ok yönü değeri, renk anlamı söyler. */
  invert?: boolean;
  /** İkincil para birimleri — ana tutarın satırına yazılmaz, kendi ızgarasında durur. */
  secondary?: KpiSecondary[];
  spark?: number[];
  state?: "ready" | "loading" | "error" | "empty";
  /** Hata halinde son bilinen değerin altında gösterilen not. */
  note?: ReactNode;
  /** Boş halde açıklama + eylem. */
  emptyText?: ReactNode;
  footer?: ReactNode;
}

/**
 * KPI kartı — üç katman: etiket; ana tutar ve değişim; ikincil birimler.
 * Kural: ana rakam kart genişliğini aşacaksa kısaltılmış biçime geçilir
 * (value="₺5,21 Mn", fullValue="₺5.214.300,00").
 */
export function KpiCard({
  label,
  value,
  fullValue,
  change,
  changeCur = "TRY",
  changePct,
  changeLabel,
  invert,
  secondary,
  spark,
  state = "ready",
  note,
  emptyText,
  footer,
}: KpiCardProps) {
  if (state === "loading") {
    return (
      <div className="kpi" aria-busy="true">
        <span className="kpi-label">{label}</span>
        <Skel w="70%" h={30} r={6} />
        <Skel w="45%" h={20} r={999} />
        {secondary && <Skel h={44} r={8} />}
      </div>
    );
  }

  const cls = ["kpi", state === "empty" ? "is-empty" : "", state === "error" ? "is-stale" : ""].filter(Boolean).join(" ");
  const hasChange = change != null || changePct != null;

  return (
    <div className={cls}>
      <div className="kpi-head">
        <div>
          <span className="kpi-label">{label}</span>
          <span className="kpi-value tabular" title={fullValue}>
            {value}
          </span>
        </div>
        {spark && spark.length > 1 && state === "ready" && (
          <div className="kpi-spark">
            <Sparkline values={spark} width={88} height={34} stroke={2} color="var(--accent)" endDot />
          </div>
        )}
      </div>

      {state === "ready" && hasChange && (
        <div className="kpi-row">
          {change != null && <Delta badge kind="money" value={change} cur={changeCur} invert={invert} />}
          {changePct != null && (
            <Delta badge kind="pct" value={changePct} decimals={Math.abs(changePct) < 1 ? 2 : 1} invert={invert} />
          )}
          {changeLabel && <span className="delta-mut">{changeLabel}</span>}
        </div>
      )}

      {state === "error" && note && (
        <div className="note">
          <svg width="16" height="16" viewBox="0 0 14 14" style={{ flex: "0 0 auto", marginTop: 1 }} aria-hidden>
            <path d="M7 1.5 13 12.5H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M7 5.5v3M7 10.3v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{note}</span>
        </div>
      )}

      {state === "empty" && emptyText && <span className="kpi-foot">{emptyText}</span>}

      {state !== "empty" && secondary && secondary.length > 0 && (
        <div className="kpi-ccy">
          {secondary.map((s) => (
            <span key={s.label}>
              <small>{s.label}</small>
              <b className="tabular">{s.value}</b>
            </span>
          ))}
        </div>
      )}

      {footer && <div className="kpi-foot">{footer}</div>}
    </div>
  );
}
