"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveAllocationSnapshot } from "@/app/(app)/_lib/tefas/snapshot-actions";

interface State {
  status: "idle" | "ok" | "error";
  message: string | null;
  snapshotId: string | null;
  created: boolean;
}

export function SnapshotSaveButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [state, setState] = useState<State>({
    status: "idle",
    message: null,
    snapshotId: null,
    created: false,
  });

  const onClick = () => {
    setState({ status: "idle", message: null, snapshotId: null, created: false });
    startTransition(async () => {
      const r = await saveAllocationSnapshot();
      if (r.ok) {
        setState({
          status: "ok",
          message: r.created
            ? `Snapshot kaydedildi (${r.snapshot_date}).`
            : `Bugünün snapshot'ı güncellendi (${r.snapshot_date}).`,
          snapshotId: r.snapshot_id,
          created: r.created,
        });
        router.refresh();
      } else {
        setState({ status: "error", message: r.error, snapshotId: null, created: false });
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Link
          href="/fonlar/allocation/snapshots"
          className="btn btn-ghost"
          style={{ whiteSpace: "nowrap", fontSize: 12 }}
        >
          Snapshot Tarihçesi
        </Link>
        <button
          type="button"
          className="btn btn-prim"
          onClick={onClick}
          disabled={busy || disabled}
          style={{ whiteSpace: "nowrap" }}
        >
          {busy ? "Kaydediliyor…" : "Snapshot Kaydet"}
        </button>
      </div>
      {state.status === "ok" && (
        <div
          style={{
            padding: "6px 10px",
            background: "var(--positive-soft)",
            color: "var(--positive)",
            fontSize: 11,
            borderRadius: 6,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span>{state.message}</span>
          {state.snapshotId && (
            <Link
              href={`/fonlar/allocation/snapshots/${state.snapshotId}`}
              style={{ color: "var(--positive)", textDecoration: "underline" }}
            >
              Detay →
            </Link>
          )}
        </div>
      )}
      {state.status === "error" && (
        <div
          style={{
            padding: "6px 10px",
            background: "var(--negative-soft)",
            color: "var(--negative)",
            fontSize: 11,
            borderRadius: 6,
            maxWidth: 320,
          }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
