/**
 * TEFAS Seed Quality Report (Sprint-1 DoD)
 *
 * Kullanım:
 *   npm run tefas:quality
 *
 * Gerekli env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (veya NEXT_PUBLIC_SUPABASE_ANON_KEY fallback)
 *
 * Çıktı:
 *   reports/tefas-seed-quality-YYYYMMDD.md
 *
 * Kalite kontrolleri:
 *   1. Özet metrikler (kategori dağılımı, HSYF/free/FX sayıları, vb.)
 *   2. Bütünlük (boş alanlar, controlled vocabulary ihlali)
 *   3. Tutarlılık (kategori ↔ flag çelişkileri)
 *   4. Stopaj çözüm matrisi (her fon için resolveTaxRule)
 *   5. tracked_funds bootstrap doğrulama
 *   6. Audit altyapı testi (test UPDATE → audit row, rollback)
 *
 * Sprint-2 geçiş gate'i: CRITICAL = 0 ve raporun manuel review'i.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { resolveTaxRulePure } from "../src/app/(app)/_lib/tefas/tax-rules-logic";
import type {
  Fund,
  FundCategory,
  FundTaxKind,
  FundTaxRule,
} from "../src/app/(app)/_lib/tefas/types";

type Severity = "CRITICAL" | "WARN" | "INFO";
interface Finding {
  severity: Severity;
  check: string;
  detail: string;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Eksik env: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY (veya ANON_KEY) gerekli.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const findings: Finding[] = [];

  // -------- 1. Veri yükle --------
  const [{ data: cats }, { data: funds }, { data: rules }] = await Promise.all([
    supabase.from("fund_categories").select("*").order("sort_order"),
    supabase.from("funds").select("*").order("code"),
    supabase.from("fund_tax_rules").select("*").eq("is_active", true),
  ]);

  const categories = (cats ?? []) as FundCategory[];
  const fundsArr = (funds ?? []) as Fund[];
  const rulesArr = (rules ?? []) as FundTaxRule[];
  const catById = new Map(categories.map((c) => [c.id, c]));

  // -------- 2. Özet metrikler --------
  const byCategory = new Map<string, number>();
  for (const c of categories) byCategory.set(c.code, 0);
  for (const f of fundsArr) {
    const c = catById.get(f.category_id);
    if (c) byCategory.set(c.code, (byCategory.get(c.code) ?? 0) + 1);
  }

  const counts = {
    totalFunds: fundsArr.length,
    activeFunds: fundsArr.filter((f) => f.is_active).length,
    hsyf: fundsArr.filter((f) => f.is_equity_intensive).length,
    freeFunds: fundsArr.filter((f) => f.is_free_fund).length,
    fxDenominated: fundsArr.filter((f) => f.is_fx_denominated).length,
    tefasTraded: fundsArr.filter((f) => f.is_tefas_traded).length,
  };

  const confidenceDist = countBy(fundsArr, (f) => f.tax_confidence);
  const universeDist = countBy(fundsArr, (f) => f.investment_universe);

  // -------- 3. Bütünlük kontrolleri --------
  for (const f of fundsArr) {
    if (!f.name || f.name.trim().length === 0) {
      findings.push({ severity: "CRITICAL", check: "Bütünlük", detail: `${f.code}: name boş` });
    }
    if (!catById.has(f.category_id)) {
      findings.push({ severity: "CRITICAL", check: "Bütünlük", detail: `${f.code}: bilinmeyen category_id (${f.category_id})` });
    }
    if (!["TRY", "USD", "EUR"].includes(f.currency)) {
      findings.push({ severity: "CRITICAL", check: "Bütünlük", detail: `${f.code}: geçersiz currency (${f.currency})` });
    }
    if (f.risk_level !== null && (f.risk_level < 1 || f.risk_level > 7)) {
      findings.push({ severity: "WARN", check: "Bütünlük", detail: `${f.code}: risk_level aralık dışı (${f.risk_level})` });
    }
  }

  // -------- 4. Tutarlılık kontrolleri --------
  // 4a. HSYF kategorisindeki tüm fonlar is_equity_intensive olmalı
  for (const f of fundsArr) {
    const cat = catById.get(f.category_id);
    if (!cat) continue;
    if (cat.code === "KATILIM_HSYF_SERBEST" && !f.is_equity_intensive) {
      findings.push({
        severity: "CRITICAL",
        check: "Tutarlılık",
        detail: `${f.code}: HSYF kategorisinde ama is_equity_intensive=false`,
      });
    }
    if (f.is_equity_intensive && cat.code !== "KATILIM_HSYF_SERBEST") {
      findings.push({
        severity: "WARN",
        check: "Tutarlılık",
        detail: `${f.code}: is_equity_intensive=true ama HSYF kategorisinde değil (${cat.code})`,
      });
    }
    // 4b. Döviz kategorileri currency uyumu
    if (cat.code === "DOLAR_SERBEST" && f.currency !== "USD") {
      findings.push({
        severity: "CRITICAL",
        check: "Tutarlılık",
        detail: `${f.code}: DOLAR_SERBEST kategorisinde ama currency=${f.currency}`,
      });
    }
    if (cat.code === "EURO_SERBEST" && f.currency !== "EUR") {
      findings.push({
        severity: "CRITICAL",
        check: "Tutarlılık",
        detail: `${f.code}: EURO_SERBEST kategorisinde ama currency=${f.currency}`,
      });
    }
    // 4c. Serbest kategorilerde is_free_fund=true bekleniyor
    const freeCategories = new Set([
      "KATILIM_SERBEST_PARA", "DOLAR_SERBEST", "EURO_SERBEST",
      "KATILIM_HSYF_SERBEST", "KISA_VADELI_SERBEST", "ARBITRAJ_SERBEST",
      "GUMUS_SERBEST", "DIGER_SERBEST",
    ]);
    if (freeCategories.has(cat.code) && !f.is_free_fund) {
      findings.push({
        severity: "WARN",
        check: "Tutarlılık",
        detail: `${f.code}: serbest kategoride (${cat.code}) ama is_free_fund=false`,
      });
    }
  }

  // 4d. KIS, TPZ FX zorunlu
  for (const code of ["KIS", "TPZ"]) {
    const f = fundsArr.find((x) => x.code === code);
    if (f && !f.is_fx_denominated) {
      findings.push({
        severity: "CRITICAL",
        check: "Tutarlılık",
        detail: `${code}: kullanıcı tarafından döviz bazlı olarak belirtildi, is_fx_denominated=false`,
      });
    }
  }

  // -------- 5. Stopaj çözüm matrisi --------
  const today = new Date().toISOString().slice(0, 10);
  const kindCounts: Record<FundTaxKind, number> = {
    HSYF_0_STOPAJ: 0,
    GENEL_17_5: 0,
    DOVIZ_BAZLI: 0,
    SERBEST_FON: 0,
    BELIRSIZ: 0,
  };
  const sourceCounts = { FUND: 0, CATEGORY: 0, TAX_KIND_DEFAULT: 0, NONE: 0 };

  for (const f of fundsArr) {
    const cat = catById.get(f.category_id);
    if (!cat) continue;
    const r = resolveTaxRulePure(f, rulesArr, cat.default_tax_kind, today, today);
    kindCounts[r.kind]++;
    sourceCounts[r.source]++;
    if (r.source === "NONE") {
      findings.push({
        severity: "WARN",
        check: "Stopaj",
        detail: `${f.code}: hiçbir kural eşleşmedi (NONE)`,
      });
    }
  }

  // -------- 6. tracked_funds bootstrap doğrulama --------
  const { data: usersData } = await supabase
    .from("auth.users" as never)
    .select("id")
    .limit(1)
    .maybeSingle();
  // auth.users public schema'dan erişilemez; alternatif: tracked_funds'tan distinct
  const { data: trackedRows } = await supabase
    .from("tracked_funds")
    .select("user_id");
  const distinctUsers = new Set((trackedRows ?? []).map((r) => (r as { user_id: string }).user_id));
  const activeCount = fundsArr.filter((f) => f.is_active).length;
  const expectedTracked = distinctUsers.size * activeCount;
  const actualTracked = trackedRows?.length ?? 0;

  if (expectedTracked !== actualTracked) {
    findings.push({
      severity: "WARN",
      check: "Bootstrap",
      detail: `tracked_funds beklenen ${expectedTracked} (${distinctUsers.size} user × ${activeCount} fon), gerçekleşen ${actualTracked}`,
    });
  }
  // `usersData` yardımcı bağlam — anon RLS auth.users tablosunu doğrudan getirmez;
  // ihtiyaç halinde debugging için yazıldı, kullanılmaması normal.
  void usersData;

  // -------- 7. Audit altyapı testi --------
  // İki kademe:
  //   (a) tax_rules_audit'te en az 1 satır var mı (default 5 kural insert
  //       edildiğinde audit oluşmuş olmalı — geçmiş kanıt).
  //   (b) Yazma izni varsa (service_role) canlı probe insert + cleanup.
  //       Anon key ile çalıştırılırsa probe atlanır, INFO yazılır.
  let auditPresent = false;
  let auditLiveTest: "ok" | "skipped" | "failed" = "skipped";
  {
    const { count } = await supabase
      .from("tax_rules_audit")
      .select("*", { count: "exact", head: true });
    auditPresent = (count ?? 0) > 0;

    const probe = await supabase
      .from("fund_tax_rules")
      .insert({
        scope: "TAX_KIND",
        tax_kind: "BELIRSIZ",
        withholding_rate: null,
        effective_from: "1900-01-01",
        priority: 0,
        description: "QUALITY_PROBE_DELETE_ME",
        is_active: true,
      } as never)
      .select("id")
      .single();
    if (probe.data) {
      const ruleId = (probe.data as { id: string }).id;
      const { data: auditRow } = await supabase
        .from("tax_rules_audit")
        .select("operation")
        .eq("rule_id", ruleId)
        .maybeSingle();
      auditLiveTest =
        auditRow && (auditRow as { operation: string }).operation === "INSERT"
          ? "ok"
          : "failed";
      await supabase.from("fund_tax_rules").delete().eq("id", ruleId);
    } else {
      auditLiveTest = "skipped";
    }
  }
  if (!auditPresent) {
    findings.push({
      severity: "CRITICAL",
      check: "Audit",
      detail: "tax_rules_audit boş — trigger hiç çalışmamış (default 5 rule seed audit'e gitmemiş)",
    });
  }
  if (auditLiveTest === "failed") {
    findings.push({
      severity: "CRITICAL",
      check: "Audit",
      detail: "Probe INSERT sonrası audit satırı oluşmadı (trigger çalışmıyor)",
    });
  }
  if (auditLiveTest === "skipped") {
    findings.push({
      severity: "INFO",
      check: "Audit",
      detail: "Probe atlandı — anon key ile çalıştırıldı; canlı audit testi için service_role kullan",
    });
  }

  // -------- Rapor üret --------
  const reportPath = resolve(
    process.cwd(),
    `reports/tefas-seed-quality-${today.replace(/-/g, "")}.md`,
  );
  await mkdir(dirname(reportPath), { recursive: true });

  const md = buildMarkdown({
    today,
    counts,
    categoriesCount: categories.length,
    byCategory,
    confidenceDist,
    universeDist,
    kindCounts,
    sourceCounts,
    trackedTotal: actualTracked,
    trackedExpected: expectedTracked,
    distinctUsers: distinctUsers.size,
    auditPresent,
    auditLiveTest,
    findings,
  });
  await writeFile(reportPath, md, "utf8");

  const critical = findings.filter((f) => f.severity === "CRITICAL").length;
  const warn = findings.filter((f) => f.severity === "WARN").length;
  console.log(`Rapor yazıldı: ${reportPath}`);
  console.log(`CRITICAL=${critical}, WARN=${warn}, INFO=${findings.length - critical - warn}`);

  if (critical > 0) process.exit(2);
}

function countBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) {
    const k = key(x);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

interface ReportData {
  today: string;
  counts: { totalFunds: number; activeFunds: number; hsyf: number; freeFunds: number; fxDenominated: number; tefasTraded: number };
  categoriesCount: number;
  byCategory: Map<string, number>;
  confidenceDist: Record<string, number>;
  universeDist: Record<string, number>;
  kindCounts: Record<FundTaxKind, number>;
  sourceCounts: Record<string, number>;
  trackedTotal: number;
  trackedExpected: number;
  distinctUsers: number;
  auditPresent: boolean;
  auditLiveTest: "ok" | "skipped" | "failed";
  findings: Finding[];
}

function buildMarkdown(d: ReportData): string {
  const lines: string[] = [];
  lines.push(`# TEFAS Seed Quality Report — ${d.today}`);
  lines.push("");
  const critical = d.findings.filter((f) => f.severity === "CRITICAL").length;
  const warn = d.findings.filter((f) => f.severity === "WARN").length;
  const info = d.findings.length - critical - warn;
  const verdict = critical === 0 ? "✅ Sprint-2'ye hazır" : "❌ CRITICAL var, Sprint-2 bloke";
  lines.push(`**Verdict:** ${verdict}  |  CRITICAL: ${critical} · WARN: ${warn} · INFO: ${info}`);
  lines.push("");
  lines.push("## Özet");
  lines.push(`- Kategori sayısı: ${d.categoriesCount} (beklenen 16)`);
  lines.push(`- Toplam fon: ${d.counts.totalFunds}`);
  lines.push(`- Aktif fon: ${d.counts.activeFunds}`);
  lines.push(`- HSYF (is_equity_intensive): ${d.counts.hsyf}`);
  lines.push(`- Serbest fon: ${d.counts.freeFunds}`);
  lines.push(`- Döviz bazlı: ${d.counts.fxDenominated}`);
  lines.push(`- TEFAS'ta işlem gören: ${d.counts.tefasTraded}`);
  lines.push("");
  lines.push("## Kategori Dağılımı");
  lines.push("| Kategori | Fon sayısı |");
  lines.push("|---|---|");
  for (const [code, count] of d.byCategory) lines.push(`| ${code} | ${count} |`);
  lines.push("");
  lines.push("## tax_confidence Dağılımı");
  lines.push("| Confidence | Sayı |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(d.confidenceDist).sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push("## Investment Universe Dağılımı");
  lines.push("| Universe | Sayı |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(d.universeDist).sort()) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push("## Stopaj Çözüm Matrisi");
  lines.push("| tax_kind | Fon sayısı |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(d.kindCounts)) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push("## Kural Kaynak (resolveTaxRule.source)");
  lines.push("| Source | Sayı |");
  lines.push("|---|---|");
  for (const [k, v] of Object.entries(d.sourceCounts)) lines.push(`| ${k} | ${v} |`);
  lines.push("");
  lines.push("## tracked_funds Bootstrap");
  lines.push(`- Distinct user (tracked_funds'tan): ${d.distinctUsers}`);
  lines.push(`- Aktif fon × user beklenen: ${d.trackedExpected}`);
  lines.push(`- Gerçekleşen: ${d.trackedTotal}`);
  lines.push(`- ${d.trackedExpected === d.trackedTotal ? "✅ Eşleşiyor" : "⚠️ Eşleşmiyor"}`);
  lines.push("");
  lines.push("## Audit Altyapısı");
  lines.push(`- tax_rules_audit dolu mu: ${d.auditPresent ? "✅ evet" : "❌ hayır"}`);
  const liveLabel =
    d.auditLiveTest === "ok"
      ? "✅ Probe INSERT → audit satırı"
      : d.auditLiveTest === "skipped"
      ? "ℹ️ Atlandı (write izni yok)"
      : "❌ Probe INSERT → audit yok";
  lines.push(`- Canlı test: ${liveLabel}`);
  lines.push("");
  lines.push("## Findings");
  if (d.findings.length === 0) {
    lines.push("_Hiç finding yok._");
  } else {
    lines.push("| Severity | Check | Detail |");
    lines.push("|---|---|---|");
    for (const f of d.findings) lines.push(`| ${f.severity} | ${f.check} | ${f.detail.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  console.error("Quality report failed:", err);
  process.exit(1);
});
