"""
BIST hisse temel analiz verisi — Vercel Python serverless function.
borsapy (TradingView + İş Yatırım + KAP + hedeffiyat arkalı) ile tek bir
hisse için değerleme, mali tablo, temettü ve analist verisini JSON döner.

URL: /api/bist-fundamentals?symbol=THYAO
Cache: 6 saat (temel veri çeyreklik değişir — Vercel edge cache)

Tasarım: hiçbir alt-bölüm hatası tüm yanıtı düşürmez. Her bölüm kendi
try/except'i içinde toplanır; eksikler null döner, sebepler `warnings`
dizisine yazılır. Yalnızca borsapy import / sembol komple başarısızsa
`ok: false` döner.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import re
import time
import traceback


def num(x):
    """Bir değeri float'a çevir; NaN / None / boş ise None döndür."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if v != v:  # NaN
        return None
    return v


# Python'un str.lower() Türkçe değildir: "KARI".lower() → "kari" (noktalı i),
# "İşletme".lower() → "i̇şletme" (i + U+0307). İş Yatırım kalem adları büyük/
# karışık harf geldiğinden kalıplar eşleşmiyor, net kâr yanlış satıra
# ("Durdurulan Faaliyetler ... Dönem Karı (Zararı)" = 0) oturuyordu.
_TR_UPPER = str.maketrans({"İ": "i", "I": "ı"})
_PUNCT = re.compile(r"[()/\-:,.]")
_SPACES = re.compile(r"\s+")


def norm(s):
    """Türkçe-uyumlu küçük harf + noktalama/boşluk normalizasyonu.
    'DÖNEM KARI (ZARARI)' ve 'Dönem Kârı/Zararı' → 'dönem karı zararı'."""
    s = str(s).translate(_TR_UPPER).lower().replace("̇", "")
    s = s.replace("â", "a").replace("î", "i").replace("û", "u")
    s = _PUNCT.sub(" ", s)
    return _SPACES.sub(" ", s).strip()


def find_row(df, patterns, exclude=()):
    """
    DataFrame index'inde (mali tablo kalem adları) `patterns` ile eşleşen
    satırı döndür. Üç geçiş: önce TAM eşleşme, sonra "ile başlar", en son
    "içerir" — böylece "DÖNEM KARI (ZARARI)" toplam satırı, kendisini içeren
    "Durdurulan Faaliyetler ... Dönem Karı (Zararı)" alt satırından önce
    bulunur. Her geçişte pattern sırası önceliklidir. `exclude` içindeki
    ifadeleri barındıran satırlar (ör. "durdurulan", "öncesi") atlanır.
    """
    if df is None or getattr(df, "empty", True):
        return None
    names = [norm(i) for i in df.index]
    pats = [norm(p) for p in patterns]
    excl = [norm(e) for e in exclude]
    candidates = [
        (i, n) for i, n in enumerate(names) if not any(e in n for e in excl)
    ]
    for match in (
        lambda n, p: n == p,
        lambda n, p: n.startswith(p),
        lambda n, p: p in n,
    ):
        for p in pats:
            for i, n in candidates:
                if match(n, p):
                    return df.iloc[i]
    return None


def series_val(row, col=None):
    """Bir satır (Series) içinden tek değeri çek."""
    if row is None:
        return None
    try:
        if col is not None and col in row.index:
            return num(row[col])
        return num(row.iloc[0])
    except Exception:
        return None


def df_to_table(df, max_periods=6):
    """Mali tablo DataFrame'ini {periods, rows} JSON yapısına çevir."""
    if df is None or getattr(df, "empty", True):
        return None
    try:
        cols = list(df.columns)[:max_periods]
        periods = [str(c) for c in cols]
        rows = []
        for item in df.index:
            series = df.loc[item]
            rows.append({
                "item": str(item),
                "values": [num(series[c]) for c in cols],
            })
        return {"periods": periods, "rows": rows}
    except Exception:
        return None


