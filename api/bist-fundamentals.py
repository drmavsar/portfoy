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


def find_row(df, patterns):
    """
    DataFrame index'inde (mali tablo kalem adları) sırayla `patterns`
    içindeki ilk eşleşen satırı döndür. Pattern sırası önceliklidir —
    daha spesifik kalıbı listenin başına koy.
    """
    if df is None or getattr(df, "empty", True):
        return None
    index_list = [str(i) for i in df.index]
    for pat in patterns:
        p = pat.lower()
        for i, name in enumerate(index_list):
            if p in name.lower():
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


# Mali tablo kalem adı kalıpları (İş Yatırım itemDescTr — küçük harf eşleşme)
REVENUE_PATTERNS = ["satış gelirleri", "hasılat", "esas faaliyet gelirleri"]
NET_INCOME_PATTERNS = [
    "dönem karı (zararı)", "dönem kârı (zararı)",
    "net dönem karı", "net dönem kârı",
]
GROSS_PROFIT_PATTERNS = ["brüt kar", "brüt kâr"]
EQUITY_PATTERNS = ["toplam özkaynaklar", "özkaynaklar"]
TOTAL_ASSETS_PATTERNS = ["toplam varlıklar", "toplam aktifler"]
CURRENT_ASSETS_PATTERNS = ["dönen varlıklar"]
CURRENT_LIAB_PATTERNS = ["kısa vadeli yükümlülükler"]
OCF_PATTERNS = [
    "işletme faaliyetlerinden kaynaklanan",
    "işletme faaliyetlerinden elde edilen",
    "işletme faaliyetlerinden",
]
CAPEX_PATTERNS = [
    "maddi ve maddi olmayan duran varlık",
    "maddi duran varlık alım",
    "duran varlıkların alım",
]
# Altman Z + Piotroski F için ek kalem kalıpları
RETAINED_PATTERNS = [
    "geçmiş yıllar kar", "geçmiş yıllar kâr", "geçmiş yıl kar", "geçmiş yıl kâr",
    "birikmiş kar", "birikmiş kâr", "dağıtılmamış kar", "dağıtılmamış kâr",
]
EBIT_PATTERNS = [
    "esas faaliyet kar", "esas faaliyet kâr",
    "faaliyet kar", "faaliyet kâr",
]
LONG_TERM_LIAB_PATTERNS = ["uzun vadeli yükümlülükler", "uzun vadeli yükümlülük"]


def annual_series(df, patterns, max_periods=5):
    """Yıllık mali tablodan bir kalemin yıl→değer listesini çıkar."""
    row = find_row(df, patterns)
    if row is None:
        return []
    out = []
    for col in list(row.index)[:max_periods]:
        v = num(row[col])
        if v is not None:
            out.append({"period": str(col), "value": v})
    return out


def two_period(df, patterns):
    """[en güncel dönem, bir önceki dönem] değerlerini döndür (Piotroski YoY için).
    İlk kolon en güncel dönemdir; yoksa None."""
    row = find_row(df, patterns)
    if row is None:
        return [None, None]
    cols = list(row.index)
    cur = num(row[cols[0]]) if len(cols) >= 1 else None
    prev = num(row[cols[1]]) if len(cols) >= 2 else None
    return [cur, prev]


