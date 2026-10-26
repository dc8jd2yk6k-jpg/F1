"""Minimal Wikimedia Commons client: polite, cached, licence-aware.

Commons rate-limits anonymous API use hard, so every call goes through one
paced session (a descriptive User-Agent, a minimum gap between requests,
Retry-After honoured) and API responses are cached on disk.

Licence policy: only files Commons marks as CC0, public domain, CC BY or
CC BY-SA are accepted. Anything else (or anything unclear) is rejected.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import time
from pathlib import Path

import requests

API = "https://commons.wikimedia.org/w/api.php"
UA = "F1-leaderboard-MV/1.0 (unofficial fan video; github.com/dc8jd2yk6k-jpg/F1) requests"
CACHE = Path(__file__).resolve().parent / "cache" / "commons"
MIN_GAP = 4.0

_session = requests.Session()
_session.headers["User-Agent"] = UA
_last = 0.0

EXT_FIELDS = "|".join([
    "LicenseShortName", "LicenseUrl", "License", "Artist", "Credit", "DateTimeOriginal",
    "ImageDescription", "ObjectName", "AttributionRequired", "Restrictions", "Copyrighted",
])


def _get(url: str, params: dict | None = None, stream: bool = False) -> requests.Response:
    global _last
    for attempt in range(8):
        wait = _last + MIN_GAP - time.time()
        if wait > 0:
            time.sleep(wait)
        _last = time.time()
        r = _session.get(url, params=params, timeout=60, stream=stream)
        if r.status_code == 429 or r.status_code >= 500:
            delay = float(r.headers.get("retry-after", 0) or 0) or 10 * (attempt + 1)
            print(f"  · {r.status_code}, waiting {delay:.0f}s")
            time.sleep(delay + 1)
            continue
        r.raise_for_status()
        return r
    raise RuntimeError(f"giving up on {url}")


def api(params: dict) -> dict:
    params = {"format": "json", "formatversion": "2", **params}
    key = hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    hit = CACHE / f"{key}.json"
    if hit.exists():
        return json.loads(hit.read_text())
    for attempt in range(6):
        data = _get(API, params).json()
        if data.get("error", {}).get("code") in ("cirrussearch-too-busy-error", "maxlag", "ratelimited"):
            print(f"  · {data['error']['code']}, retrying")
            time.sleep(20 * (attempt + 1))
            continue
        break
    if "error" in data:
        raise RuntimeError(data["error"])
    CACHE.mkdir(parents=True, exist_ok=True)
    hit.write_text(json.dumps(data))
    return data


def _pages(data: dict) -> list[dict]:
    return data.get("query", {}).get("pages", [])


def search(q: str, limit: int = 30, thumb: int = 330) -> list[dict]:
    """File search with image info and metadata in one call."""
    data = api({
        "action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": limit,
        "gsrsearch": f"{q} filetype:bitmap", "prop": "imageinfo|categories", "cllimit": "max",
        "iiprop": "url|size|mime|extmetadata", "iiextmetadatafilter": EXT_FIELDS, "iiurlwidth": thumb,
    })
    pages = sorted(_pages(data), key=lambda p: p.get("index", 0))
    return [describe(p) for p in pages if p.get("imageinfo")]


def category(cat: str, files: bool = True, limit: int = 200, thumb: int = 330) -> list[dict]:
    """Files (with metadata) or subcategories (titles) of a category."""
    title = cat if cat.startswith("Category:") else f"Category:{cat}"
    if not files:
        data = api({"action": "query", "list": "categorymembers", "cmtitle": title, "cmtype": "subcat", "cmlimit": limit})
        return [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
    data = api({
        "action": "query", "generator": "categorymembers", "gcmtitle": title, "gcmtype": "file", "gcmlimit": limit,
        "prop": "imageinfo|categories", "cllimit": "max", "iiprop": "url|size|mime|extmetadata",
        "iiextmetadatafilter": EXT_FIELDS, "iiurlwidth": thumb,
    })
    return [describe(p) for p in _pages(data) if p.get("imageinfo")]


def info(titles: list[str], width: int) -> list[dict]:
    """Image info and metadata for exact file titles, with a thumbnail at `width`."""
    out = []
    for i in range(0, len(titles), 20):
        data = api({
            "action": "query", "titles": "|".join(titles[i:i + 20]), "prop": "imageinfo|categories",
            "cllimit": "max", "iiprop": "url|size|mime|extmetadata|sha1", "iiextmetadatafilter": EXT_FIELDS,
            "iiurlwidth": width,
        })
        out += [describe(p) for p in _pages(data)]
    return out


def strip(s: str | None) -> str:
    s = re.sub(r"<[^>]+>", "", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def describe(p: dict) -> dict:
    if p.get("missing") or not p.get("imageinfo"):
        return {"title": p.get("title"), "missing": True}
    ii = p["imageinfo"][0]
    md = {k: v.get("value") for k, v in (ii.get("extmetadata") or {}).items()}
    return {
        "title": p["title"],
        "page": ii.get("descriptionurl"),
        "url": ii.get("url"),
        "thumb": ii.get("thumburl"),
        "width": ii.get("width"),
        "height": ii.get("height"),
        "mime": ii.get("mime"),
        "sha1": ii.get("sha1"),
        "license": strip(md.get("LicenseShortName")),
        "license_url": strip(md.get("LicenseUrl")),
        "license_code": strip(md.get("License")),
        "artist": strip(md.get("Artist")),
        "credit": strip(md.get("Credit")),
        "date": strip(md.get("DateTimeOriginal")),
        "description": strip(md.get("ImageDescription"))[:400],
        "restrictions": strip(md.get("Restrictions")),
        "categories": [c["title"].removeprefix("Category:") for c in p.get("categories", [])],
    }


_ACCEPT = [
    (re.compile(r"^cc0\b|^cc0-1\.0$", re.I), "CC0"),
    (re.compile(r"^(public domain|pd\b|pd-)", re.I), "PD"),
    (re.compile(r"^cc[ -]by[ -]sa[ -]?\d", re.I), "CC BY-SA"),
    (re.compile(r"^cc[ -]by[ -]?\d", re.I), "CC BY"),
]


def licence_ok(d: dict) -> str | None:
    """The accepted licence family, or None. NC/ND or unknown → rejected."""
    name = d.get("license") or ""
    if re.search(r"\bnc\b|\bnd\b|non-?commercial|no ?deriv|fair use|non-free", name, re.I):
        return None
    for rx, fam in _ACCEPT:
        if rx.search(name):
            return fam
    return None


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = _get(url)
    dest.write_bytes(r.content)
    return dest
