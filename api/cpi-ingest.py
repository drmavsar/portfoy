"""
TCMB EVDS — TÜFE Genel endeksi ingest endpoint.

URL: /api/cpi-ingest?series=CPI_TR_GENERAL&start=2010-01&end=2026-12
Default start: 2010-01, default end: bugünün ayı.

EVDS seri kodu: TP.FG.J0  (TÜFE Genel, aylık)
Bizim series_code: CPI_TR_GENERAL  (Sprint-3 PR-1'de tek seri)

Yanıt:
{
  "ok": true,
  "fetched_at": "2026-05-30T...",
  "source": "TCMB_EVDS",
  "series_code": "CPI_TR_GENERAL",
  "window": { "start": "2010-01", "end": "2026-05" },
  "fetched_periods": 197,
  "rows": [
    { "period_month": "2026-04", "index_value": 1234.56,
      "monthly_change_pct": 2.34, "is_final": true },
    ...
  ]
}

Env: EVDS_API_KEY (TCMB EVDS portalından ücretsiz alınır)

Cache: 24 saat — TÜİK aylık veri.
"""

from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import os
import traceback
import urllib.error
import urllib.request

EVDS_BASE = "https://evds2.tcmb.gov.tr/service/evds/series"
SERIES_MAP = {
    # Bizim kanonik kodumuz -> TCMB EVDS seri kodu
    "CPI_TR_GENERAL": "TP.FG.J0",
}