# Mali tablo kalem adı kalıpları (İş Yatırım itemDescTr). Eşleşme norm() ile
# Türkçe-uyumlu yapılır; "kâr"/"kar" ve parantez/eğik çizgi farkları önemsizdir.
# Önce tam eşleşen toplam satırı bulunsun diye spesifik kalıp başa yazılır.
REVENUE_PATTERNS = ["satış gelirleri", "hasılat", "esas faaliyet gelirleri"]
NET_INCOME_PATTERNS = [
    "dönem karı (zararı)", "dönem net karı (zararı)", "net dönem karı (zararı)",
    "dönem net kar/zararı", "net dönem karı", "dönem karı",
]
# Alt kırılım/ara satırlar — net kâr toplamı sanılmasın
NET_INCOME_EXCLUDE = ["durdurulan", "dağılımı", "vergi öncesi", "hisse başına"]
GROSS_PROFIT_PATTERNS = ["brüt kar (zarar)", "brüt kar (zararı)", "brüt kar"]
GROSS_PROFIT_EXCLUDE = ["ticari faaliyetlerden", "finans sektörü"]
EQUITY_PATTERNS = ["toplam özkaynaklar", "özkaynaklar"]
EQUITY_EXCLUDE = ["ana ortaklığa ait", "kaynaklar toplamı"]
TOTAL_ASSETS_PATTERNS = ["toplam varlıklar", "toplam aktifler", "aktif toplamı"]
CURRENT_ASSETS_PATTERNS = ["dönen varlıklar"]
CURRENT_LIAB_PATTERNS = ["kısa vadeli yükümlülükler"]
OCF_PATTERNS = [
    "işletme faaliyetlerinden kaynaklanan",
    "işletme faaliyetlerinden elde edilen",
    "işletme faaliyetlerinden",
]
CAPEX_PATTERNS = [
    "sabit sermaye yatırımları",
    "maddi ve maddi olmayan duran varlık",
    "maddi duran varlık alım",
    "duran varlıkların alım",
]
# Altman Z + Piotroski F için ek kalem kalıpları
RETAINED_PATTERNS = [
    "geçmiş yıllar karları", "geçmiş yıllar kar", "geçmiş yıl kar",
    "birikmiş kar", "dağıtılmamış kar",
]
# Bilançodaki dönem net kârı (yıl başından) — birikmiş kâra eklenir
PERIOD_PROFIT_BAL_PATTERNS = ["dönem net kar/zararı", "dönem net karı", "dönem karı"]
EBIT_PATTERNS = [
    "faaliyet karı (zararı)", "esas faaliyet karı (zararı)",
    "esas faaliyet kar", "faaliyet kar",
]
# "Faaliyet Karı Öncesi Diğer Gelir..." ve "Finansman Gideri Öncesi Faaliyet
# Karı" (yatırım gelirli) faaliyet kârı değildir; "Net Faaliyet" de değil.
EBIT_EXCLUDE = ["öncesi", "net faaliyet"]
LONG_TERM_LIAB_PATTERNS = ["uzun vadeli yükümlülükler", "uzun vadeli yükümlülük"]


def annual_series(df, patterns, max_periods=5, exclude=()):
    """Yıllık mali tablodan bir kalemin yıl→değer listesini çıkar."""
    row = find_row(df, patterns, exclude)
    if row is None:
        return []
    out = []
    for col in list(row.index)[:max_periods]:
        v = num(row[col])
        if v is not None:
            out.append({"period": str(col), "value": v})
    return out


def two_period(df, patterns, exclude=()):
    """[en güncel dönem, bir önceki dönem] değerlerini döndür (Piotroski YoY için).
    İlk kolon en güncel dönemdir; yoksa None."""
    row = find_row(df, patterns, exclude)
    if row is None:
        return [None, None]
    cols = list(row.index)
    cur = num(row[cols[0]]) if len(cols) >= 1 else None
    prev = num(row[cols[1]]) if len(cols) >= 2 else None
    return [cur, prev]


