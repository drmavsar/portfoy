"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import {
  applyRule,
  categorySlugCandidates,
  parseAmountAuto,
  parseTurkishAmount,
  parseTurkishDate,
  type ClassificationRule,
} from "@/app/(app)/_lib/ekstre-parse";
import { createClient } from "@/lib/supabase/server";

export interface StatementPreviewRow {
  occurred_on: string; // YYYY-MM-DD
  merchant_raw: string;
  etiket: string;
  amount: number; // pozitif değer (TL)
  direction: "outflow" | "inflow";
  is_transfer: boolean; // pozitif tutar (kart ödemesi vb.) → true
  suggested_category_id: string | null;
  suggested_beneficiary_id: string | null; // kural eşleşirse rule'dan gelir
  hash_dedupe: string;
  raw_amount_str: string;
}

export type StatementSource = "garanti_card" | "garanti_account";

export interface StatementParseResult {
  ok: boolean;
  error?: string;
  source?: StatementSource;
  card_last4?: string;
  account_label?: string; // hesap ekstresi için "1202 - 6676930 TL"
  period_start?: string;
  period_end?: string;
  rows?: StatementPreviewRow[];
  skipped_count?: number;
}

// Hesap ekstresinde transfer/cash-flow rolündeki etiketler — default seçili
// gelmezler (gider/gelir değil).
const BANK_TRANSFER_ETIKETS = new Set([
  "Kart Ödemesi",
  "Para Transferi",
  "Para Çekme",
  "Döviz Al / Sat",
  "Vadeli Hesaba Transfer",
  "Vadeli Hesaptan Transfer",
]);

