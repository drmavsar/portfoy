"""
Ekonomik takvim — Vercel Python serverless function (borsapy arkalı).
doviz.com ekonomik takvimini borsapy.EconomicCalendar ile çekip JSON döner.

URL: /api/economic-calendar?days=14&countries=TR,US,EU
Cache: 30 dakika (Vercel edge cache tarafında).
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
import json
import math
import traceback

DEFAULT_COUNTRIES = ["TR", "US", "EU"]
MAX_DAYS = 45


def _clean(v):
    """NaN/boş → None; pandas/np skalerlerini düz Python'a çevir."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, str):
        s = v.strip()
        return s if s and s.lower() != "nan" else None
    return v


def _row_get(row, *keys):
    for k in keys:
        if k in row:
            return row[k]
    return None


def fetch_events(bp, start: datetime, end: datetime, countries):
    cal = bp.EconomicCalendar()
    df = cal.events(start=start, end=end, country=countries)
    if df is None or getattr(df, "empty", True):
        return []

    out = []
    for rec in df.to_dict(orient="records"):
        d = _row_get(rec, "Date", "date")
        # Date datetime/Timestamp veya string olabilir
        if hasattr(d, "strftime"):
            date_str = d.strftime("%Y-%m-%d")
        else:
            date_str = str(d)[:10] if d is not None else None
        out.append(
            {
                "date": date_str,
                "time": _clean(_row_get(rec, "Time", "time")),
                "country": _clean(_row_get(rec, "Country", "country")),
                "importance": _clean(_row_get(rec, "Importance", "importance")),
                "event": _clean(_row_get(rec, "Event", "event")),
                "actual": _clean(_row_get(rec, "Actual", "actual")),
                "forecast": _clean(_row_get(rec, "Forecast", "forecast")),
                "previous": _clean(_row_get(rec, "Previous", "previous")),
                "period": _clean(_row_get(rec, "Period", "period")),
            }
        )
    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        out = {"status": "ok", "events": []}
        status_code = 200
        try:
            qs = parse_qs(urlparse(self.path).query)
            try:
                days = int(qs.get("days", ["14"])[0])
            except (ValueError, TypeError):
                days = 14
            days = max(1, min(MAX_DAYS, days))

            countries_param = qs.get("countries", [""])[0].strip()
            countries = (
                [c.strip().upper() for c in countries_param.split(",") if c.strip()]
                if countries_param
                else DEFAULT_COUNTRIES
            )

            start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=days)

            import borsapy as bp

            out["events"] = fetch_events(bp, start, end, countries)
            out["range"] = {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")}
            out["countries"] = countries
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

        body = json.dumps(out, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
