import { FilterRail, SourcePill } from "@/app/(app)/_components/filter-rail";
import { CatChip, PersonChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { KpiCard } from "@/components/ui/kpi-card";
import { fmt } from "@/lib/finance/fmt";
import { ACCOUNTS, BANKS, INCOME_RECORDS, RECURRING_INCOME } from "@/lib/sample/data";

export default function GelirlerPage() {
  const records = INCOME_RECORDS;
  const monthSum = records.filter((r) => r.date.endsWith("05.2026")).reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Gelirler</div>
          <div className="page-sub">Tek odak: gelir kayıtları.</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="upload" size={14} /> Ekstre Yükle</button>
          <button className="btn btn-prim"><Icon name="plus" size={14} /> Yeni Gelir</button>
        </div>
      </div>

      <div className="grid-base grid-4" style={{ marginBottom: 18 }}>
        <KpiCard
          label="Bu Ay Gelir"
          value={"+" + fmt.try(monthSum)}
          delta={fmt.pct(8.2)}
          deltaPos
          deltaLabel="geçen aya göre"
          spark={[110, 118, 125, 122, 130, 128, 132]}
          sparkColor="var(--positive)"
        />
        <KpiCard label="Bu Yıl Gelir (YTD)" value={"+" + fmt.try(648_000)} delta={fmt.pct(21.9)} deltaPos deltaLabel="YoY" />
        <KpiCard label="YoY %" value={fmt.pct(21.9)} deltaPos delta="2025 → 2024" />
        <KpiCard label="En Büyük Kaynak" value="Maaş" delta="%63" deltaLabel="toplam gelirin" />
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "240px 1fr", gap: 18, alignItems: "start" }}>
        <FilterRail kind="income" />

        <div className="grid-base" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Gelir Kayıtları</div>
              <div className="card-sub">{records.length} kayıt · son 60 gün</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <div className="search" style={{ width: 200 }}>
                  <Icon name="search" size={12} />
                  <input placeholder="Açıklama veya tutar" />
                </div>
                <button className="btn btn-sm"><Icon name="download" size={12} /></button>
              </div>
            </div>
            <table className="dg">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Tarih</th>
                  <th>Açıklama</th>
                  <th>Kategori</th>
                  <th>Kişi</th>
                  <th>Hesap</th>
                  <th className="center">Kaynak</th>
                  <th className="num">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const acc = ACCOUNTS.find((a) => a.id === r.acc);
                  const bank = acc ? BANKS.find((b) => b.id === acc.bank) : null;
                  return (
                    <tr key={i}>
                      <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{r.date}</td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.desc}</div>
                        {r.recur && (
                          <div className="hint" style={{ marginTop: 2 }}>
                            <Icon name="refresh" size={10} /> tekrar eden
                          </div>
                        )}
                      </td>
                      <td><CatChip id={r.cat} /></td>
                      <td><PersonChip id={r.ben} /></td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{acc && bank ? `${bank.name} / ${acc.name}` : "—"}</td>
                      <td className="center"><SourcePill src={r.src} /></td>
                      <td className="num tabular" style={{ color: "var(--positive)", fontWeight: 600 }}>+{fmt.tr(r.amount, 2)} ₺</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Tekrar Eden Gelirler</div>
              <div className="card-sub">aylık · {fmt.k(RECURRING_INCOME.reduce((s, r) => s + r.amount, 0))} ₺ beklenen</div>
            </div>
            <div>
              {RECURRING_INCOME.map((r, i) => {
                const acc = ACCOUNTS.find((a) => a.id === r.acc);
                const bank = acc ? BANKS.find((b) => b.id === acc.bank) : null;
                return (
                  <div
                    key={r.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto",
                      gap: 14,
                      padding: "12px 16px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                      <div className="hint">her ayın {r.day}. günü · {bank?.name ?? "—"}</div>
                    </div>
                    <span className="chip chip-pos chip-sm">aktif</span>
                    <span className="hint">sonraki 0{r.day}.06</span>
                    <span className="tabular" style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--positive)" }}>
                      +{fmt.k(r.amount)} ₺
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
