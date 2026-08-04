"""
Ekonomik takvim — doviz.com/ekonomik-takvim'i DOĞRUDAN çeker (HTML scrape).

NOT: borsapy'de EconomicCalendar sınıfı YOK; eski kod `bp.EconomicCalendar()`
çağırıp her seferinde AttributeError alıyordu → sayfa hiç çalışmıyordu. Borsa-MCP
(saidsurucu/borsa-mcp) da doviz.com'u tarayıcı User-Agent ile HTML olarak
kazıyor; aynı yöntemi (calendar-content-* kapsayıcıları, text-bold tarih
başlıkları, span.importance, td sırası) burada uyguluyoruz.

URL: /api/economic-calendar?days=14&countries=TR,US,EU
Cache: 30 dk (Vercel edge cache).
"""

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from datetime import datetime, timedelta
import gzip
import json
import re
import traceback

DEFAULT_COUNTRIES = ["TR", "US", "EU"]
MAX_DAYS = 45
CAL_URL = "https://www.doviz.com/ekonomik-takvim"
CALENDAR_CONTAINERS = [
    "calendar-content-0",
    "calendar-content-1",
    "calendar-content-2",
    "calendar-content-3",
]

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.doviz.com/",
    "Connection": "close",
}

DOVIZ_IMPORTANCE = {"low": "low", "mid": "mid", "high": "high"}

# doviz.com Türkçe ülke adı → ISO kodu (frontend filtresi için)
COUNTRY_CODE = {
    "türkiye": "TR", "abd": "US", "amerika": "US", "amerika birleşik devletleri": "US",
    "euro bölgesi": "EU", "avro bölgesi": "EU", "avrupa birliği": "EU",
    "almanya": "DE", "ingiltere": "GB", "birleşik krallık": "GB",
    "japonya": "JP", "çin": "CN", "fransa": "FR", "kanada": "CA",
    "avustralya": "AU", "güney kore": "KR", "brezilya": "BR",
    "i̇talya": "IT", "italya": "IT", "i̇spanya": "ES", "ispanya": "ES",
    "i̇sviçre": "CH", "isviçre": "CH",
}

TR_MONTHS = {
    "ocak": 1, "şubat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "haziran": 6,
    "temmuz": 7, "ağustos": 8, "eylül": 9, "ekim": 10, "kasım": 11, "aralık": 12,
}

DATE_RE = re.compile(r"(\d{1,2})\s+(\S+)\s+(\d{4})")


def _clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s not in ("-", "—", "–", "nan") else None


def _parse_turkish_date(text):
    m = DATE_RE.search(text or "")
    if not m:
        return None
    day = int(m.group(1))
    month = TR_MONTHS.get(m.group(2).strip().lower())
    year = int(m.group(3))
    if not month:
        return None
    try:
        return datetime(year, month, day)
    except ValueError:
        return None


def fetch_html():
    req = Request(CAL_URL, headers=BROWSER_HEADERS)
    with urlopen(req, timeout=25) as resp:
        status = resp.getcode()
        raw = resp.read()
        if (resp.headers.get("Content-Encoding") or "").lower() == "gzip":
            raw = gzip.decompress(raw)
        charset = resp.headers.get_content_charset() or "utf-8"
        return status, raw.decode(charset, errors="replace")


def parse_events(html):
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    out = []
    containers_found = 0

    for container_id in CALENDAR_CONTAINERS:
        container = soup.find(id=container_id)
        if not container:
            continue
        containers_found += 1
        current_date = None
        for child in container.find_all(["div"], recursive=False):
            classes = child.get("class") or []
            if "text-bold" in classes:
                current_date = _parse_turkish_date(child.get_text())
                continue
            table = child.find("table")
            if table is None or current_date is None:
                continue
            for tr in table.find_all("tr"):
                tds = tr.find_all("td")
                if len(tds) < 7:
                    continue
                marker = tr.find("span", class_="importance")
                marker_classes = (marker.get("class") if marker else []) or []
                importance = next(
                    (DOVIZ_IMPORTANCE[c] for c in marker_classes if c in DOVIZ_IMPORTANCE),
                    "low",
                )
                out.append({
                    "date": current_date.strftime("%Y-%m-%d"),
                    "_dt": current_date,
                    "time": _clean(tds[0].get_text(strip=True)),
                    "country": _clean(tds[1].get_text(strip=True)),
                    "importance": importance,
                    "event": _clean(" ".join(tds[3].get_text(strip=True).split())),
                    "actual": _clean(tds[4].get_text(strip=True)),
                    "forecast": _clean(tds[5].get_text(strip=True)),
                    "previous": _clean(tds[6].get_text(strip=True)),
                    "period": None,
                })
    return out, containers_found


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
            want = set(countries)

            start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=days)

            doviz_status, html = fetch_html()
            raw_events, containers_found = parse_events(html)

            events = []
            for e in raw_events:
                dt = e.pop("_dt")
                if dt < start or dt > end:
                    continue
                code = COUNTRY_CODE.get((e["country"] or "").strip().lower())
                # Kod eşleşiyorsa filtrele; eşleşmiyorsa (harita eksik) yine de göster.
                if code is not None and code not in want:
                    continue
                events.append(e)

            events.sort(key=lambda x: (x["date"], x["time"] or ""))

            out["events"] = events
            out["range"] = {"start": start.strftime("%Y-%m-%d"), "end": end.strftime("%Y-%m-%d")}
            out["countries"] = countries
            # Teşhis: parse boş dönerse sebebi (blok mu, seçici mi) görünür.
            out["_diag"] = {
                "doviz_status": doviz_status,
                "containers_found": containers_found,
                "parsed": len(raw_events),
            }
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
