"use server";

import crypto from "node:crypto";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { isSupabaseConfigured } from "@/app/(app)/ayarlar/actions";
import { createClient } from "@/lib/supabase/server";

export interface StatementPreviewRow {
  occurred_on: string; // YYYY-MM-DD
  merchant_raw: string;
  etiket: string;
  amount: number; // pozitif değer (TL)
  direction: "outflow" | "inflow";
  is_transfer: boolean; // pozitif tutar (kart ödemesi vb.) → true
  suggested_category_id: string | null;
  hash_dedupe: string;
  raw_amount_str: string;
}

export interface StatementParseResult {
  ok: boolean;
  error?: string;
  card_last4?: string;
  period_start?: string;
  period_end?: string;
  rows?: StatementPreviewRow[];
  skipped_count?: number;
}

function parseTurkishDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseTurkishAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function categorySlugCandidates(etiket: string): string[] {
  const e = etiket
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ğ/g, "g");
  if (e.includes("market")) return ["market", "alisveris", "gida"];
  if (e.includes("yeme") || e.includes("icme") || e.includes("restoran"))
    return ["yeme-icme", "yiyecek-icecek", "restoran", "yemek", "yeme"];
  if (e.includes("ev") || e.includes("dekor"))
    return ["ev-dekorasyon", "ev", "dekorasyon", "mobilya"];
  if (e.includes("egitim") || e.includes("okul")) return ["egitim", "okul"];
  if (e.includes("kisisel") || e.includes("hizmet"))
    return ["kisisel-hizmet", "kisisel-bakim", "kisisel", "berber", "kuafor"];
  if (e.includes("eglence") || e.includes("hobi"))
    return ["eglence-hobi", "eglence", "hobi"];
  if (e.includes("saglik")) return ["saglik", "eczane"];
  if (e.includes("ulasim") || e.includes("benzin") || e.includes("akaryakit"))
    return ["ulasim", "akaryakit", "yakit", "ulaşim"];
  if (e.includes("giyim")) return ["giyim", "moda"];
  if (e.includes("teknoloji") || e.includes("elektronik"))
    return ["teknoloji", "elektronik"];
  return [];
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
  if (await isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("categories")
        .select("id, slug, kind")
        .eq("kind", "expense")
        .is("archived_at", null);
      userCategories = (data ?? []) as { id: string; slug: string }[];
    } catch {
      userCategories = [];
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
    for (let r = 0; r < Math.min(grid.length, 15); r++) {
      const cell = String(grid[r]?.[0] ?? "");
      const m = cell.match(/(\d{4})\s*\*+[\s*]*\*+\s*(\d{4})/);
      if (m) {
        card_last4 = m[2];
        break;
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
    const idxTarih = header.findIndex((h) => h === "Tarih");
    const idxIslem = header.findIndex((h) => h === "İşlem" || h === "Islem");
    const idxEtiket = header.findIndex((h) => h === "Etiket");
    const idxTutar = header.findIndex((h) => h.startsWith("Tutar"));

    if (idxTarih < 0 || idxIslem < 0 || idxTutar < 0) {
      return {
        ok: false,
        error: "Beklenen kolonlar bulunamadı (Tarih, İşlem, Tutar).",
      };
    }

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
      const rawAmount = parseTurkishAmount(tutarRaw);
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
      const is_transfer = rawAmount > 0;
      const suggested = is_transfer ? null : findCatIdForEtiket(etiketCell);

      const hash = sha256(
        `garanti|${card_last4 ?? "????"}|${date}|${rawAmount.toFixed(2)}|${merchant}`,
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
        hash_dedupe: hash,
        raw_amount_str: tutarCell,
      });
    }

    rows.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1));

    return {
      ok: true,
      card_last4,
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
    beneficiary_id: input.beneficiary_id,
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