// Hesap ekstresinde inflow (gelir) rolünde — pozitif tutar gelir kabul edilir
const BANK_INFLOW_ETIKETS = new Set([
  "Maaş",
  "Emekli Maaşı",
  "İkramiye",
]);

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function parseStatementXls(
  formData: FormData,
): Promise<StatementParseResult> {
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Dosya seçilmedi." };
  if (file.size === 0) return { ok: false, error: "Dosya boş." };
  if (file.size > 5 * 1024 * 1024)
    return { ok: false, error: "Dosya 5MB'tan büyük." };

  let userCategories: { id: string; slug: string }[] = [];
  let rules: ClassificationRule[] = [];
  if (await isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const [catRes, ruleRes] = await Promise.all([
        supabase
          .from("categories")
          .select("id, slug, kind")
          .eq("kind", "expense")
          .is("archived_at", null),
        supabase
          .from("classification_rules")
          .select(
            "match_merchant_ilike, match_description_ilike, set_category_id, set_beneficiary_id, set_is_transfer, priority, is_enabled",
          )
          .eq("is_enabled", true)
          .order("priority", { ascending: true }),
      ]);
      userCategories = (catRes.data ?? []) as { id: string; slug: string }[];
      rules = ((ruleRes.data ?? []) as ClassificationRule[]).filter(
        (r) => r.match_merchant_ilike || r.match_description_ilike,
      );
    } catch {
      userCategories = [];
      rules = [];
    }
  }

  const findCatIdForEtiket = (etiket: string): string | null => {
    if (!etiket) return null;
    const cands = categorySlugCandidates(etiket);
    if (cands.length === 0) return null;
    for (const c of cands) {
      const exact = userCategories.find((u) => u.slug === c);
      if (exact) return exact.id;
    }
    for (const c of cands) {
      const sub = userCategories.find(
        (u) => u.slug.includes(c) || c.includes(u.slug),
      );
      if (sub) return sub.id;
    }
    return null;
  };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { ok: false, error: "Çalışma sayfası bulunamadı." };
    const sheet = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown[][];

    let card_last4: string | undefined;
    let account_label: string | undefined;
    for (let r = 0; r < Math.min(grid.length, 15); r++) {
      const cell0 = String(grid[r]?.[0] ?? "").trim();
      const cell1 = String(grid[r]?.[1] ?? "").trim();
      // Kart ekstresi başlık formatı: "5549 **** **** 1023 Numaralı Kart"
      const m = cell0.match(/(\d{4})\s*\*+[\s*]*\*+\s*(\d{4})/);
      if (m) {
        card_last4 = m[2];
      }
      // Hesap ekstresi formatı: "Hesap" / "1202 - 6676930 TL"
      if (cell0 === "Hesap" && cell1) {
        account_label = cell1;
        // IBAN'dan son 4'ü çıkar (genelde "1202 - 6676930 TL" → 6930)
        const ibanLast4Match = cell1.match(/(\d{4})\s*TL\s*$/);
        if (ibanLast4Match) card_last4 = ibanLast4Match[1];
      }
    }

    let headerRow = -1;
    for (let r = 0; r < Math.min(grid.length, 20); r++) {
      const row = grid[r] ?? [];
      if (row.some((c) => String(c).trim() === "Tarih")) {
        headerRow = r;
        break;
      }
    }
    if (headerRow < 0)
      return { ok: false, error: "Tarih kolonu bulunamadı. Beklenen Garanti ekstre formatı değil." };

    const header = (grid[headerRow] ?? []).map((c) => String(c).trim());

    // Format tespit: hesap ekstresi "Açıklama+Bakiye"; kart ekstresi "İşlem"
    const isBank = header.includes("Açıklama") && header.includes("Bakiye");
    const source: StatementSource = isBank ? "garanti_account" : "garanti_card";

    const idxTarih = header.findIndex((h) => h === "Tarih");
    const idxIslem = isBank
      ? header.findIndex((h) => h === "Açıklama")
      : header.findIndex((h) => h === "İşlem" || h === "Islem");
    const idxEtiket = header.findIndex((h) => h === "Etiket");
    const idxTutar = isBank
      ? header.findIndex((h) => h === "Tutar")
      : header.findIndex((h) => h.startsWith("Tutar"));

    if (idxTarih < 0 || idxIslem < 0 || idxTutar < 0) {
      return {
        ok: false,
        error: isBank
          ? "Beklenen kolonlar bulunamadı (Tarih, Açıklama, Tutar)."
          : "Beklenen kolonlar bulunamadı (Tarih, İşlem, Tutar).",
      };
    }

    // Format'a göre tutar parser'ı: hesap US (1,234.56), kart TR (1.234,56)
    const parseAmount = isBank ? parseAmountAuto : parseTurkishAmount;

    const rows: StatementPreviewRow[] = [];
    let skipped = 0;
    let periodStart: string | undefined;
    let periodEnd: string | undefined;
    const seenHashes = new Set<string>();

    for (let r = headerRow + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const tarihCell = String(row[idxTarih] ?? "").trim();
      const islemCell = String(row[idxIslem] ?? "").trim();
      const etiketCell = idxEtiket >= 0 ? String(row[idxEtiket] ?? "").trim() : "";
      const tutarRaw = row[idxTutar];
      const tutarCell = String(tutarRaw ?? "").trim();

      if (!tarihCell && !islemCell && !tutarCell) continue;

      const date = parseTurkishDate(tarihCell);
      const rawAmount = parseAmount(tutarRaw);
      if (!date || rawAmount === null) {
        if (tarihCell || tutarCell) skipped++;
        continue;
      }
      if (rawAmount === 0) continue;

      if (!periodStart || date < periodStart) periodStart = date;
      if (!periodEnd || date > periodEnd) periodEnd = date;

      const merchant = islemCell || etiketCell || "—";
      const amount = Math.abs(rawAmount);
      const direction: "outflow" | "inflow" = rawAmount < 0 ? "outflow" : "inflow";

      // Önce DB'deki classification_rules; eşleşmezse etiket-bazlı slug eşlemesi
      const ruleMatch = applyRule(rules, merchant, etiketCell);
      // Default transfer mantığı format'a göre değişir:
      // - Kart ekstresi: pozitif tutar = kart ödemesi = transfer
      // - Hesap ekstresi: etiket bazlı (Kart Ödemesi, Para Transferi, vs.)
      //   Maaş etiketi → inflow (transfer değil)
      const defaultTransfer = isBank
        ? BANK_TRANSFER_ETIKETS.has(etiketCell) && !BANK_INFLOW_ETIKETS.has(etiketCell)
        : rawAmount > 0;
      const is_transfer = ruleMatch.is_transfer ?? defaultTransfer;
      const suggested = is_transfer
        ? null
        : (ruleMatch.category_id ?? findCatIdForEtiket(etiketCell));
      const suggestedBen = is_transfer ? null : ruleMatch.beneficiary_id;

      const hash = sha256(
        `${source}|${card_last4 ?? "????"}|${date}|${rawAmount.toFixed(2)}|${merchant}`,
      );
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      rows.push({
        occurred_on: date,
        merchant_raw: merchant,
        etiket: etiketCell,
        amount,
        direction,
        is_transfer,
        suggested_category_id: suggested,
        suggested_beneficiary_id: suggestedBen,
        hash_dedupe: hash,
        raw_amount_str: tutarCell,
      });
    }

    rows.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1));

    return {
      ok: true,
      source,
      card_last4,
      account_label,
      period_start: periodStart,
      period_end: periodEnd,
      rows,
      skipped_count: skipped,
    };
  } catch (err) {
    console.error("parseStatementXls error", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Parse hatası.",
    };
  }
}

