"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";

import { type AuditLogRow, listAuditLogs } from "@/app/(app)/_lib/audit-actions";

const TABLE_LABELS: Record<string, string> = {
  transactions: "İşlem",
  trades: "Trade (alım/satım)",
  holdings: "Pozisyon",
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  INSERT: { label: "EKLENDİ", color: "var(--positive)" },
  UPDATE: { label: "DÜZENLENDİ", color: "var(--info)" },
  DELETE: { label: "SİLİNDİ", color: "var(--negative)" },
};

function formatTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summary(row: AuditLogRow): string {
  const data = row.after ?? row.before;
  if (!data) return row.record_id.slice(0, 8);
  const parts: string[] = [];
  if (data.occurred_on) parts.push(String(data.occurred_on));
  if (data.amount) parts.push(`${Number(data.amount).toLocaleString("tr-TR")} ₺`);
  if (data.description) parts.push(String(data.description).slice(0, 40));
  if (data.merchant_raw) parts.push(String(data.merchant_raw).slice(0, 40));
  if (parts.length === 0) return row.record_id.slice(0, 8);
  return parts.join(" · ");
}

export function AktiviteTab({ configured }: { configured: boolean }) {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let canceled = false;
    listAuditLogs(100)
      .then((data) => {
        if (!canceled) setRows(data);
      })
      .catch((err) => {
        if (!canceled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [configured]);

  if (!configured) {
    return (
      <div
        className="card card-pad"
        style={{
          background: "var(--warning-soft)",
          color: "var(--warning)",
          fontSize: 12,
        }}
      >
        Supabase yapılandırılmamış.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          padding: 12,
          marginBottom: 12,
          background: "var(--surface-2)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
      >
        Son 100 değişiklik. İşlem (gelir/gider), trade (alım/satım) ve pozisyon
        tablolarındaki INSERT/UPDATE/DELETE Postgres trigger ile kaydedilir.
        Bir kayıt arşivlenmiş (DELETE) ise <code>transactions.deleted_at</code>
        ile geri alınabilir; gerçek hard delete değildir.
      </div>

      {loading ? (
        <div className="empty">
          <div>Yükleniyor…</div>
        </div>
      ) : error ? (
        <div className="card card-pad" style={{ color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="title">
            <Icon name="report" size={18} /> Henüz aktivite yok
          </div>
          <div style={{ marginTop: 6, lineHeight: 1.5, fontSize: 12 }}>
            0019 migration çalıştırıldı mı? Trigger&apos;lar oluşmamışsa kayıt
            yapılmaz. <code>supabase/migrations/0019_audit_log.sql</code> dosyasını
            SQL Editor&apos;da çalıştır.
          </div>
        </div>
      ) : (
        <div className="card">
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 130 }}>Tarih</th>
                <th style={{ width: 130 }}>Tablo</th>
                <th style={{ width: 100 }}>Aksiyon</th>
                <th>Özet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const action = ACTION_LABELS[r.action] ?? {
                  label: r.action,
                  color: "var(--muted)",
                };
                return (
                  <tr key={r.id}>
                    <td className="tabular hint" style={{ fontSize: 11 }}>
                      {formatTs(r.created_at)}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {TABLE_LABELS[r.table_name] ?? r.table_name}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 3,
                          background: `color-mix(in srgb, ${action.color} 16%, transparent)`,
                          color: action.color,
                        }}
                      >
                        {action.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{summary(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
