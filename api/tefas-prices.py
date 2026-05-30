"""
TEFAS fon fiyatları (NAV) — Vercel Python serverless function.

tefas-crawler PyPI paketi ile TEFAS resmi API'sinden günlük NAV çeker.

Query parametreleri:
  - codes: virgülle ayrılmış fon kodları (ör. "HFI,KMF,KPI"). Maks 20.
  - start: YYYY-MM-DD (opsiyonel, default: bugünden 5 gün önce — hafta sonu/tatil için pencere)
  - end:   YYYY-MM-DD (opsiyonel, default: bugün)

Yanıt:
{
  "ok": true,
  "fetched_at": "2026-05-30T15:00:00Z",
  "source": "tefas",
  "prices": [
    { "code": "HFI", "as_of": "2026-05-29", "nav": 12.345678, "title": "..." },
    ...
  ],
  "failed": ["XYZ"]  # bulunamayan / hata veren fon kodları
}

Not (2026 sonrası TEFAS API): market_cap / investor_count / share_count
artık tarihsel yayınlanmıyor — bu endpoint bu alanları döndürmez. fund_prices
tablosunda kolonlar null olarak yazılır.

URL: /api/tefas-prices?codes=HFI,KMF,KPI&start=2026-05-25&end=2026-05-30
Cache: 6 saat (TEFAS akşam yayınlar; intra-day update beklenmiyor).
"""

from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import traceback

MAX_CODES_PER_REQUEST = 20
DEFAULT_LOOKBACK_DAYS = 5  # hafta sonu / tatil esnetmesi


def fetch_prices(codes, start_iso, end_iso):
    """tefas-crawler ile NAV verilerini çek.

    Birden çok fon için fetch() ayrı ayrı çağrılır (paket name parametresi
    tek fon kabul ediyor). Her fon için en son tarihli NAV satırı seçilir.

    Returns: (prices: list, failed: list)
    """
    from tefas import Crawler

    crawler = Crawler()
    prices = []
    failed = []

    for code in codes:
        try:
            df = crawler.fetch(
                start=start_iso,
                end=end_iso,
                name=code,
                columns=["code", "title", "date", "price"],
            )
            # df pandas DataFrame; boş ise fon o aralıkta veri yok
            if df is None or len(df) == 0:
                failed.append(code)
                continue

            # En son tarihli satırı seç
            df_sorted = df.sort_values("date", ascending=False)
            row = df_sorted.iloc[0]
            as_of_val = row["date"]
            # date string ise YYYY-MM-DD'ye normalize et
            if hasattr(as_of_val, "strftime"):
                as_of = as_of_val.strftime("%Y-%m-%d")
            else:
                as_of = str(as_of_val)[:10]

            nav = float(row["price"])
            if nav <= 0:
                failed.append(code)
                continue

            prices.append({
                "code": str(row["code"]).strip(),
                "title": str(row.get("title", "")).strip() or None,
                "as_of": as_of,
                "nav": nav,
            })
        except Exception as e:
            print(f"[tefas-prices] {code} fetch error: {e}")
            failed.append(code)
            continue

    return prices, failed


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            codes_raw = (qs.get("codes", [""])[0] or "").strip()
            codes = [c.strip().upper() for c in codes_raw.split(",") if c.strip()]

            if not codes:
                self._respond(400, {
                    "ok": False,
                    "error": "codes parametresi zorunlu (ör. ?codes=HFI,KMF)",
                })
                return

            if len(codes) > MAX_CODES_PER_REQUEST:
                self._respond(400, {
                    "ok": False,
                    "error": f"En fazla {MAX_CODES_PER_REQUEST} fon kodu kabul edilir, {len(codes)} gönderildi",
                })
                return

            today = date.today()
            end_iso = qs.get("end", [today.isoformat()])[0]
            start_iso = qs.get(
                "start",
                [(today - timedelta(days=DEFAULT_LOOKBACK_DAYS)).isoformat()],
            )[0]

            # Tarih validasyonu
            try:
                datetime.fromisoformat(start_iso)
                datetime.fromisoformat(end_iso)
            except ValueError:
                self._respond(400, {
                    "ok": False,
                    "error": "start/end YYYY-MM-DD formatında olmalı",
                })
                return

            prices, failed = fetch_prices(codes, start_iso, end_iso)

            self._respond(200, {
                "ok": True,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "source": "tefas",
                "window": {"start": start_iso, "end": end_iso},
                "requested": len(codes),
                "succeeded": len(prices),
                "failed": failed,
                "prices": prices,
            })

        except ImportError as e:
            self._respond(500, {
                "ok": False,
                "error": f"tefas-crawler import error: {e}",
            })
        except Exception as e:
            self._respond(500, {
                "ok": False,
                "error": str(e),
                "trace": traceback.format_exc()[:2000],
            })

    def _respond(self, status, body):
        payload = json.dumps(body, ensure_ascii=False)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        # 6 saat cache: TEFAS akşam yayınlar, intra-day update yok
        self.send_header("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400")
        self.end_headers()
        self.wfile.write(payload.encode("utf-8"))
