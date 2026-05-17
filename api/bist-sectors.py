"""
BIST sektör endeksleri — Vercel Python serverless function.
borsapy (TradingView arkalı) ile Yahoo Finance'ta tutarsız olan
sektör endekslerini çekip JSON döner.

URL: /api/bist-sectors
Cache: 10 dakika (Vercel edge cache)
"""

from http.server import BaseHTTPRequestHandler
import json
import traceback

SECTOR_SYMBOLS = [
    "XBANK",  # Banka
    "XUSIN",  # Sanayi
    "XGIDA",  # Gıda
    "XHOLD",  # Holding
    "XKMYA",  # Kimya
    "XULAS",  # Ulaştırma
    "XELKT",  # Elektrik
    "XMANA",  # Madencilik
    "XILTM",  # İletişim
    "XTEKS",  # Tekstil
    "XKURY",  # Kurumsal Yön.
]

SECTOR_LABELS = {
    "XBANK": "Banka",
    "XUSIN": "Sanayi",
    "XGIDA": "Gıda",
    "XHOLD": "Holding",
    "XKMYA": "Kimya",
    "XULAS": "Ulaştırma",
    "XELKT": "Elektrik",
    "XMANA": "Madencilik",
    "XILTM": "İletişim",
    "XTEKS": "Tekstil",
    "XKURY": "Kurumsal Yön.",
}


def fetch_one(bp, symbol: str):
    """Tek bir endeks için info + son 1 ay close array'i."""
    try:
        idx = bp.Index(symbol)
        info = getattr(idx, "info", {}) or {}
        # info dict olabilir veya object — esnek erişim
        get = (lambda k: info.get(k) if isinstance(info, dict) else getattr(info, k, None))

        price = None
        for k in ("last", "last_price", "price", "close", "current"):
            v = get(k)
            if v is not None:
                try:
                    price = float(v)
                    break
                except (TypeError, ValueError):
                    pass

        prev = None
        for k in ("previous_close", "prev_close", "previousClose"):
            v = get(k)
            if v is not None:
                try:
                    prev = float(v)
                    break
                except (TypeError, ValueError):
                    pass

        chg_pct = None
        for k in ("change_percent", "change_pct", "changePct", "percent"):
            v = get(k)
            if v is not None:
                try:
                    chg_pct = float(v)
                    break
                except (TypeError, ValueError):
                    pass
        if chg_pct is None and price is not None and prev is not None and prev > 0:
            chg_pct = ((price - prev) / prev) * 100.0

        closes = []
        # period formatı bazı semboller için farklı çalışıyor — sırayla dene
        for period in ("1ay", "1mo", "30d", "1 ay", "1m", "1month"):
            try:
                hist = idx.history(period=period)
                if hist is None:
                    continue
                vals = None
                if hasattr(hist, "close"):
                    vals = hist.close.tolist()
                elif hasattr(hist, "Close"):
                    vals = hist.Close.tolist()
                elif isinstance(hist, dict) and "close" in hist:
                    vals = hist["close"]
                elif hasattr(hist, "iloc") and len(hist.columns) > 0:
                    # son kolon close olabilir
                    for col in ("Close", "close", "CLOSE"):
                        if col in hist.columns:
                            vals = hist[col].tolist()
                            break
                if vals:
                    closes = [float(x) for x in vals if x is not None and not (isinstance(x, float) and x != x)]
                    if closes:
                        break  # başarılı
            except Exception as e:
                print(f"[bist-sectors] {symbol} history period={period} error: {e}")
                continue

        return {
            "symbol": symbol,
            "label": SECTOR_LABELS.get(symbol, symbol),
            "price": price,
            "previous_close": prev,
            "change_pct": chg_pct,
            "closes_1mo": closes,
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        out = {"status": "ok", "sectors": []}
        status_code = 200
        try:
            import borsapy as bp
            for sym in SECTOR_SYMBOLS:
                out["sectors"].append(fetch_one(bp, sym))
        except ImportError as e:
            out = {"status": "error", "message": f"borsapy import error: {e}"}
            status_code = 500
        except Exception as e:
            out = {
                "status": "error",
                "message": str(e),
                "trace": traceback.format_exc()[:2000],
            }
            status_code = 500

        body = json.dumps(out, ensure_ascii=False)
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "s-maxage=600, stale-while-revalidate=1200")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))
