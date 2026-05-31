import Link from "next/link";

import { listFunds } from "@/app/(app)/_lib/tefas/funds-actions";
import { loadKomiteArsiv } from "@/app/(app)/_lib/tefas/komite-arsiv-loader";

import { ArsivView } from "./_components/arsiv-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ date?: string }>;
}

export default async function KomiteArsivPage({ searchParams }: Props) {
  const params = await searchParams;
  const requestedDate = params.date ?? null;
  const [snapshot, funds] = await Promise.all([
    loadKomiteArsiv(requestedDate),
    listFunds(),
  ]);

  const fundNameByCode = new Map(funds.map((f) => [f.code, f.name]));

  return (
    <div>
      <div className="page-head" data-print-hide>
        <div>
          <Link
            href="/fonlar/komite"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← Fon Komitesi
          </Link>
          <div className="page-title">Komite Karar Arşivi</div>
          <div className="page-sub">
            Günlük Top 10 snapshot + bir önceki güne göre değişim.
          </div>
        </div>
      </div>

      {snapshot.error ? (
        <div className="card" style={{ padding: 16, color: "var(--muted)" }}>
          {snapshot.error}
        </div>
      ) : (
        <ArsivView snapshot={snapshot} fundNameByCode={fundNameByCode} />
      )}

      <style>{`
        @media print {
          [data-print-hide] { display: none !important; }
          body { background: white; color: black; }
          .card { border: 1px solid #ddd !important; box-shadow: none !important; page-break-inside: avoid; }
          a { color: black !important; text-decoration: none !important; }
          button { display: none !important; }
        }
      `}</style>
    </div>
  );
}
