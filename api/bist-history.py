"""
BIST fiyat geçmişi — Vercel Python serverless function (borsapy arkalı).
Hisse ve endeksler için OHLCV geçmişini JSON döner. Tarama motoru (SMA/RSI/
RS/pattern/momentum) ve ana endeks sparkline'ları bu endpoint'i kullanır;
böylece Yahoo Finance 429 kırılganlığından kurtuluruz.

URL: /api/bist-history?symbols=THYAO,ASELS&period=1y&interval=1d
     /api/bist-history?index=XU100,XU030&period=1mo
Cache: 30 dk (Vercel edge cache).
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import math
import traceback

MAX_SYMBOLS = 60  # tek istekte üst sınır — TS tarafı evreni chunk'lar

# borsapy period formatı semboller/sürümler arasında değişebiliyor; sırayla dene
# (bist-sectors.py ile aynı savunmacı yaklaşım).
PERIOD_ALIASES = {
    "1y": ["1y", "1yıl", "1 yıl", "12mo", "1year", "365d", "252d"],
    "6mo": ["6mo", "6ay", "6 ay", "180d"],
    "3mo": ["3mo", "3ay", "3 ay", "90d"],
    "1mo": ["1mo", "1ay", "1 ay", "30d", "1month"],
}


def _clean_num(x):
    try:
        if x is None:
            return None
        f = float(x)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None


def _col(hist, *names):
    """DataFrame'den kolonu esnek isimle çek (Open/open/OPEN...)."""
    for n in names:
        try:
            if hasattr(hist, "columns") and n in hist.columns:
                return list(hist[n])
        except Exception:
            pass
        if isinstance(hist, dict) and n in hist:
            return list(hist[n])
    # kolon bulunamazsa attribute erişimi dene (ör. hist.close)
    for n in names:
        if hasattr(hist, n):
            try:
                return list(getattr(hist, n))
            except Exception:
                pass
    return None


def _timestamps(hist):
    """DatetimeIndex → unix saniye listesi (tarih bazlı dönem hesapları için)."""
    idx = getattr(hist, "index", None)
    if idx is None:
        return None
    out = []
    for v in idx:
        try:
            if hasattr(v, "timestamp"):
                out.append(int(v.timestamp()))
            else:
                out.append(int(v))
        except Exception:
            out.append(0)
    return out


def _series_from_hist(hist):
    if hist is None or getattr(hist, "empty", False):
        return None
    close = _col(hist, "Close", "close", "CLOSE")
    if not close:
        return None
    n = len(close)
    open_ = _col(hist, "Open", "open", "OPEN")
    high = _col(hist, "High", "high", "HIGH")
    low = _col(hist, "Low", "low", "LOW")
    vol = _col(hist, "Volume", "volume", "VOLUME")
    ts = _timestamps(hist)

    def norm(a):
        return [_clean_num(x) for x in a] if a else [None] * n

    return {
        "ts": ts if (ts and len(ts) == n) else list(range(n)),
        "open": norm(open_),
        "high": norm(high),
        "low": norm(low),
        "close": norm(close),
        "volume": [(_clean_num(x) or 0) for x in vol] if vol else [0] * n,
    }


def _history(obj, period):
    """period alias'larını sırayla dene, ilk dolu history'yi döndür."""
    for p in PERIOD_ALIASES.get(period, [period]):
        try:
            s = _series_from_hist(obj.history(period=p))
            if s and any(c is not None for c in s["close"]):
                return s
        except Exception as e:
            print(f"[bist-history] history period={p} error: {e}")
            continue
    return None


def fetch_symbol(bp, symbol, period, is_index):
    try:
        obj = bp.Index(symbol) if is_index else bp.Ticker(symbol)
        return _history(obj, period)
    except Exception as e:
        print(f"[bist-history] {symbol} error: {e}")
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        out = {"status": "ok", "series": {}}
        status_code = 200
        try:
            qs = parse_qs(urlparse(self.path).query)
            period = (qs.get("period", ["1y"])[0] or "1y").strip()
            symbols = [s.strip().upper() for s in qs.get("symbols", [""])[0].split(",") if s.strip()]
            indices = [s.strip().upper() for s in qs.get("index", [""])[0].split(",") if s.strip()]
            symbols = symbols[:MAX_SYMBOLS]
            indices = indices[:MAX_SYMBOLS]

            import borsapy as bp

            for sym in symbols:
                s = fetch_symbol(bp, sym, period, False)
                if s:
                    out["series"][sym] = s
            for sym in indices:
                s = fetch_symbol(bp, sym, period, True)
                if s:
                    out["series"][sym] = s

            out["period"] = period
        except ImportError as e:
            out = {"status": "error", "message": f"borsapy import error: {e}"}
            status_code = 500
        except Exception as e:
            out = {"status": "error", "message": str(e), "trace": traceback.format_exc()[:2000]}
            status_code = 500

        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
