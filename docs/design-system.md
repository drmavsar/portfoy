# Tasarım sistemi — Petrol Masa

Claude Design'daki "Adım 2 · Tasarım Sistemi" (1c Petrol Masa) çıktısının koda aktarımı.
Canlı vitrin: **`/tasarim-sistemi`** (menüde yok, adresle açılır).

## Token'lar — `src/app/globals.css`

Mevcut değişken adları korunur; değerler Petrol Masa'ya geçti. Koyu `:root`, açık `[data-theme="light"]`.

| Yeni token | Amaç |
|---|---|
| `--accent-strong` | Birincil düğme üzerine gelme / basılı (artık griye dönmez) |
| `--focus-ring` | Klavye odağı halkası (2 px, 2 px boşluk) — global `:focus-visible` |
| `--info-soft` | Bilgi notu zemini |
| `--c-sky`, `--c-slate`, `--c-orange` | Grafik paletini 9 renge tamamlar (Nakit, Diğer, ek seri) |
| `--chart-grid`, `--chart-axis` | Grafik ızgarası ve sıfır çizgisi |
| `--radius-pill`, `--row-h-compact` | Rozet köşesi, 44 px tablo satırı (`--row-h` artık 56 px defter satırı) |
| `--shadow-float` | Pencere, çekmece, ipucu gölgesi |
| `--ui-scale` | `data-fontscale` ile 1 · 1,15 · 1,32 (ölçekleme hâlâ `.shell` zoom'u ile) |

Varlık sınıfı renkleri tek kaynaktan: `src/lib/design/palette.ts` (`ASSET_CLASS`, `BENCHMARK_SERIES`).
Hex sabit yazmayın; `var(--c-*)` değerleri SVG, recharts ve `color-mix()` içinde çalışır.

## Biçim — `src/lib/design/format.ts`

`money()` ₺1.234,56 / −₺ (U+2212) · `moneyShort()` ₺5,21 Mn · `pct()` +%3,2 · `dateTR()` 04.10.2026 · `dateShort()` 4 Eki.
Eski `fmt` (src/lib/finance/fmt.ts) ekranlar taşındıkça bırakılacak.

## Bileşenler — `src/components/ui`

| Bileşen | Dosya | Sınıflar |
|---|---|---|
| `Button` (primary / secondary / ghost / danger; sm / md / lg; `loading`) | `button.tsx` | `.btn` `.btn-prim` `.btn-ghost` `.btn-danger` |
| `Delta`, `AmountStack` | `delta.tsx` | `.delta` `.delta-badge` `.amount-stack` |
| `Segmented`, `PeriodPicker` (radiogroup, ok tuşları) | `segmented.tsx` | `.seg` `.seg-item` |
| `SignalChip`, `ImportanceChip`, `ZoneChip`, `TagChip`, `FilterChip` | `status-chips.tsx` | `.chip` `.chip-*` `.filter-chip` |
| `KpiCard` (ready / loading / error / empty, ikincil birim ızgarası) | `kpi-card.tsx` | `.kpi` `.kpi-ccy` |
| `Banner`, `EmptyState`, `Skel`, `LedgerSkeleton` | `feedback.tsx` | `.banner` `.empty` `.skel` |
| `Field` (etiket üstte, hata metin + simge) | `field.tsx` | `.field` `.input` `.select` `.input-amount` `.choice` |
| `UndoToast` (30 sn, üzerine gelince durur, Esc / Ctrl+Z) | `undo-toast.tsx` | `.toast-undo` |

Diğer sınıflar: `.dg` (+ `.dg-sticky`, `tfoot` toplam satırı, `th[aria-sort]`), `.value-cards` (tablonun ≤640 px karşılığı),
`.modal-head/-body/-foot`, `.tabs`, `.eyebrow` (overline stili; Tailwind'in `overline` yardımcı sınıfıyla çakışmasın diye bu ad).

## Gizlilik modu

`body[data-private="true"]` iken `.tabular` ve `.privacy-amount` bulanıklaşır. Yüzde ve oklar için `.privacy-safe` ekleyin
(`Delta` yüzde değerlerinde bunu kendisi yapar).

## Kırılım noktaları

≤1024 px: 4'lü ızgara 2'ye iner. ≤768 px: kenar menü çekmece, dokunma hedefleri 44 px, pencere tam ekran.
≤640 px: sayfa eylemleri tam genişlik, `.only-desktop` / `.only-mobile`, defter satırı sıkışır.

## Henüz yapılmayanlar

- Ekran tasarımları (Adım 3) gelmedi; sayfalardaki satır içi stiller ve 12 px altı `fontSize` değerleri ekranlar taşınırken temizlenecek.
- Mobil alt sekme çubuğu ve Piyasa menüsünün sadeleştirilmesi **Öneri** durumunda; onaylanmadan uygulanmadı.
- Varsayılan tema hâlâ `light` (layout.tsx). Brif "varsayılan koyu" diyor; kayıtlı tercihi olan kullanıcıyı etkilemez.
