"""
BIST analist tavsiye + hedef fiyat — toplu borsapy serverless endpoint.
/radar için sembol başına hedef fiyat, yükseliş potansiyeli ve AL/TUT/SAT
dağılımını tek istekte döner (per-sembol /api/bist-fundamentals çok pahalı).

URL: /api/analyst-ratings?symbols=THYAO,ASELS
Cache: 6 saat (analist verisi yavaş değişir — Vercel edge cache).
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import math
import traceback

MAX_SYMBOLS = 60  # tek istekte üst sınır — TS tarafı evreni chunk'lar


def num(x):
    try:
        if x is None:
            return None
        v = float(x)
        return None if (math.isnan(v) or math.isinf(v)) else v
    except (TypeError, ValueError):
        return None


def fetch_one(bp, symbol):
    """Tek sembol için analist tavsiye + hedef fiyat + dağılım.
    Her alt-bölüm kendi try/except'inde — biri düşerse diğerleri gelir."""
    t = bp.Ticker(symbol)
    out = {"symbol": symbol}

    try:
        rec = t.recommendations
        if isinstance(rec, dict):
            out["recommendation"] = rec.get("recommendation")
            out["target_price"] = num(rec.get("target_price"))
            out["upside_pct"] = num(rec.get("upside_potential"))
    except Exception as e:
        print(f"[analyst-ratings] {symbol} recommendations error: {e}")

    try:
        tg = t.analyst_price_targets
        if isinstance(tg, dict):
            out["target_mean"] = num(tg.get("mean"))
            out["num_analysts"] = tg.get("numberOfAnalysts")
    except Exception as e:
        print(f"[analyst-ratings] {symbol} price_targets error: {e}")

    try:
        s = t.recommendations_summary
        if isinstance(s, dict):
            out["strong_buy"] = s.get("strongBuy")
            out["buy"] = s.get("buy")
            out["hold"] = s.get("hold")
            out["sell"] = s.get("sell")
            out["strong_sell"] = s.get("strongSell")
    except Exception as e:
        print(f"[analyst-ratings] {symbol} summary error: {e}")

    # target_mean yoksa recommendations.target_price'a düş
    if out.get("target_mean") is None and out.get("target_price") is not None:
        out["target_mean"] = out["target_price"]
    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        out = {"status": "ok", "ratings": {}}
        status_code = 200
        try:
            qs = parse_qs(urlparse(self.path).query)
            symbols = [
                s.strip().upper()
                for s in qs.get("symbols", [""])[0].split(",")
                if s.strip()
            ][:MAX_SYMBOLS]

            import borsapy as bp

            for sym in symbols:
                try:
                    out["ratings"][sym] = fetch_one(bp, sym)
                except Exception as e:
                    print(f"[analyst-ratings] {sym} error: {e}")
        except ImportError as e:
            out = {"status": "error", "message": f"borsapy import error: {e}"}
            status_code = 500
        except Exception as e:
            out = {"status": "error", "message": str(e), "trace": traceback.format_exc()[:2000]}
            status_code = 500

        body = json.dumps(out, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=0, s-maxage=21600, stale-while-revalidate=43200")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