export interface CommitRow {
  occurred_on: string;
  merchant_raw: string;
  etiket: string;
  amount: number;
  direction: "outflow" | "inflow";
  is_transfer: boolean;
  category_id: string | null;
  beneficiary_id: string | null; // null ise global seçim kullanılır
  hash_dedupe: string;
}

export interface CommitInput {
  rows: CommitRow[];
  account_id: string;
  beneficiary_id: string | null;
  source_name: string | null;
}

export async function commitStatementRows(
  input: CommitInput,
): Promise<{
  ok: boolean;
  inserted?: number;
  duplicates?: number;
  error?: string;
}> {
  if (!(await isSupabaseConfigured()))
    return { ok: false, error: "Supabase yapılandırılmamış." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Giriş yapmadın." };
  if (!input.account_id) return { ok: false, error: "Hesap seç." };
  if (!input.rows || input.rows.length === 0)
    return { ok: false, error: "İşlem yok." };

  const hashes = input.rows.map((r) => r.hash_dedupe);
  const { data: existing } = await supabase
    .from("transactions")
    .select("hash_dedupe")
    .eq("user_id", user.id)
    .in("hash_dedupe", hashes);
  const existingSet = new Set(
    ((existing ?? []) as { hash_dedupe: string | null }[])
      .map((r) => r.hash_dedupe)
      .filter((h): h is string => !!h),
  );
  const fresh = input.rows.filter((r) => !existingSet.has(r.hash_dedupe));
  const duplicates = input.rows.length - fresh.length;

  if (fresh.length === 0) {
    return { ok: true, inserted: 0, duplicates };
  }

  const period_start = fresh.reduce(
    (m, r) => (!m || r.occurred_on < m ? r.occurred_on : m),
    "",
  );
  const period_end = fresh.reduce(
    (m, r) => (!m || r.occurred_on > m ? r.occurred_on : m),
    "",
  );

  const { data: imp, error: impErr } = await supabase
    .from("statement_imports")
    .insert({
      user_id: user.id,
      account_id: input.account_id,
      source_name: input.source_name,
      source_kind: "xlsx",
      row_count: fresh.length,
      period_start: period_start || null,
      period_end: period_end || null,
      status: "committed",
    } as never)
    .select("id")
    .single();

  if (impErr) {
    console.error("statement_imports insert error", impErr);
    return { ok: false, error: impErr.message };
  }
  const importId = (imp as { id?: string } | null)?.id ?? null;

  const inserts = fresh.map((r) => ({
    user_id: user.id,
    account_id: input.account_id,
    import_id: importId,
    occurred_on: r.occurred_on,
    direction: r.direction,
    amount: r.amount,
    currency: "TRY",
    description: r.etiket ? `${r.etiket} · ${r.merchant_raw}` : r.merchant_raw,
    merchant_raw: r.merchant_raw,
    category_id: r.is_transfer ? null : r.category_id,
    beneficiary_id: r.is_transfer ? null : (r.beneficiary_id ?? input.beneficiary_id),
    is_transfer: r.is_transfer,
    hash_dedupe: r.hash_dedupe,
    status: "committed",
  }));

  const { error: txErr } = await supabase
    .from("transactions")
    .insert(inserts as never);
  if (txErr) {
    console.error("transactions insert error", txErr);
    return { ok: false, error: txErr.message };
  }

  revalidatePath("/giderler");
  revalidatePath("/gelirler");
  revalidatePath("/ozet");
  revalidatePath("/raporlar");
  return { ok: true, inserted: fresh.length, duplicates };
}
