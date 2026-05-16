import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { DraftRow, TransactionInsert } from "@/lib/types/database";

/**
 * POST /api/cashflow/commit
 *
 * body JSON:
 *   { importId: string, draftIds?: string[] }
 *
 * Materializes accepted drafts into transactions. If `draftIds` is
 * omitted, commits everything in the import that is not 'ignore'.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { importId?: string; draftIds?: string[] }
    | null;

  if (!body?.importId) {
    return NextResponse.json({ error: "importId required" }, { status: 400 });
  }

  let q = supabase
    .from("transaction_drafts")
    .select("*")
    .eq("import_id", body.importId)
    .eq("user_id", user.id)
    .neq("decision", "ignore");

  if (body.draftIds && body.draftIds.length > 0) {
    q = q.in("id", body.draftIds);
  }

  const { data, error: draftErr } = await q;
  if (draftErr) {
    return NextResponse.json({ error: draftErr.message }, { status: 500 });
  }
  const drafts = (data ?? []) as unknown as DraftRow[];
  if (drafts.length === 0) {
    return NextResponse.json({ written: 0 });
  }

  const txnRows: TransactionInsert[] = drafts.map((d) => ({
    user_id: d.user_id,
    account_id: d.account_id,
    counter_account_id: d.suggested_counter_account_id,
    import_id: d.import_id,
    occurred_on: d.occurred_on,
    direction: d.direction,
    amount: d.amount,
    currency: d.currency,
    description: typeof d.raw === "object" && d.raw && "description" in d.raw
      ? (d.raw as { description?: string }).description ?? null
      : null,
    merchant_raw: d.merchant_raw,
    merchant_clean: d.merchant_clean,
    category_id: d.suggested_category_id,
    beneficiary_id: d.suggested_beneficiary_id,
    is_transfer: d.suggested_is_transfer,
    is_installment: false,
    installment_total: d.suggested_installment_total,
    status: "committed" as const,
    hash_dedupe: d.hash_dedupe,
  }));

  // Insert with conflict-do-nothing on the (user_id, hash_dedupe) unique
  // index to make re-commit idempotent.
  const { error: insertErr } = await supabase
    .from("transactions")
    .upsert(txnRows as never[], {
      onConflict: "user_id,hash_dedupe",
      ignoreDuplicates: true,
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Mark import as committed.
  await supabase
    .from("statement_imports")
    .update({ status: "committed" } as never)
    .eq("id", body.importId)
    .eq("user_id", user.id);

  return NextResponse.json({ written: txnRows.length });
}
