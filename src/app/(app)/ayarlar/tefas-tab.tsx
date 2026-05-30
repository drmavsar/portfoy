"use client";

import { useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import {
  INVESTMENT_UNIVERSE_LABELS,
  TAX_CONFIDENCE_LABELS,
  TAX_KIND_LABELS,
} from "@/app/(app)/_lib/tefas/constants";
import {
  addTrackedFund,
  removeTrackedFund,
  setTrackedActive,
} from "@/app/(app)/_lib/tefas/tracked-funds-actions";
import type {
  Fund,
  FundCategory,
  FundTaxConfidence,
  FundTaxRule,
  TefasFundHealth,
  TefasIngestLog,
  TrackedFund,
} from "@/app/(app)/_lib/tefas/types";

interface TefasTabProps {
  funds: Fund[];
  categories: FundCategory[];
  initialTracked: TrackedFund[];
  taxRules: FundTaxRule[];
  ingestLog: TefasIngestLog[];
  fundsHealth: TefasFundHealth[];
  configured: boolean;
}

type SubTab = "takipte" | "ekle" | "stopaj" | "veri";

const subTabs: Array<[SubTab, string]> = [
  ["takipte", "Takipte"],
  ["ekle", "Ekle"],
  ["stopaj", "Stopaj kuralları"],
  ["veri", "Veri Durumu"],
];

export function TefasTab(props: TefasTabProps) {
  const [sub, setSub] = useState<SubTab>("takipte");
  const [tracked, setTracked] = useState<TrackedFund[]>(props.initialTracked);

  return (
    <div>
      <div
        className="tabs tabs-sm"
        style={{ marginBottom: 14, display: "flex", gap: 6 }}
      >
        {subTabs.map(([k, l]) => (
          <button
            key={k}
            className={`tab ${sub === k ? "active" : ""}`}
            onClick={() => setSub(k)}
            style={{ fontSize: 13 }}
          >
            {l}
          </button>
        ))}
      </div>

      {sub === "takipte" && (
        <TakiptePane
          funds={props.funds}
          categories={props.categories}
          tracked={tracked}
          setTracked={setTracked}
          configured={props.configured}
        />
      )}
      {sub === "ekle" && (
        <EklePane
          funds={props.funds}
          categories={props.categories}
          tracked={tracked}
          setTracked={setTracked}
          configured={props.configured}
        />
      )}
      {sub === "stopaj" && (
        <StopajPane rules={props.taxRules} categories={props.categories} />
      )}
      {sub === "veri" && (
        <VeriDurumuPane
          ingestLog={props.ingestLog}
          fundsHealth={props.fundsHealth}
        />
      )}
    </div>
  );
}

// ---------- Takipte ----------------------------------------------------

interface PaneProps {
  funds: Fund[];
  categories: FundCategory[];
  tracked: TrackedFund[];
  setTracked: React.Dispatch<React.SetStateAction<TrackedFund[]>>;
  configured: boolean;
}

function TakiptePane({ funds, categories, tracked, setTracked, configured }: PaneProps) {
  const trackedByCode = useMemo(
    () => new Map(tracked.map((t) => [t.fund_code, t])),
    [tracked],
  );
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const grouped = useMemo(() => {
    const m = new Map<number, Fund[]>();
    for (const f of funds) {
      if (!trackedByCode.has(f.code)) continue;
      const arr = m.get(f.category_id) ?? [];
      arr.push(f);
      m.set(f.category_id, arr);
    }
    return [...m.entries()].sort(([a], [b]) => {
      const sa = catById.get(a)?.sort_order ?? 9999;
      const sb = catById.get(b)?.sort_order ?? 9999;
      return sa - sb;
    });
  }, [funds, trackedByCode, catById]);

  if (tracked.length === 0) {
    return (
      <div className="empty">
        <div>Takipte fon yok</div>
        <div className="hint">&ldquo;Ekle&rdquo; sekmesinden fon ekleyebilirsin.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Summary funds={funds} tracked={tracked} categories={categories} />
      {grouped.map(([catId, list]) => {
        const cat = catById.get(catId);
        return (
          <div key={catId} className="card">
            <div
              className="card-head"
              style={{ borderLeft: `3px solid ${cat?.color ?? "var(--border)"}` }}
            >
              <div className="card-title">{cat?.name_tr ?? `Kategori ${catId}`}</div>
              <div className="card-sub">{list.length} fon</div>
            </div>
            <div style={{ padding: "4px 0" }}>
              {list.map((f) => (
                <FundRow
                  key={f.code}
                  fund={f}
                  tracked={trackedByCode.get(f.code)!}
                  setTracked={setTracked}
                  configured={configured}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Summary({
  funds,
  tracked,
  categories,
}: {
  funds: Fund[];
  tracked: TrackedFund[];
  categories: FundCategory[];
}) {
  const trackedSet = new Set(tracked.map((t) => t.fund_code));
  const activeTracked = tracked.filter((t) => t.is_active).length;
  const inactiveTracked = tracked.length - activeTracked;
  const totalAvailable = funds.length;
  const stats: Array<[string, string]> = [
    ["Takipteki fon", `${tracked.length} / ${totalAvailable}`],
    ["Aktif", String(activeTracked)],
    ["Pasif", String(inactiveTracked)],
    ["HSYF (stopaj %0)", String(funds.filter((f) => f.is_equity_intensive && trackedSet.has(f.code)).length)],
    ["Döviz bazlı", String(funds.filter((f) => f.is_fx_denominated && trackedSet.has(f.code)).length)],
    ["Serbest fon", String(funds.filter((f) => f.is_free_fund && trackedSet.has(f.code)).length)],
    ["Kategori", `${new Set(tracked.map((t) => funds.find((f) => f.code === t.fund_code)?.category_id)).size} / ${categories.length}`],
  ];
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        fontSize: 12,
      }}
    >
      {stats.map(([label, value]) => (
        <span
          key={label}
          style={{
            padding: "5px 10px",
            borderRadius: 999,
            background: "var(--surface-2)",
            border: "1px solid var(--border-soft)",
          }}
        >
          <span style={{ color: "var(--muted)" }}>{label}: </span>
          <strong>{value}</strong>
        </span>
      ))}
    </div>
  );
}

function FundRow({
  fund,
  tracked,
  setTracked,
  configured,
}: {
  fund: Fund;
  tracked: TrackedFund;
  setTracked: React.Dispatch<React.SetStateAction<TrackedFund[]>>;
  configured: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const toggleActive = () => {
    startTransition(async () => {
      const next = !tracked.is_active;
      const r = await setTrackedActive(fund.code, next);
      if (r.ok) {
        setTracked((prev) =>
          prev.map((t) => (t.fund_code === fund.code ? { ...t, is_active: next } : t)),
        );
      }
    });
  };
  const remove = () => {
    if (!confirm(`${fund.code} takip listesinden çıkarılsın mı?`)) return;
    startTransition(async () => {
      const r = await removeTrackedFund(fund.code);
      if (r.ok) {
        setTracked((prev) => prev.filter((t) => t.fund_code !== fund.code));
      }
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr auto auto auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 14px",
        borderBottom: "1px solid var(--border-soft)",
        opacity: tracked.is_active ? 1 : 0.5,
      }}
    >
      <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
        {fund.code}
      </code>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        <span>{fund.name}</span>
        <FlagBadges fund={fund} />
      </div>
      <ConfidenceBadge value={fund.tax_confidence} />
      <button
        className="chip chip-sm"
        onClick={toggleActive}
        disabled={!configured || busy}
        style={{ cursor: configured ? "pointer" : "default" }}
        title={tracked.is_active ? "Pasifleştir" : "Aktifleştir"}
      >
        {tracked.is_active ? "Aktif" : "Pasif"}
      </button>
      <button
        onClick={remove}
        disabled={!configured || busy}
        style={{
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--muted)",
          borderRadius: 6,
          padding: "4px 8px",
          cursor: configured ? "pointer" : "default",
          fontSize: 12,
        }}
        title="Takipten çıkar"
      >
        <Icon name="trash" size={12} />
      </button>
    </div>
  );
}

function FlagBadges({ fund }: { fund: Fund }) {
  const badges: Array<[string, string]> = [];
  if (fund.is_equity_intensive) badges.push(["HSYF", "#c44569"]);
  if (fund.is_free_fund) badges.push(["Serbest", "#9b59b6"]);
  if (fund.is_fx_denominated) badges.push([`${fund.currency} bazlı`, "#6ea8fe"]);
  return (
    <>
      {badges.map(([label, color]) => (
        <span
          key={label}
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 4,
            background: `${color}22`,
            color,
            border: `1px solid ${color}44`,
          }}
        >
          {label}
        </span>
      ))}
    </>
  );
}

function ConfidenceBadge({ value }: { value: FundTaxConfidence }) {
  const color =
    value === "HIGH" ? "#4cc9b0" :
    value === "MEDIUM" ? "#e0b341" :
    value === "LOW" ? "#d4843a" : "#7d8699";
  return (
    <span
      title={`Stopaj güveni: ${TAX_CONFIDENCE_LABELS[value]}`}
      style={{
        fontSize: 10,
        padding: "2px 7px",
        borderRadius: 999,
        background: `${color}22`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </span>
  );
}

// ---------- Ekle -------------------------------------------------------

function EklePane({ funds, categories, tracked, setTracked, configured }: PaneProps) {
  const trackedSet = useMemo(() => new Set(tracked.map((t) => t.fund_code)), [tracked]);
  const [filterCat, setFilterCat] = useState<number | "all">("all");
  const [search, setSearch] = useState("");

  const available = useMemo(() => {
    let xs = funds.filter((f) => !trackedSet.has(f.code) && f.is_active);
    if (filterCat !== "all") xs = xs.filter((f) => f.category_id === filterCat);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      xs = xs.filter((f) => f.code.includes(q) || f.name.toUpperCase().includes(q));
    }
    return xs.sort((a, b) => a.code.localeCompare(b.code));
  }, [funds, trackedSet, filterCat, search]);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <select
          value={filterCat === "all" ? "all" : String(filterCat)}
          onChange={(e) => setFilterCat(e.target.value === "all" ? "all" : Number(e.target.value))}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            padding: "8px 10px",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <option value="all">Tüm kategoriler</option>
          {categories
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_tr}
              </option>
            ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Fon kodu veya adı ara"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            padding: "8px 10px",
            borderRadius: 6,
            fontSize: 13,
          }}
        />
      </div>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Eklenebilir fonlar</div>
          <div className="card-sub">{available.length}</div>
        </div>
        {available.length === 0 ? (
          <div style={{ padding: 14, color: "var(--muted)", fontSize: 13 }}>
            Filtreye uyan eklenmemiş fon yok.
          </div>
        ) : (
          available.map((f) => (
            <AddFundRow
              key={f.code}
              fund={f}
              category={catById.get(f.category_id)}
              setTracked={setTracked}
              configured={configured}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AddFundRow({
  fund,
  category,
  setTracked,
  configured,
}: {
  fund: Fund;
  category: FundCategory | undefined;
  setTracked: React.Dispatch<React.SetStateAction<TrackedFund[]>>;
  configured: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const add = () => {
    startTransition(async () => {
      const r = await addTrackedFund(fund.code);
      if (r.ok && r.data) {
        setTracked((prev) => [...prev, r.data!]);
      }
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr auto auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 14px",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <code style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
        {fund.code}
      </code>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12 }}>
        <span style={{ color: "var(--muted)" }}>{category?.name_tr}</span>
        <FlagBadges fund={fund} />
      </div>
      <span style={{ fontSize: 10, color: "var(--muted)" }}>
        {INVESTMENT_UNIVERSE_LABELS[fund.investment_universe]}
      </span>
      <button
        onClick={add}
        disabled={!configured || busy}
        className="chip chip-sm"
        style={{ cursor: configured ? "pointer" : "default" }}
      >
        + Ekle
      </button>
    </div>
  );
}

// ---------- Stopaj kuralları (read-only) -------------------------------

function StopajPane({
  rules,
  categories,
}: {
  rules: FundTaxRule[];
  categories: FundCategory[];
}) {
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const active = useMemo(
    () => rules.filter((r) => r.is_active).sort((a, b) => b.priority - a.priority),
    [rules],
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.55,
        }}
      >
        Sprint-1&apos;de salt görüntü. Mevzuat değişikliği olursa kural ekleme/değiştirme Sprint-5&apos;te admin UI ile gelecek.
        Çözüm sırası: <strong>FUND</strong> &gt; <strong>CATEGORY</strong> &gt; <strong>TAX_KIND_DEFAULT</strong>.
        Aynı seviyede birden çok eşleşme varsa <strong>priority DESC</strong> karar verir.
      </div>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Aktif kurallar</div>
          <div className="card-sub">{active.length}</div>
        </div>
        {active.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 130px 1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-soft)",
              fontSize: 12,
            }}
          >
            <span className="chip chip-sm">{r.scope}</span>
            <span style={{ color: "var(--muted)" }}>{TAX_KIND_LABELS[r.tax_kind]}</span>
            <div>
              <div>{r.description}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                {r.scope === "FUND" && `Fon: ${r.fund_code}`}
                {r.scope === "CATEGORY" && `Kategori: ${catById.get(r.category_id ?? -1)?.name_tr ?? "?"}`}
                {" · "}
                Yürürlük: {r.effective_from}
                {r.effective_to ? ` → ${r.effective_to}` : " → ∞"}
                {(r.applies_to_acquired_from || r.applies_to_acquired_to) &&
                  ` · Lot: ${r.applies_to_acquired_from ?? "∞"} → ${r.applies_to_acquired_to ?? "∞"}`}
              </div>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              prio {r.priority}
            </span>
            <strong>
              {r.withholding_rate === null
                ? "—"
                : `%${(Number(r.withholding_rate) * 100).toFixed(2)}`}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Veri Durumu (monitoring) ------------------------------------

function VeriDurumuPane({
  ingestLog,
  fundsHealth,
}: {
  ingestLog: TefasIngestLog[];
  fundsHealth: TefasFundHealth[];
}) {
  const last = ingestLog[0];
  const staleFunds = useMemo(
    () =>
      fundsHealth
        .filter((f) => f.last_as_of === null || (f.days_stale ?? 0) >= 3)
        .sort((a, b) => (b.days_stale ?? 999) - (a.days_stale ?? 999)),
    [fundsHealth],
  );
  const neverFetched = fundsHealth.filter((f) => f.last_as_of === null);
  const upToDate = fundsHealth.filter((f) => (f.days_stale ?? 999) <= 2).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.55,
        }}
      >
        Cron <code style={{ fontFamily: "var(--font-mono)" }}>/api/cron/tefas-prices</code>{" "}
        her gün TR 19:00&apos;da çalışır (TEFAS akşam yayını sonrası). Manuel tetikleme:{" "}
        <code style={{ fontFamily: "var(--font-mono)" }}>Bearer $CRON_SECRET</code> ile
        GET request. Truncgil v4 katılım fonu desteği vermediğinden Sprint-2&apos;de NAV
        fallback kaynağı eklenmedi; TEFAS erişilemezse mevcut son fiyat upsert ile korunur.
      </div>

      {/* Son ingest özet kartı */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Son Ingest</div>
          <div className="card-sub">{last ? new Date(last.ran_at).toLocaleString("tr-TR") : "Henüz çalışmadı"}</div>
        </div>
        {last ? (
          <div
            style={{
              padding: "12px 14px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              fontSize: 12,
            }}
          >
            <Stat label="Talep edilen" value={last.requested} />
            <Stat label="Başarılı" value={last.succeeded} color="#4cc9b0" />
            <Stat label="Upsert" value={last.upserted} />
            <Stat label="Başarısız" value={last.failed_count} color={last.failed_count > 0 ? "#e26a8f" : undefined} />
            <Stat label="Süre" value={`${(last.duration_ms / 1000).toFixed(1)} sn`} />
            <Stat label="Tetiklenen" value={last.triggered_by} />
          </div>
        ) : (
          <div style={{ padding: 14, color: "var(--muted)", fontSize: 13 }}>
            Henüz hiç ingest çalışmamış. Vercel cron dashboard&apos;ından manuel tetikleyebilirsin.
          </div>
        )}
        {last && last.failed_codes.length > 0 && (
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-soft)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
              Başarısız fonlar ({last.failed_codes.length}):
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {last.failed_codes.map((code) => (
                <code
                  key={code}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    padding: "2px 6px",
                    background: "#e26a8f22",
                    color: "#e26a8f",
                    borderRadius: 4,
                  }}
                >
                  {code}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Genel sağlık */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          fontSize: 12,
        }}
      >
        <SummaryChip label="Aktif fon" value={fundsHealth.length} />
        <SummaryChip label="Güncel (≤2 gün)" value={upToDate} color="#4cc9b0" />
        <SummaryChip label="Stale (≥3 gün)" value={staleFunds.length} color={staleFunds.length > 0 ? "#e0b341" : undefined} />
        <SummaryChip label="Hiç fiyatı yok" value={neverFetched.length} color={neverFetched.length > 0 ? "#e26a8f" : undefined} />
      </div>

      {/* Stale fonlar tablosu */}
      {staleFunds.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Stale / Hiç Veri Yok</div>
            <div className="card-sub">{staleFunds.length}</div>
          </div>
          <div style={{ padding: "4px 0" }}>
            {staleFunds.slice(0, 30).map((f) => (
              <div
                key={f.fund_code}
                style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr auto auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border-soft)",
                  fontSize: 12,
                }}
              >
                <code style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{f.fund_code}</code>
                <span style={{ color: "var(--muted)" }}>
                  {f.last_as_of ? `Son: ${f.last_as_of}` : "Hiç veri yok"}
                </span>
                <FlagBadges
                  fund={{
                    code: f.fund_code,
                    is_equity_intensive: f.is_equity_intensive,
                    is_free_fund: f.is_free_fund,
                    is_fx_denominated: f.is_fx_denominated,
                    currency: "TRY",
                  } as unknown as Fund}
                />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {f.last_nav !== null ? `NAV: ${Number(f.last_nav).toFixed(4)}` : "—"}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background:
                      f.days_stale === null ? "#e26a8f22"
                      : f.days_stale >= 7 ? "#e26a8f22"
                      : "#e0b34122",
                    color:
                      f.days_stale === null ? "#e26a8f"
                      : f.days_stale >= 7 ? "#e26a8f"
                      : "#e0b341",
                  }}
                >
                  {f.days_stale === null ? "veri yok" : `${f.days_stale} gün eski`}
                </span>
              </div>
            ))}
            {staleFunds.length > 30 && (
              <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--muted)" }}>
                ... ve {staleFunds.length - 30} fon daha.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Son N ingest geçmişi */}
      {ingestLog.length > 1 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">Ingest Geçmişi</div>
            <div className="card-sub">{ingestLog.length}</div>
          </div>
          <div style={{ padding: "4px 0" }}>
            {ingestLog.map((row) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border-soft)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--muted)" }}>
                  {new Date(row.ran_at).toLocaleString("tr-TR")}
                </span>
                <span style={{ fontSize: 11 }}>
                  {row.triggered_by === "cron" ? "🕒 cron" : "🖱️ manuel"}
                </span>
                <span style={{ color: "#4cc9b0" }}>{row.succeeded}✓</span>
                <span style={{ color: row.failed_count > 0 ? "#e26a8f" : "var(--muted)" }}>
                  {row.failed_count}✗
                </span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                  {(row.duration_ms / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color ?? "var(--fg)" }}>{value}</div>
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <span
      style={{
        padding: "5px 10px",
        borderRadius: 999,
        background: "var(--surface-2)",
        border: "1px solid var(--border-soft)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}: </span>
      <strong style={{ color: color ?? "var(--fg)" }}>{value}</strong>
    </span>
  );
}
