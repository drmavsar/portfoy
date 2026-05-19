"use server";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface AuditLogRow {
  id: string;
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export async function listAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  if (!(await isSupabaseConfigured())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, table_name, record_id, action, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listAuditLogs error", error);
    return [];
  }
  return (data ?? []) as unknown as AuditLogRow[];
}
