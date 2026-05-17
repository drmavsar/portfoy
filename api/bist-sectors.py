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
        try:
            hist = idx.history(period="1ay")
            if hist is not None:
                if hasattr(hist, "close"):
                    closes = [float(x) for x in hist.close.tolist() if x is not None]
                elif hasattr(hist, "Close"):
                    closes = [float(x) for x in hist.Close.tolist() if x is not None]
                elif isinstance(hist, dict) and "close" in hist:
                    closes = [float(x) for x in hist["close"] if x is not None]
        except Exception as e:
            print(f"[bist-sectors] {symbol} history error: {e}")

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