# ---------------------------------------------------------------------------
# TTM — İş Yatırım çeyrek verisi YIL BAŞINDAN KÜMÜLATİFTİR (3/6/9/12 ay; 4.
# çeyrek kolonu yıllık rakamla birebir aynıdır). borsapy'nin get_ttm_* metodu
# son 4 kolonu topluyor → 3+6+9+12 = 30 aylık tutar (~2,5×). Doğru TTM:
#   son çeyrek Q4 ise  → o kolon (tam yıl)
#   değilse            → YTD(yıl, q) + yıllık(yıl-1) − YTD(yıl-1, q)
# ---------------------------------------------------------------------------
_QCOL = re.compile(r"^(\d{4})Q([1-4])$")


def quarter_values(row):
    """Çeyreklik satırı {(yıl, çeyrek): değer} sözlüğüne çevir (boşlar hariç)."""
    out = {}
    if row is None:
        return out
    for col in row.index:
        m = _QCOL.match(str(col))
        v = num(row[col])
        if m and v is not None:
            out[(int(m.group(1)), int(m.group(2)))] = v
    return out


def latest_quarter(qdf, patterns, exclude=()):
    """Verisi yayımlanmış en güncel çeyrek (gelir satırında sıfır olmayan)."""
    vals = quarter_values(find_row(qdf, patterns, exclude))
    published = [k for k, v in vals.items() if v != 0]
    return max(published) if published else None


def ttm_at(qdf, patterns, period, exclude=()):
    """Kümülatif çeyreklik tablodan `period` (yıl, çeyrek) itibarıyla TTM."""
    if period is None:
        return None
    vals = quarter_values(find_row(qdf, patterns, exclude))
    y, q = period
    if q == 4:
        return vals.get((y, 4))
    cur = vals.get((y, q))
    prev_annual = vals.get((y - 1, 4))
    prev_same = vals.get((y - 1, q))
    if cur is None or prev_annual is None or prev_same is None:
        return None
    return cur + prev_annual - prev_same


# borsapy get_company_metrics "Net Borç"u `re.sub(r"[^\d.]", "", value)` ile
# ayrıştırırken eksi işaretini siliyor → net NAKİT pozisyonundaki şirketler
# net BORÇLU görünüyor (borçluluk puanı cezalanıyor). Şirket kartındaki ham
# değerin işaretini okuyup borsapy değerine uygularız.
_NET_DEBT_RE = re.compile(
    r"<th[^>]*>\s*Net Borç[^<]*</th>\s*<td[^>]*>\s*([^<]+?)\s*</td>"
)


def net_debt_is_negative(symbol):
    """İş Yatırım şirket kartında Net Borç negatif mi? Bilinemezse None."""
    try:
        from borsapy._providers.isyatirim import get_isyatirim_provider

        url = (
            "https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/"
            f"sirket-karti.aspx?hisse={symbol}"
        )
        html = get_isyatirim_provider()._client.get(url, timeout=8).text
        idx = html.find("Cari Değerler")
        m = _NET_DEBT_RE.search(html[idx: idx + 3000] if idx > 0 else html)
        if not m:
            return None
        raw = m.group(1).strip()
        return raw.startswith(("-", "−", "("))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Mali tablo çekimi — tek MaliTablo çağrısı, üç tablo
# ---------------------------------------------------------------------------
# İş Yatırım MaliTablo API'si tek çağrıda (≤4 dönem) gelir tablosu + bilanço +
# nakit akışını BİRLİKTE döndürür. borsapy ise her tabloyu ayrı çağırıyor ve 4
# dönemi aşan istekleri bölüyor; bölünen tek dönemlik çağrı (ve art arda gelen
# çağrılar) sık sık boş/hata dönüyor, borsapy de hatayı sessizce yutuyordu →
# yıllık tablolarda 5 yerine 4 yıl, TTM için gereken geçen yıl çeyreği eksik.
# Burada gereken dönemleri tek çağrıda isteyip üç tabloyu aynı yanıttan
# ayrıştırıyoruz (borsapy==0.11.0 iç API'si; requirements'ta sabit).
_STATEMENTS = ("income_stmt", "balance_sheet", "cashflow")


