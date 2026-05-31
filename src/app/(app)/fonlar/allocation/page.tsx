import Link from "next/link";

import { computeAllocation } from "@/app/(app)/_lib/tefas/allocation-actions";

import { BacktestChampionBadge } from "./_components/backtest-champion-badge";
import { DataQualityFlags } from "./_components/data-quality-flags";
import { NonFundAssets } from "./_components/non-fund-assets";
import { NonTargetPositions } from "./_components/non-target-positions";
import { SnapshotSaveButton } from "./_components/snapshot-save-button";
import { SummaryCard } from "./_components/summary-card";
import { TargetTable } from "./_components/target-table";

export const dynamic = "force-dynamic";

export default async function AllocationPage() {
  const result = await computeAllocation();

  if (!result.ok) {
    return (
      <div>
        <div className="page-head">
          <div>
            <Link
              href="/fonlar"
              style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
            >
              ← TEFAS Fonları
            </Link>
            <div className="page-title">Allocation Önerisi</div>
          </div>
        </div>
        <div className="card card-pad empty">
          <div className="title">Allocation hesaplanamadı</div>
          <div>{result.error}</div>
        </div>
      </div>
    );
  }

  const a = result.allocation;

  return (
    <div>
      <div className="page-head" style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link
            href="/fonlar"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← TEFAS Fonları
          </Link>
          <div className="page-title">Allocation Önerisi</div>
          <div className="page-sub">
            Top {a.summary.top_n} · Eşit Ağırlık · Yeniden dengeleme bandı ±%
            {(a.summary.rebalance_band_pct * 100).toFixed(0)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <BacktestChampionBadge champion={a.backtest_champion} topN={a.summary.top_n} />
          <SnapshotSaveButton disabled={!a.forbidden_words_safe} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {/* 1. Stopaj / Nakit Özet — en üst */}
        <SummaryCard summary={a.summary} generatedAt={a.generated_at} />

        {/* 2. Data quality flags (varsa) */}
        {a.data_quality_flags.length > 0 && (
          <DataQualityFlags flags={a.data_quality_flags} />
        )}

        {/* 3. Critical: forbidden words trip → komite gerekçeleri gizli uyarı */}
        {!a.forbidden_words_safe && (
          <div
            style={{
              padding: 12,
              background: "var(--negative-soft)",
              color: "var(--negative)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            ⚠ Komite gerekçesi içeriği güvenlik filtresinden geçmedi; tabloda
            gizlendi. Geliştiriciye bildirin.
          </div>
        )}

        {/* 4. Empty state */}
        {a.current.length === 0 && (
          <div className="card card-pad empty">
            <div className="title">Portföyün boş</div>
            <div>
              İlk işlem kaydını oluşturmak için fon detayından
              &quot;İşlem Kaydet&quot; butonunu kullan.
            </div>
          </div>
        )}

        {/* 5. Target Top N tablo + komite + sell dry-run inline */}
        <TargetTable
          target={a.target}
          diffs={a.diff}
          current={a.current}
          sellDryRuns={a.sell_dry_runs}
          forbiddenWordsSafe={a.forbidden_words_safe}
        />

        {/* 6. Target dışı portföy pozisyonları */}
        <NonTargetPositions
          diffs={a.diff}
          current={a.current}
          sellDryRuns={a.sell_dry_runs}
        />

        {/* 7. Non-fund varlıklar */}
        <NonFundAssets current={a.current} />

        {/* 8. Bilgilendirme şeridi */}
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            padding: "12px 14px",
            background: "var(--surface-2)",
            borderRadius: 6,
            lineHeight: 1.6,
          }}
        >
          Bu sayfa yatırım tavsiyesi değildir. Önerilen eylemler portföy ağırlık
          hedeflerine göre üretilen referans bilgilerdir. Tüm trade kayıtları
          kullanıcı tarafından manuel olarak oluşturulur; uygulama TEFAS&apos;a
          emir göndermez.
        </div>
      </div>
    </div>
  );
}
