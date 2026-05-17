import { listAccounts, listCustodyLocations, type AccountRow } from "@/app/(app)/hesaplar/actions";
import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

export const dynamic = "force-dynamic";

function tryValueOf(a: AccountRow, fxRates: Record<string, number | undefined>): number {
  if (a.currency === "TRY") return a.balance_try ?? a.opening_balance ?? 0;
  const native = a.balance_native;
  const rate = fxRates[a.currency];
  if (native != null && rate != null) return Number(native) * rate;
  return a.balance_try ?? 0;
}

export default async function OzetPage() {
  const [accounts, custodies, fxRates] = await Promise.all([
    listAccounts(),
    listCustodyLocations(),
    getAssetRates(),
  ]);

  const totalTry = accounts.reduce((s, a) => s + tryValueOf(a, fxRates), 0);

  const byCustody = new Map<string, { name: string; color: string; total: number }>();
  for (const c of custodies) {
    byCustody.set(c.id, { name: c.name, color: c.color ?? "#6ea8fe", total: 0 });
  }
  for (const a of accounts) {
    if (!a.custody_id) continue;
    const g = byCustody.get(a.custody_id);
    if (!g) continue;
    g.total += tryValueOf(a, fxRates);
  }
  const grouped = Array.from(byCustody.values())
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Özet</div>
          <div className="page-sub">Servet ve nakit akış genel görünümü.</div>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="empty">
          <div className="title">
            <Icon name="dashboard" size={20} /> Henüz veri yok
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Önce <b>Hesaplar</b> sekmesinden ilk hesabını ekle. Burada toplam servet, varlık
            dağılımı ve gelir-gider trendleri canlıya çıkacak.
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div className="card-title">Toplam Servet</div>
              <div className="card-sub">{accounts.length} hesap · {grouped.length} kurum</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div
                className="tabular"
                style={{ fontSize: 36, fontWeight: 700, color: "var(--accent)" }}
              >
                {fmt.trydp(totalTry)}
              </div>
              <div className="hint" style={{ marginTop: 4 }}>
                Banka + broker hesapları toplamı. Yatırım K/Z ve fiziki varlıklar Yatırımlar
                sprintinden sonra eklenecek.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title">Kurum Bazlı Dağılım</div>
            </div>
            <div style={{ padding: "12px 0" }}>
              {grouped.map((g) => {
                const pct = totalTry > 0 ? (g.total / totalTry) * 100 : 0;
                return (
                  <div
                    key={g.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 60px",
                      gap: 12,
                      padding: "8px 20px",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 50,
                          background: g.color,
                        }}
                      />
                      <span style={{ fontSize: 13 }}>{g.name}</span>
                    </div>
                    <div className="tabular" style={{ fontWeight: 500, fontSize: 13 }}>
                      {fmt.trydp(g.total)}
                    </div>
                    <div className="hint tabular" style={{ textAlign: "right" }}>
                      %{pct.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="hint"
            style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8 }}
          >
            Gelir-gider, varlık dağılımı, korelasyon haritası gibi zengin widget'lar ilerleyen
            sprint'lerde gelecek.
          </div>
        </>
      )}
    </div>
  );
}
