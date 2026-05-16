import { NextRequest, NextResponse } from "next/server";

import { classify } from "@/lib/etl/classifier";
import { parseStatement } from "@/lib/etl/parsers";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cashflow/import
 *
 * multipart/form-data:
 *   file:        the statement (CSV or XLSX)
 *   account_id:  uuid of the account this statement belongs to
 *
 * Behavior:
 *   1. parse the file with the right adapter (Garanti vs generic)
 *   2. record a `statement_imports` row
 *   3. run the classifier and write `transaction_drafts` rows
 *   4. respond with import id + counts so the UI can route to review
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const accountId = form.get("account_id");

  if (!(file instanceof File) || typeof accountId !== "string") {
    return NextResponse.json(
      { error: "file and account_id are required" },
      { status: 400 },
    );
  }

  const buffer = await file.arrayBuffer();
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  const parsed = parseStatement({
    fileName: file.name,
    contentType: file.type,
    xlsxBuffer: isCsv ? undefined : buffer,
    csvText: isCsv ? new TextDecoder("utf-8").decode(buffer) : undefined,
  });

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error: "no_rows",
        warnings: parsed.warnings,
        sourceHeaders: parsed.sourceHeaders,
      },
      { status: 422 },
    );
  }

  const dates = parsed.rows.map((r) => r.occurredOn).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  const { data: importRow, error: importErr } = await supabase
    .from("statement_imports")
    .insert({
      user_id: user.id,
      account_id: accountId,
      source_name: file.name,
      source_kind: isCsv ? "csv" : "xlsx",
      row_count: parsed.rows.length,
      period_start: periodStart,
      period_end: periodEnd,
      status: "pending",
      raw_payload: {
        format: parsed.format,
        detected_card_last4: parsed.detectedCardLast4 ?? null,
        headers: parsed.sourceHeaders,
        warnings: parsed.warnings,
      },
    } as never)
    .select()
    .single();

  if (importErr || !importRow) {
    return NextResponse.json({ error: importErr?.message }, { status: 500 });
  }
  const importRowTyped = importRow as unknown as { id: string };

  const [{ data: rules }, { data: cats }] = await Promise.all([
    supabase
      .from("classification_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("priority"),
    supabase
      .from("categories")
      .select("id, slug")
      .eq("user_id", user.id),
  ]);

  const catList = (cats ?? []) as unknown as { id: string; slug: string }[];
  const categoryBySlug = new Map<string, string>(
    catList.map((c) => [c.slug, c.id]),
  );

  const { drafts } = classify({
    userId: user.id,
    accountId,
    importId: importRowTyped.id,
    rows: parsed.rows,
    rules: (rules ?? []) as unknown as Parameters<typeof classify>[0]["rules"],
    categoryBySlug,
  });

  // Insert in chunks to stay under Postgres parameter limits.
  const CHUNK = 200;
  for (let i = 0; i < drafts.length; i += CHUNK) {
    const slice = drafts.slice(i, i + CHUNK);
    const { error: draftErr } = await supabase
      .from("transaction_drafts")
      .insert(slice as never[]);
    if (draftErr) {
      return NextResponse.json(
        { error: draftErr.message, partial: i },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    importId: importRowTyped.id,
    rowCount: parsed.rows.length,
    format: parsed.format,
    detectedCardLast4: parsed.detectedCardLast4 ?? null,
    warnings: parsed.warnings,
  });
}
