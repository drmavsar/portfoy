import Link from "next/link";

import { fmt } from "@/lib/finance/fmt";
import { listAllocationSnapshots } from "@/app/(app)/_lib/tefas/snapshot-actions";
import { summarizeSnapshotForList } from "@/app/(app)/_lib/tefas/snapshot-list-helpers";

export const dynamic = "force-dynamic";

export default async function SnapshotsListPage() {
  const rows = await listAllocationSnapshots({ limit: 100 });
  const summaries = rows.map(summarizeSnapshotForList);

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href="/fonlar/allocation"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← Allocation Önerisi
          </Link>
          <div className="page-title">Allocation Snapshot Tarihçesi</div>
          <div className="page-sub">
            {summaries.length === 0
              ? "Henüz snapshot yok."
              : `${summaries.length} snapshot kayıtlı`}
          </div>
        </div>
        <Link href="/fonlar/allocation" className="btn btn-prim">
          Yeni Snapshot →
        </Link>
      </div>

      {summaries.length === 0 ? (
        <div className="card card-pad empty">
          <div className="title">Henüz kayıtlı snapshot yok</div>
          <div>
            Allocation ekranından &quot;Snapshot Kaydet&quot; butonuyla bugünün
            durumunu kaydedebilirsin. Aynı gün ikinci kez kaydetmek mevcut satırı
            günceller.
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="dg">
            <thead>
              <tr>
                <th>Tarih</th>
                <th className="num">Toplam Portföy</th>
                <th>Top N</th>
                <th className="num">EKLEME</th>
                <th className="num">AZALTMA</th>
                <th className="num">TUT</th>
                <th className="num">Net Nakit</th>
                <th className="num">Stopaj</th>
                <th>Uyarılar</th>
                <th>Not</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{formatDate(s.snapshot_date)}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>
                      {new Date(s.as_of).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td className="num">{fmt.try(s.total_market_value_try)}</td>
                  <td>Top {s.top_n}</td>
                  <td className="num">
                    <span style={{ color: "var(--accent)" }}>{s.action_counts.EKLEME}</span>
                  </td>
                  <td className="num">
                    <span style={{ color: "var(--warning)" }}>{s.action_counts.AZALTMA}</span>
                  </td>
                  <td className="num">
                    <span style={{ color: "var(--positive)" }}>{s.action_counts.TUT}</span>
                  </td>
                  <td className="num">{fmt.try(Math.abs(s.net_cash_need_try))}</td>
                  <td className="num">{fmt.try(s.estimated_tax_try)}</td>
                  <td>
                    <FlagDots counts={s.flag_counts} />
                  </td>
                  <td>{s.has_notes ? "📝" : ""}</td>
                  <td>
                    <Link
                      href={`/fonlar/allocation/snapshots/${s.id}`}
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: 11 }}
                    >
                      Detay →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          fontSize: 11,
          color: "var(--muted)",
          padding: "10px 12px",
          background: "var(--surface-2)",
          borderRadius: 6,
        }}
      >
        Drift Score tarihsel karşılaştırması Sprint-7 kapsamında. Şu an her snapshot
        bağımsız okunur.
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  // YYYY-MM-DD → DD.MM.YYYY
  const [y, m, day] = d.split("-");
  if (y && m && day) return `${day}.${m}.${y}`;
  return d;
}

function FlagDots({ counts }: { counts: { info: number; warn: number; critical: number } }) {
  const dots: Array<[string, number]> = [
    ["#e26a8f", counts.critical],
    ["#e0b341", counts.warn],
    ["#4cc9b0", counts.info],
  ];
  const visible = dots.filter(([, n]) => n > 0);
  if (visible.length === 0) return <span style={{ color: "var(--muted)" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {visible.map(([color, n]) => (
        <span
          key={color}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            fontSize: 10,
            color,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: color,
              display: "inline-block",
            }}
          />
          {n}
        </span>
      ))}
    </span>
  );
}