def fetch_statements(symbol, group, periods, quarterly):
    """`periods` [(yıl, ay)] (≤4) için {tablo: DataFrame}. Hata → exception."""
    from borsapy._providers.isyatirim import get_isyatirim_provider

    prov = get_isyatirim_provider()
    params = {
        "companyCode": symbol,
        "exchange": "TRY",
        "financialGroup": group or prov.FINANCIAL_GROUP_INDUSTRIAL,
    }
    for i, (year, period) in enumerate(periods[:4], 1):
        params[f"year{i}"] = year
        params[f"period{i}"] = period
    url = f"{prov.BASE_URL}/Data.aspx/MaliTablo"
    last = None
    for attempt in range(2):  # geçici hata/429 için bir kez yeniden dene
        try:
            data = prov._get(url, params=params).json()
            return {
                st: prov._parse_financial_response(
                    data, periods[:4], quarterly=quarterly, statement_type=st
                )
                for st in _STATEMENTS
            }
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt == 0:
                time.sleep(0.8)
    raise last


def merge_cols(a, b):
    """İki dönem tablosunu kolon bazında birleştir (en yeni kolon önde)."""
    if a is None or getattr(a, "empty", True):
        return b
    if b is None or getattr(b, "empty", True):
        return a
    new = [c for c in b.columns if c not in a.columns]
    out = a.join(b[new], how="outer") if new else a
    return out[sorted(out.columns, key=lambda c: str(c), reverse=True)]


def expected_latest_quarter(now):
    """Yayın gecikmesine göre (borsapy ile aynı kural) beklenen son çeyrek."""
    y, m = now.year, now.month
    if m <= 2:
        return (y - 1, 9)
    if m <= 5:
        return (y - 1, 12)
    if m <= 8:
        return (y, 3)
    if m <= 11:
        return (y, 6)
    return (y, 9)


def prev_quarter(yp):
    y, p = yp
    return (y - 1, 12) if p == 3 else (y, p - 3)


def ttm_needs(yp):
    """TTM için gereken (yıl, ay) dönemleri: son çeyrek, önceki yıl sonu,
    önceki yılın aynı çeyreği (Q4 ise yalnız kendisi)."""
    y, p = yp
    return [(y, 12)] if p == 12 else [(y, p), (y - 1, 12), (y - 1, p)]


