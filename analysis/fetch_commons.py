"""Fetch the selected Wikimedia Commons photos and write their credits.

Input:  analysis/photos.select.json — the curated list: which Commons file
        is used for what (venue of an event, a driver, the finale), with a
        caption and a focus point for cropping.
Output: public/assets/photos/<id>.jpg   resized copies (Commons thumbnails)
        src/data/photos.json            manifest the video reads (credits included)
        CREDITS.md                      human-readable credits

Author, licence and source are always taken from the file's Commons
metadata, never typed in by hand (an `author` override exists only to shorten
a long attribution string, and is listed in the credits next to the original).
Files whose licence isn't CC0, public domain, CC BY or CC BY-SA are refused.

Usage: analysis/.venv/bin/python analysis/fetch_commons.py
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import commons  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SELECT = ROOT / "analysis" / "photos.select.json"
OUT = ROOT / "public" / "assets" / "photos"
MANIFEST = ROOT / "src" / "data" / "photos.json"
CREDITS = ROOT / "CREDITS.md"
WIDTH = {"venue": 1920, "finale": 1920, "driver": 1280, "winner": 1280}
# Stored size: backdrops are shown softened, driver photos at most ~500 px wide.
KEEP = {"venue": 1600, "finale": 1600, "driver": 960, "winner": 960}
CHANGES = {
    "venue": "resized; shown cropped, softened and colour-graded as a darkened backdrop",
    "finale": "resized; shown cropped, softened and colour-graded as a darkened backdrop",
    "driver": "resized; shown cropped",
    "winner": "resized; shown cropped",
}


def main() -> None:
    sel = json.loads(SELECT.read_text())
    ids = [s["id"] for s in sel]
    if len(ids) != len(set(ids)):
        sys.exit("duplicate ids in selection")

    meta: dict[str, dict] = {}
    for role, width in WIDTH.items():
        titles = [s["title"] for s in sel if s["role"] == role]
        for d in commons.info(titles, width) if titles else []:
            meta[d["title"]] = d

    photos, problems = [], []
    for s in sel:
        d = meta.get(s["title"])
        if not d or d.get("missing"):
            problems.append(f"{s['id']}: {s['title']} not found on Commons")
            continue
        fam = commons.licence_ok(d)
        if not fam:
            problems.append(f"{s['id']}: licence '{d['license']}' not accepted")
            continue
        artist = d["artist"] or d["credit"]
        if not artist:
            problems.append(f"{s['id']}: no author in metadata")
            continue
        dest = OUT / f"{s['id']}.jpg"
        if not dest.exists():
            raw = commons._get(d["thumb"]).content
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            OUT.mkdir(parents=True, exist_ok=True)
            img.save(dest, "JPEG", quality=88, optimize=True, progressive=True)
            print(f"  ↓ {dest.name}  {img.size[0]}×{img.size[1]}")
        img = Image.open(dest)
        if img.size[0] > KEEP[s["role"]]:
            img = img.convert("RGB")
            img.thumbnail((KEEP[s["role"]], 10_000), Image.LANCZOS)
            img.save(dest, "JPEG", quality=86, optimize=True, progressive=True)
        w, h = Image.open(dest).size
        photos.append({
            "id": s["id"], "role": s["role"], "key": s["key"], "file": dest.name, "width": w, "height": h,
            "caption": s["caption"], "author": s.get("author") or artist, "authorFull": artist,
            "license": d["license"], "licenseFamily": fam, "licenseUrl": d["license_url"],
            "page": d["page"], "title": d["title"], "date": d["date"], "restrictions": d["restrictions"],
            "focus": s.get("focus", [0.5, 0.5]), "changes": CHANGES[s["role"]],
            # What Commons says the photo shows: the source of every caption.
            "description": d["description"][:300], "categories": d["categories"],
        })

    if problems:
        sys.exit("refused:\n  " + "\n  ".join(problems))

    MANIFEST.write_text(json.dumps({
        "source": "Wikimedia Commons",
        "policy": "CC0, public domain, CC BY or CC BY-SA only; author and licence from Commons metadata",
        "photos": photos,
    }, indent=1, ensure_ascii=False) + "\n")
    write_credits(photos)
    sa = sum(1 for p in photos if p["licenseFamily"] == "CC BY-SA")
    print(f"{len(photos)} photos · {sa} CC BY-SA → {MANIFEST.relative_to(ROOT)}, {CREDITS.relative_to(ROOT)}")


def write_credits(photos: list[dict]) -> None:
    role_name = {"venue": "Backdrop", "finale": "Backdrop (finale)", "driver": "Driver", "winner": "Winner card"}
    lines = [
        "# Credits",
        "",
        "## Photographs",
        "",
        "All photographs come from [Wikimedia Commons](https://commons.wikimedia.org) under free licences. Each one is",
        "credited on screen while it is shown, and again on the closing card. Changes made: every photo is resized;",
        "backdrops are also cropped, softened and colour-graded, and driver photos are cropped.",
        "",
        "Because some photographs are licensed CC BY-SA, the video as a whole is shared under",
        "[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The code in this repository is not affected.",
        "",
        "| Used as | Subject | Author | Licence | Source |",
        "|---|---|---|---|---|",
    ]
    for p in photos:
        author = p["authorFull"] if p["author"] == p["authorFull"] else f"{p['authorFull']} (shown as “{p['author']}”)"
        lines.append(f"| {role_name[p['role']]} · `{p['id']}` | {p['caption']} | {author} | "
                     f"[{p['license']}]({p['licenseUrl']}) | [{p['title'].removeprefix('File:')}]({p['page']}) |")
    lines += [
        "",
        "Subjects are identified from each file's Commons title, description and categories.",
        "Some photos show identifiable people; Commons notes that their personality rights may restrict commercial use.",
        "",
        "## Logos",
        "",
        "The F1, Ferrari, McLaren, Red Bull, Aston Martin, Audi and Cadillac marks are drawn from",
        "[simple-icons](https://simpleicons.org) 16.36.0 (path data CC0). The marks are trademarks of their owners and appear",
        "only to identify the teams.",
        "",
        "## Fonts",
        "",
        "Titillium Web, JetBrains Mono and Big Shoulders Display (SIL Open Font License), via Fontsource.",
        "",
        "## Disclaimer",
        "",
        "Unofficial fan work. Not affiliated with or endorsed by Formula 1, the FIA or any team.",
        "",
    ]
    CREDITS.write_text("\n".join(lines))


if __name__ == "__main__":
    main()
