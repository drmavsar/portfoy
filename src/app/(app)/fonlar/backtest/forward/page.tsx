import Link from "next/link";

import { loadForwardTestSnapshot } from "@/app/(app)/_lib/backtest/forward-loader";

import { ForwardTestPanel } from "./_components/forward-test-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ top_n?: string }>;
}

export default async function ForwardTestPage({ searchParams }: Props) {
  const params = await searchParams;
  const topN = Math.max(1, Math.min(50, Number(params.top_n ?? "10")));
  const snapshot = await loadForwardTestSnapshot(topN);

  return (
    <div>
      <div className="page-head">
        <div>
          <Link
            href="/fonlar/backtest"
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← Backtest
          </Link>
          <div className="page-title">Forward Test</div>
          <div className="page-sub">
            Mehmet Score zaman içinde tutarlı mı? Cache snapshot&apos;larından derived.
          </div>
        </div>
      </div>

      {snapshot.error ? (
        <div className="card" style={{ padding: 16, color: "var(--muted)" }}>
          {snapshot.error}
        </div>
      ) : (
        <ForwardTestPanel snapshot={snapshot} />
      )}
    </div>
  );
}