def parse_evds_value(v):
    """EVDS bazen virgüllü sayı döner; bazen None / boş string."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s.lower() == "null":
        return None
    s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def normalize_period(tarih_str: str) -> str:
    """EVDS 'Tarih' alanı 'YYYY-MM' veya 'M-YYYY' formatında olabilir.
    Standart 'YYYY-MM' formatına çevir."""
    s = tarih_str.strip()
    if "-" not in s:
        return s
    parts = s.split("-")
    if len(parts) != 2:
        return s
    a, b = parts[0].strip(), parts[1].strip()
    if len(a) == 4:           # YYYY-MM zaten
        y, m = a, b
    else:                     # M-YYYY → YYYY-MM
        y, m = b, a
    return f"{int(y):04d}-{int(m):02d}"


def fetch_evds(series_evds: str, start_iso: str, end_iso: str, api_key: str):
    """EVDS API'sinden seri verilerini çek.

    start/end formatı EVDS için 'DD-MM-YYYY'. Aylık veri için gün hep '01'.

    EVDS 5 Nisan 2024'ten sonra API key'i HTTP header'da bekliyor (eskiden
    query parametresiydi). Hem header hem query'ye koyuyoruz — geriye dönük
    uyum için.

    Yanıt JSON değilse (genelde HTML hata sayfası) ayrıntılı hata fırlatır.
    """
    sy, sm = start_iso.split("-")
    ey, em = end_iso.split("-")
    start_evds = f"01-{int(sm):02d}-{int(sy):04d}"
    end_evds = f"01-{int(em):02d}-{int(ey):04d}"

    url = (
        f"{EVDS_BASE}={series_evds}"
        f"&startDate={start_evds}"
        f"&endDate={end_evds}"
        f"&type=json"
        f"&frequency=5"  # 5 = aylık
        f"&aggregationTypes=avg"
        f"&formulas=0"
        f"&decimalSeperator=."
        f"&key={api_key}"  # legacy / geriye dönük destek
    )
    req = urllib.request.Request(
        url,
        headers={
            "key": api_key,
            "User-Agent": "Mozilla/5.0 (compatible; portfoy-cpi-ingest/1.0)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            content_type = resp.headers.get("Content-Type", "unknown")
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as he:
        body = he.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"EVDS HTTP {he.code}: content-type={he.headers.get('Content-Type', 'unknown')}, "
            f"body[0:300]={body[:300]!r}"
        )

    # JSON değilse açıklayıcı hata
    try:
        return json.loads(body)
    except json.JSONDecodeError as je:
        is_html = body.lstrip().lower().startswith(("<", "&lt;"))
        kind = "HTML" if is_html else "non-JSON"
        # Olası nedenler diagnostik:
        hints = []
        if is_html and "captcha" in body.lower():
            hints.append("EVDS CAPTCHA döndürdü (rate limit veya IP block olabilir)")
        if is_html and "login" in body.lower():
            hints.append("EVDS login sayfası döndü — API key geçersiz veya süresi dolmuş")
        if "Forbidden" in body or "403" in body:
            hints.append("403 Forbidden — IP veya User-Agent reject")
        if api_key and len(api_key) < 20:
            hints.append(f"API key kısa görünüyor (len={len(api_key)}) — yanlış kopyalanmış olabilir")
        hint_str = " | ".join(hints) if hints else "EVDS'nin yanıt formatı değişmiş olabilir"

        raise RuntimeError(
            f"EVDS {kind} döndü (JSON beklenirken). "
            f"status={status}, content-type={content_type}, "
            f"url={url.replace(api_key, '***' if api_key else '')}, "
            f"hints={hint_str}, "
            f"body[0:300]={body[:300]!r}, "
            f"json_error={je}"
        )


def build_rows(evds_json, evds_field):
    """EVDS yanıtını cpi_monthly satırlarına çevir, m/m değişimi hesapla."""
    items = evds_json.get("items", [])
    if not items:
        return []

    # Periyoda göre sırala (artan)
    parsed = []
    for it in items:
        period = normalize_period(it.get("Tarih", ""))
        value = parse_evds_value(it.get(evds_field))
        if not period or value is None or value <= 0:
            continue
        parsed.append((period, value))
    parsed.sort(key=lambda x: x[0])

    rows = []
    prev_value = None
    for period, value in parsed:
        change = None
        if prev_value is not None and prev_value > 0:
            change = round(((value / prev_value) - 1.0) * 100, 4)
        rows.append({
            "period_month": period,
            "index_value": round(value, 4),
            "monthly_change_pct": change,
            "is_final": True,
        })
        prev_value = value
    return rows


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            series_code = (qs.get("series", ["CPI_TR_GENERAL"])[0]).upper()

            if series_code not in SERIES_MAP:
                self._respond(400, {
                    "ok": False,
                    "error": f"Bilinmeyen series: {series_code}. Geçerli: {list(SERIES_MAP)}",
                })
                return

            evds_series = SERIES_MAP[series_code]

            api_key = (os.environ.get("EVDS_API_KEY") or "").strip()
            if not api_key:
                self._respond(500, {
                    "ok": False,
                    "error": "EVDS_API_KEY env var eksik veya boş",
                    "fix": "Vercel Project Settings → Environment Variables → EVDS_API_KEY ekle. "
                           "TCMB EVDS portal (https://evds2.tcmb.gov.tr) → Profil → API anahtarı. "
                           "Ekledikten sonra Vercel'de redeploy gerekli.",
                })
                return

            # Sanity: çoğu API key uzunluğu ≥ 24
            if len(api_key) < 16:
                self._respond(500, {
                    "ok": False,
                    "error": f"EVDS_API_KEY anlamsız kısa (len={len(api_key)})",
                    "hint": "Çoğu EVDS key 24+ karakterdir. Vercel env var değerini yeniden kontrol et.",
                })
                return

            # Debug mode: raw EVDS yanıtını döndür (parse etmeden)
            debug = qs.get("debug", ["0"])[0] == "1"

            today = date.today()
            start = qs.get("start", ["2010-01"])[0]
            end = qs.get("end", [f"{today.year:04d}-{today.month:02d}"])[0]

            # Format validasyonu
            try:
                datetime.strptime(start, "%Y-%m")
                datetime.strptime(end, "%Y-%m")
            except ValueError:
                self._respond(400, {
                    "ok": False,
                    "error": "start/end YYYY-MM formatında olmalı",
                })
                return

            if debug:
                # Raw EVDS yanıtını döndür (parse etmeden) — diagnostic için
                try:
                    data = fetch_evds(evds_series, start, end, api_key)
                    self._respond(200, {
                        "ok": True,
                        "debug": True,
                        "evds_raw_keys": list(data.keys()) if isinstance(data, dict) else None,
                        "evds_items_count": len(data.get("items", [])) if isinstance(data, dict) else 0,
                        "evds_items_sample": data.get("items", [])[:3] if isinstance(data, dict) else None,
                        "api_key_len": len(api_key),
                        "api_key_first6": api_key[:6] + "***",
                    })
                except Exception as e:
                    self._respond(500, {
                        "ok": False,
                        "debug": True,
                        "stage": "fetch_evds_debug",
                        "error": str(e),
                        "api_key_len": len(api_key),
                        "api_key_first6": api_key[:6] + "***",
                    })
                return

            data = fetch_evds(evds_series, start, end, api_key)
            evds_field = evds_series.replace(".", "_")
            rows = build_rows(data, evds_field)

            self._respond(200, {
                "ok": True,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "source": "TCMB_EVDS",
                "series_code": series_code,
                "evds_series": evds_series,
                "window": {"start": start, "end": end},
                "fetched_periods": len(rows),
                "rows": rows,
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
        # 24 saat cache: TÜFE aylık veri
        self.send_header("Cache-Control", "s-maxage=86400, stale-while-revalidate=172800")
        self.end_headers()
        self.wfile.write(payload.encode("utf-8"))
