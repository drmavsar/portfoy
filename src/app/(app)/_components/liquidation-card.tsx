import { fmt } from "@/lib/finance/fmt";
import type { LiquidationSummary } from "@/lib/finance/liquidation";

const LABEL: Record<string, string> = {
  USD: "Dolar",
  EUR: "Euro",
  GBP: "Sterlin",
  CHF: "İsviçre frangı",
  XAU: "Gram altın",
  XAG: "Gram gümüş",
  XAU_OZ: "Ons altın",
  CEYREK: "Çeyrek altın",
  YARIM: "Yarım altın",
  TAM: "Tam altın",
  CUMHURIYET: "Cumhuriyet altını",
  ATA: "Ata altın",
  RESAT: "Reşat altın",
  BILEZIK22: "22 ayar bilezik",
  BILEZIK18: "18 ayar bilezik",
  BILEZIK14: "14 ayar bilezik",
};

const UNIT: Record<string, string> = {
  XAU: "gr",
  XAG: "gr",
  XAU_OZ: "ons",
  BILEZIK22: "gr",
  BILEZIK18: "gr",
  BILEZIK14: "gr",
  CEYREK: "adet",
  YARIM: "adet",
  TAM: "adet",
  CUMHURIYET: "adet",
  ATA: "adet",
  RESAT: "adet",
};

function qtyText(currency: string, native: number): string {
  const unit = UNIT[currency] ?? currency;
  const d = unit === "gr" ? 2 : unit === "ons" ? 4 : unit === "adet" ? 0 : 2;
  return `${fmt.tr(native, d)} ${unit}`;
}

export function LiquidationCard({ data, grandTotal }: { data: LiquidationSummary; grandTotal: number }) {
  if (data.lines.length === 0) return null;
  const pct = data.valueTry > 0 ? (data.haircutTry / data.valueTry) * 100 : 0;
  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-head">
        <div className="card-title">Bozdurma Değeri — Altın &amp; Döviz</div>
        <div className="card-sub">
          Servet satış fiyatıyla gösterilir; bozdururken alış fiyatı geçerli
        </div>
      </div>
      <table className="dg">
        <thead>
          <tr>
            <th>Varlık</th>
            <th className="num">Miktar</th>
            <th className="num">Değer (satış)</th>
            <th className="num">Bozdurma (alış)</th>
            <th className="num">Fark</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l) => {
            const diff = l.bidValueTry == null ? null : l.bidValueTry - l.valueTry;
            return (
              <tr key={l.currency}>
                <td style={{ fontWeight: 600 }}>
                  {LABEL[l.currency] ?? l.currency}
                  {l.currency.startsWith("BILEZIK") && (
                    <div className="hint" style={{ fontWeight: 400 }}>
                      işçilik geri alınmaz (hurda)
                    </div>
                  )}
                </td>
                <td className="num tabular">{qtyText(l.currency, l.native)}</td>
                <td className="num tabular">{fmt.tr(l.valueTry, 0)} ₺</td>
                <td className="num tabular">{l.bidValueTry == null ? "—" : `${fmt.tr(l.bidValueTry, 0)} ₺`}</td>
                <td
                  className="num tabular"
                  style={{ color: diff == null ? "var(--muted)" : "var(--negative)" }}
                  title={l.ratio == null ? "Alış fiyatı alınamadı" : undefined}
                >
                  {diff == null
                    ? "makas yok"
                    : `−${fmt.tr(Math.abs(diff), 0)} ₺ (%${fmt.tr((1 - l.ratio!) * 100, 1)})`}
                </td>
              </tr>
            );
          })}
          <tr style={{ fontWeight: 700 }}>
            <td>Toplam</td>
            <td />
            <td className="num tabular">{fmt.tr(data.valueTry, 0)} ₺</td>
            <td className="num tabular">{fmt.tr(data.bidValueTry, 0)} ₺</td>
            <td className="num tabular" style={{ color: "var(--negative)" }}>
              −{fmt.tr(Math.abs(data.haircutTry), 0)} ₺ (%{fmt.tr(Math.abs(pct), 1)})
            </td>
          </tr>
        </tbody>
      </table>
      <div className="hint" style={{ fontSize: 11, padding: "10px 16px 14px", lineHeight: 1.6 }}>
        Toplam servet bozdurma değeriyle ≈ <b>{fmt.tr(grandTotal + data.haircutTry, 0)} ₺</b>. Makas Truncgil
        alış/satış kotasyonundan; kuyumcu ve banka makası bundan farklı olabilir.
        {data.unknown > 0 && ` ${data.unknown} varlık için alış fiyatı alınamadı; değeriyle sayıldı.`}
      </div>
    </div>
  );
}