def build_financials(symbol, warnings):
    """Yıllık + TTM mali tablolardan ham tablolar ve türetilmiş kalemleri çıkar."""
    fin = {
        "derived": {},
        "income_annual": None,
        "balance_annual": None,
        "cashflow_annual": None,
    }
    now = datetime.now()

    # --- Yıllık: son 4 yıl, TEK çağrı. Sanayi (XI_29) varsayılan; gelir
    # tablosu boşsa banka (UFRS) dene.
    annual_periods = [(now.year - 1 - i, 12) for i in range(4)]
    group = None
    annual = {}
    for g in (None, "UFRS"):
        try:
            st = fetch_statements(symbol, g, annual_periods, quarterly=False)
        except Exception as e:  # noqa: BLE001
            warnings.append(f"yıllık mali tablolar çekilemedi ({g or 'XI_29'}): {e}")
            continue
        if st["income_stmt"] is not None and not st["income_stmt"].empty:
            annual, group = st, g
            break
    inc = annual.get("income_stmt")
    bal = annual.get("balance_sheet")
    cf = annual.get("cashflow")

    fin["income_annual"] = df_to_table(inc)
    fin["balance_annual"] = df_to_table(bal)
    fin["cashflow_annual"] = df_to_table(cf)

    derived = fin["derived"]

    # --- Çeyreklik (kümülatif) → doğru TTM + en güncel bilanço. Beklenen son
    # çeyreğin TTM'i için gereken 3 dönem + (yayımlanmamışsa diye) bir önceki
    # çeyrek → tek çağrı (≤4 dönem).
    cand = expected_latest_quarter(now)
    fallback = prev_quarter(cand)
    qperiods = ttm_needs(cand)
    if fallback not in qperiods:
        qperiods.append(fallback)
    q = {}
    try:
        q = fetch_statements(symbol, group, qperiods, quarterly=True)
    except Exception as e:  # noqa: BLE001
        warnings.append(f"çeyreklik mali tablolar çekilemedi: {e}")
    qinc, qbal, qcf = q.get("income_stmt"), q.get("balance_sheet"), q.get("cashflow")

    # TTM dönemi: gelir satırında verisi yayımlanmış en güncel çeyrek (banka
    # formatında satış satırı yoksa net kârdan).
    def latest():
        return latest_quarter(qinc, REVENUE_PATTERNS) or latest_quarter(
            qinc, NET_INCOME_PATTERNS, NET_INCOME_EXCLUDE
        )

    period = latest()
    # Beklenen çeyrek henüz yayımlanmadıysa önceki çeyreğin TTM'i için eksik
    # dönemleri tamamla (ikinci ve son çağrı).
    if period == (fallback[0], fallback[1] // 3):
        missing = [p for p in ttm_needs(fallback) if p not in qperiods]
        if missing:
            try:
                extra = fetch_statements(symbol, group, missing, quarterly=True)
                qinc = merge_cols(qinc, extra.get("income_stmt"))
                qbal = merge_cols(qbal, extra.get("balance_sheet"))
                qcf = merge_cols(qcf, extra.get("cashflow"))
            except Exception as e:  # noqa: BLE001
                warnings.append(f"önceki çeyrek tabloları çekilemedi: {e}")

    def ttm(qdf, adf, patterns, exclude=()):
        """Kümülatif çeyrekten TTM; hesaplanamazsa son yıllık değer."""
        v = ttm_at(qdf, patterns, period, exclude)
        if v is not None:
            return v
        return series_val(find_row(adf, patterns, exclude))

    # Hangi dönemin kullanıldığını dürüstçe raporla: çeyreklik TTM hesaplanamayıp
    # yıllığa düşüldüyse "2025 (yıllık)" yaz, çeyrek etiketini değil.
    if ttm_at(qinc, REVENUE_PATTERNS, period) is not None or ttm_at(
        qinc, NET_INCOME_PATTERNS, period, NET_INCOME_EXCLUDE
    ) is not None:
        derived["ttm_period"] = f"{period[0]}Q{period[1]}"
    elif inc is not None and not inc.empty:
        derived["ttm_period"] = f"{inc.columns[0]} (yıllık)"
    else:
        derived["ttm_period"] = None
    derived["revenue_ttm"] = ttm(qinc, inc, REVENUE_PATTERNS)
    derived["net_income_ttm"] = ttm(qinc, inc, NET_INCOME_PATTERNS, NET_INCOME_EXCLUDE)
    derived["gross_profit_ttm"] = ttm(qinc, inc, GROSS_PROFIT_PATTERNS, GROSS_PROFIT_EXCLUDE)
    derived["ebit"] = ttm(qinc, inc, EBIT_PATTERNS, EBIT_EXCLUDE)
    derived["operating_cf_ttm"] = ttm(qcf, cf, OCF_PATTERNS)
    capex = ttm(qcf, cf, CAPEX_PATTERNS)
    # capex genelde negatif (nakit çıkışı) — mutlak değer sakla
    derived["capex_ttm"] = abs(capex) if capex is not None else None

    # Bilanço — en güncel yayımlanmış çeyrek (nokta-zaman; kümülatif değil).
    # Çeyreklik yoksa yıllık bilançonun ilk kolonu.
    bal_period = latest_quarter(qbal, TOTAL_ASSETS_PATTERNS)

    def bal_val(patterns, exclude=()):
        if bal_period is not None:
            v = quarter_values(find_row(qbal, patterns, exclude)).get(bal_period)
            if v is not None:
                return v
        return series_val(find_row(bal, patterns, exclude))

    derived["balance_period"] = (
        f"{bal_period[0]}Q{bal_period[1]}" if bal_period else None
    )
    derived["equity"] = bal_val(EQUITY_PATTERNS, EQUITY_EXCLUDE)
    derived["total_assets"] = bal_val(TOTAL_ASSETS_PATTERNS)
    derived["current_assets"] = bal_val(CURRENT_ASSETS_PATTERNS)
    derived["current_liabilities"] = bal_val(CURRENT_LIAB_PATTERNS)

    # Altman X2: birikmiş kâr = geçmiş yıllar kâr/zararı + dönem net kârı
    # (yalnız "geçmiş yıllar" cari yılın kârını dışarıda bırakıyordu).
    past = bal_val(RETAINED_PATTERNS)
    period_profit = bal_val(PERIOD_PROFIT_BAL_PATTERNS)
    derived["retained_earnings"] = (
        past + (period_profit or 0) if past is not None else None
    )

    # Yıllık büyüme için seri
    derived["revenue_annual"] = annual_series(inc, REVENUE_PATTERNS)
    derived["net_income_annual"] = annual_series(
        inc, NET_INCOME_PATTERNS, exclude=NET_INCOME_EXCLUDE
    )

    # Piotroski F — kalemlerin [güncel, önceki] YIL değerleri (YoY karşılaştırma;
    # yıllık tablo kullanılır ki mevsimsellik karışmasın)
    derived["piotroski"] = {
        "total_assets": two_period(bal, TOTAL_ASSETS_PATTERNS),
        "current_assets": two_period(bal, CURRENT_ASSETS_PATTERNS),
        "current_liabilities": two_period(bal, CURRENT_LIAB_PATTERNS),
        "long_term_liabilities": two_period(bal, LONG_TERM_LIAB_PATTERNS),
        "gross_profit": two_period(inc, GROSS_PROFIT_PATTERNS, GROSS_PROFIT_EXCLUDE),
        "revenue": two_period(inc, REVENUE_PATTERNS),
        "net_income": two_period(inc, NET_INCOME_PATTERNS, NET_INCOME_EXCLUDE),
        "operating_cf": two_period(cf, OCF_PATTERNS),
    }

    return fin


def build_holders(ticker, warnings):
    """Ortaklık yapısı (major holders) → [{name, pct}]. borsapy'nin döndürdüğü
    DataFrame şekli belirsiz olduğundan esnek kolon/indeks erişimi."""
    out = []
    try:
        mh = ticker.major_holders
    except Exception as e:
        warnings.append(f"ortaklık yapısı çekilemedi: {e}")
        return out
    if mh is None or getattr(mh, "empty", True):
        return out
    try:
        cols = [str(c) for c in getattr(mh, "columns", [])]

        def pick(keys):
            for c in cols:
                cl = c.lower()
                if any(k in cl for k in keys):
                    return c
            return None

        name_col = pick(("holder", "name", "ortak", "shareholder", "ünvan", "unvan", "isim"))
        pct_col = pick(("pct", "percent", "ratio", "share", "weight", "pay", "yüzde", "yuzde", "oran"))
        for idx, row in list(mh.iterrows())[:12]:
            name = row[name_col] if name_col is not None else idx
            pct = None
            if pct_col is not None:
                pct = num(row[pct_col])
            else:
                for c in cols:
                    v = num(row[c])
                    if v is not None:
                        pct = v
                        break
            sname = str(name).strip() if name is not None else ""
            if sname and sname.lower() != "nan":
                out.append({"name": sname, "pct": pct})
    except Exception as e:
        warnings.append(f"ortaklık yapısı ayrıştırılamadı: {e}")
    return out


def build_news(ticker, warnings, limit=15):
    """KAP açıklamaları / haber akışı → [{date, title, url}]. borsapy'nin
    döndürdüğü şekil (DataFrame/list/dict) belirsiz — esnek erişim."""
    out = []
    try:
        news = ticker.news
    except Exception as e:
        warnings.append(f"haberler çekilemedi: {e}")
        return out
    if news is None:
        return out
    try:
        if hasattr(news, "to_dict") and hasattr(news, "empty"):
            if news.empty:
                return out
            records = news.to_dict(orient="records")
        elif isinstance(news, list):
            records = news
        else:
            return out

        def pick(rec, keys):
            for k in keys:
                if k in rec and rec[k] is not None and str(rec[k]).strip() and str(rec[k]).lower() != "nan":
                    return str(rec[k])
            return None

        for rec in records[:limit]:
            if not isinstance(rec, dict):
                continue
            title = pick(rec, (
                "title", "Title", "headline", "Headline", "subject", "Subject",
                "baslik", "Başlık", "konu", "Konu", "aciklama", "Açıklama",
            ))
            date = pick(rec, (
                "date", "Date", "datetime", "publishTime", "published", "time",
                "Time", "tarih", "Tarih", "pubDate", "publishedDate",
            ))
            url = pick(rec, ("link", "Link", "url", "URL", "href"))
            if title:
                out.append({"date": date, "title": title[:300], "url": url})
    except Exception as e:
        warnings.append(f"haberler ayrıştırılamadı: {e}")
    return out


def build_payload(symbol):
    """Tek hisse için tüm temel analiz verisini topla."""
    import borsapy as bp

    warnings = []
    ticker = bp.Ticker(symbol)

    # Net borç işaret kontrolü ayrı HTTP isteği — diğer çağrılarla paralel
    # çalışsın ki toplam süreyi (60s sınırı) uzatmasın.
    pool = ThreadPoolExecutor(max_workers=1)
    net_debt_neg_future = pool.submit(net_debt_is_negative, symbol)

    out = {
        "ok": True,
        "symbol": symbol,
        "fetched_at": int(time.time()),
        "warnings": warnings,
        "profile": {},
        "quote": {},
        "valuation": {},
        "dividend": {},
        "analyst": {},
        "financials": {},
    }

    # --- info (TradingView quote + İş Yatırım metrik + KAP) ---
    info = {}
    try:
        raw = ticker.info
        info = raw.todict() if hasattr(raw, "todict") else dict(raw)
    except Exception as e:
        warnings.append(f"info çekilemedi: {e}")

    g = info.get
    out["profile"] = {
        "sector": g("sector"),
        "industry": g("industry"),
        "website": g("website"),
        "summary": g("longBusinessSummary"),
    }
    out["quote"] = {
        "price": num(g("last")),
        "previous_close": num(g("close")),
        "change_pct": num(g("change_percent")),
        "currency": g("currency") or "TRY",
        "market_cap": num(g("marketCap")),
        "shares_outstanding": num(g("sharesOutstanding")),
        "fifty_two_week_high": num(g("fiftyTwoWeekHigh")),
        "fifty_two_week_low": num(g("fiftyTwoWeekLow")),
        "fifty_day_average": num(g("fiftyDayAverage")),
        "two_hundred_day_average": num(g("twoHundredDayAverage")),
    }
    out["valuation"] = {
        "pe": num(g("trailingPE")),
        "pb": num(g("priceToBook")),
        "ev_ebitda": num(g("enterpriseToEbitda")),
        "net_debt": num(g("netDebt")),
        "free_float": num(g("floatShares")),
        "foreign_ratio": num(g("foreignRatio")),
    }
    out["dividend"] = {
        "yield": num(g("dividendYield")),
        "annual_rate": num(g("trailingAnnualDividendRate")),
        "ex_date": str(g("exDividendDate")) if g("exDividendDate") else None,
        "history": [],
    }

    # --- temettü geçmişi ---
    try:
        divs = ticker.dividends
        if divs is not None and not divs.empty:
            hist = []
            for idx, row in list(divs.iterrows())[:8]:
                amount = None
                for key in ("Amount", "amount", "Dividends"):
                    if key in row.index:
                        amount = num(row[key])
                        break
                hist.append({"date": str(idx), "amount": amount})
            out["dividend"]["history"] = hist
    except Exception as e:
        warnings.append(f"temettü geçmişi çekilemedi: {e}")

    # --- analist hedefi + tavsiye ---
    analyst = {}
    try:
        rec = ticker.recommendations
        if isinstance(rec, dict):
            analyst["recommendation"] = rec.get("recommendation")
            analyst["target_price"] = num(rec.get("target_price"))
            analyst["upside_potential"] = num(rec.get("upside_potential"))
    except Exception as e:
        warnings.append(f"analist tavsiyesi çekilemedi: {e}")
    try:
        tg = ticker.analyst_price_targets
        if isinstance(tg, dict):
            analyst["low"] = num(tg.get("low"))
            analyst["high"] = num(tg.get("high"))
            analyst["mean"] = num(tg.get("mean"))
            analyst["median"] = num(tg.get("median"))
            analyst["num_analysts"] = tg.get("numberOfAnalysts")
    except Exception as e:
        warnings.append(f"hedef fiyat çekilemedi: {e}")
    try:
        summ = ticker.recommendations_summary
        if isinstance(summ, dict):
            analyst["summary"] = {k: summ.get(k) for k in
                                  ("strongBuy", "buy", "hold", "sell", "strongSell")}
    except Exception as e:
        warnings.append(f"tavsiye dağılımı çekilemedi: {e}")
    out["analyst"] = analyst

    # NOT: ortaklık yapısı (major_holders) + haberler (news) çağrıları YAVAŞ;
    # core payload'u 60s sınırına (504) itiyordu. Artık ayrı hafif ?mode=extra
    # isteğinde dönüyorlar (build_extra_payload) — /temel bunları yan sekmeler
    # için ayrıca, non-blocking çeker.

    # --- mali tablolar ---
    try:
        out["financials"] = build_financials(symbol, warnings)
    except Exception as e:
        warnings.append(f"mali tablolar çekilemedi: {e}")
        out["financials"] = {"derived": {}}

    # Net borç işaretini düzelt (borsapy eksiyi siliyor; bkz. net_debt_is_negative)
    try:
        negative = net_debt_neg_future.result(timeout=10)
    except Exception:
        negative = None
    pool.shutdown(wait=False)
    nd = out["valuation"].get("net_debt")
    if nd is not None and negative is not None:
        out["valuation"]["net_debt"] = -abs(nd) if negative else abs(nd)

    return out


def build_extra_payload(symbol):
    """/temel yan sekmeleri için hafif yük: ortaklık yapısı + haber akışı.
    Ağır mali tablo çağrılarını İÇERMEZ — core bist-fundamentals'ı 504'e itmemek
    için ayrı bir istek olarak (?mode=extra) döner."""
    import borsapy as bp

    warnings = []
    ticker = bp.Ticker(symbol)
    return {
        "ok": True,
        "symbol": symbol,
        "warnings": warnings,
        "holders": build_holders(ticker, warnings),
        "news": build_news(ticker, warnings),
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status_code = 200
        try:
            qs = parse_qs(urlparse(self.path).query)
            raw_symbol = (qs.get("symbol", [""])[0] or "").strip().upper()
            symbol = re.sub(r"[^A-Z0-9]", "", raw_symbol)[:12]
            mode = (qs.get("mode", [""])[0] or "").strip().lower()
            if not symbol:
                out = {"ok": False, "error": "symbol parametresi gerekli"}
                status_code = 400
            elif mode == "extra":
                out = build_extra_payload(symbol)
            else:
                out = build_payload(symbol)
        except ImportError as e:
            out = {"ok": False, "error": f"borsapy import error: {e}"}
            status_code = 500
        except Exception as e:
            out = {
                "ok": False,
                "error": str(e),
                "trace": traceback.format_exc()[:2000],
            }
            status_code = 500

        body = json.dumps(out, ensure_ascii=False, default=str)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "s-maxage=21600, stale-while-revalidate=43200")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))
