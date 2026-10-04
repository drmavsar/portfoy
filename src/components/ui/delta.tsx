import { ARROW, direction, money, pct, type Currency } from "@/lib/design/format";

interface DeltaProps {
  value: number | null | undefined;
  /** "pct" → +%3,2, "money" → +₺18.450 */
  kind?: "pct" | "money";
  cur?: Currency;
  decimals?: number;
  /** Artışın kötü olduğu ölçüler (ör. gider): ok yönü değeri, renk anlamı söyler. */
  invert?: boolean;
  /** Zeminli rozet (KPI, başlık) ya da satır içi (tablo, şerit, liste). */
  badge?: boolean;
  /** Ek açıklama, ör. "bugün" — rozetin dışında sessiz metin olarak. */
  label?: string;
  className?: string;
}

function tone(dir: ReturnType<typeof direction>, invert: boolean): string {
  if (dir === "flat") return "delta-mut";
  const good = invert ? dir === "down" : dir === "up";
  return good ? "delta-pos" : "delta-neg";
}

export function formatDelta(value: number | null | undefined, kind: "pct" | "money", cur?: Currency, decimals?: number) {
  return kind === "pct"
    ? pct(value, { sign: true, decimals: decimals ?? 1 })
    : money(value, { sign: true, cur, decimals: decimals ?? 0 });
}

/**
 * Değişim göstergesi. Yön üç yoldan verilir: ok (▲ ▼ •), işaret (+ −), renk.
 * Yüzde değerleri gizlilik modunda açık kalır; tutarlar bulanıklaşır.
 */
export function Delta({ value, kind = "pct", cur, decimals, invert = false, badge = false, label, className }: DeltaProps) {
  const dir = direction(value);
  const text = formatDelta(value, kind, cur, decimals);
  const cls = [badge ? "delta-badge" : "delta", tone(dir, invert), className ?? ""].filter(Boolean).join(" ");
  return (
    <>
      <span className={cls}>
        <span aria-hidden>{ARROW[dir]}</span>
        <span className={kind === "pct" ? "tabular privacy-safe" : "tabular"}>{text}</span>
      </span>
      {label && <span className="delta-mut" style={{ fontWeight: 500 }}>{label}</span>}
    </>
  );
}

/** Çok para birimli tutar: ana birim üstte, ikinciler altta küçük ve sessiz. İkiden fazlası ipucuna. */
export function AmountStack({ values, title }: { values: string[]; title?: string }) {
  const [main, second, ...rest] = values;
  const tip = title ?? (rest.length ? values.join("\n") : undefined);
  return (
    <span className="amount-stack" title={tip}>
      <span className="tabular">{main}</span>
      {second && <span className="tabular">{second}</span>}
    </span>
  );
}