def build_financials(ticker, warnings):
    """Yıllık + TTM mali tablolardan ham tablolar ve türetilmiş kalemleri çıkar."""
    fin = {
        "derived": {},
        "income_annual": None,
        "balance_annual": None,
        "cashflow_annual": None,
    }

    # Sanayi (XI_29) varsayılan; gelir tablosu boşsa banka (UFRS) dene.
    group = None
    inc = bal = cf = None
    try:
        inc = ticker.get_income_stmt()
        if inc is None or inc.empty:
            raise ValueError("empty")
    except Exception:
        try:
            group = "UFRS"
            inc = ticker.get_income_stmt(financial_group=group)
        except Exception as e:
            warnings.append(f"gelir tablosu çekilemedi: {e}")
            inc = None

    try:
        bal = ticker.get_balance_sheet(financial_group=group)
    except Exception as e:
        warnings.append(f"bilanço çekilemedi: {e}")
    try:
        cf = ticker.get_cashflow(financial_group=group)
    except Exception as e:
        warnings.append(f"nakit akış tablosu çekilemedi: {e}")

    fin["income_annual"] = df_to_table(inc)
    fin["balance_annual"] = df_to_table(bal)
    fin["cashflow_annual"] = df_to_table(cf)

    derived = fin["derived"]

    # TTM gelir tablosu — son 4 çeyrek toplamı
    try:
        ttm_inc = ticker.get_ttm_income_stmt(financial_group=group)
        derived["revenue_ttm"] = series_val(find_row(ttm_inc, REVENUE_PATTERNS))
        derived["net_income_ttm"] = series_val(find_row(ttm_inc, NET_INCOME_PATTERNS))
        derived["gross_profit_ttm"] = series_val(find_row(ttm_inc, GROSS_PROFIT_PATTERNS))
    except Exception as e:
        warnings.append(f"TTM gelir tablosu çekilemedi: {e}")

    # TTM nakit akış
    try:
        ttm_cf = ticker.get_ttm_cashflow(financial_group=group)
        derived["operating_cf_ttm"] = series_val(find_row(ttm_cf, OCF_PATTERNS))
        capex = series_val(find_row(ttm_cf, CAPEX_PATTERNS))
        # capex genelde negatif (nakit çıkışı) — mutlak değer sakla
        derived["capex_ttm"] = abs(capex) if capex is not None else None
    except Exception as e:
        warnings.append(f"TTM nakit akış çekilemedi: {e}")

    # Bilanço — en güncel dönem (ilk kolon)
    if bal is not None and not bal.empty:
        derived["equity"] = series_val(find_row(bal, EQUITY_PATTERNS))
        derived["total_assets"] = series_val(find_row(bal, TOTAL_ASSETS_PATTERNS))
        derived["current_assets"] = series_val(find_row(bal, CURRENT_ASSETS_PATTERNS))
        derived["current_liabilities"] = series_val(find_row(bal, CURRENT_LIAB_PATTERNS))

    # Yıllık büyüme için seri
    derived["revenue_annual"] = annual_series(inc, REVENUE_PATTERNS)
    derived["net_income_annual"] = annual_series(inc, NET_INCOME_PATTERNS)

    # Altman Z (mevcut dönem): birikmiş kâr + EBIT (faaliyet kârı)
    if bal is not None and not bal.empty:
        derived["retained_earnings"] = series_val(find_row(bal, RETAINED_PATTERNS))
    derived["ebit"] = series_val(find_row(inc, EBIT_PATTERNS))

    # Piotroski F — kalemlerin [güncel, önceki] yıl değerleri (YoY karşılaştırma)
    derived["piotroski"] = {
        "total_assets": two_period(bal, TOTAL_ASSETS_PATTERNS),
        "current_assets": two_period(bal, CURRENT_ASSETS_PATTERNS),
        "current_liabilities": two_period(bal, CURRENT_LIAB_PATTERNS),
        "long_term_liabilities": two_period(bal, LONG_TERM_LIAB_PATTERNS),
        "gross_profit": two_period(inc, GROSS_PROFIT_PATTERNS),
        "revenue": two_period(inc, REVENUE_PATTERNS),
        "net_income": two_period(inc, NET_INCOME_PATTERNS),
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

    # --- ortaklık yapısı (major holders) ---
    out["holders"] = build_holders(ticker, warnings)

    # --- KAP açıklamaları / haber akışı ---
    out["news"] = build_news(ticker, warnings)

    # --- mali tablolar ---
    try:
        out["financials"] = build_financials(ticker, warnings)
    except Exception as e:
        warnings.append(f"mali tablolar çekilemedi: {e}")
        out["financials"] = {"derived": {}}

    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status_code = 200
        try:
            qs = parse_qs(urlparse(self.path).query)
            raw_symbol = (qs.get("symbol", [""])[0] or "").strip().upper()
            symbol = re.sub(r"[^A-Z0-9]", "", raw_symbol)[:12]
            if not symbol:
                out = {"ok": False, "error": "symbol parametresi gerekli"}
                status_code = 400
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
