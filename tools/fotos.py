#!/usr/bin/env python3
"""
Build data/photos.json from whatever is sitting in photos/.

Usage
-----
    python3 tools/fotos.py

Drop files into a dated folder and run it:

    photos/2026-09-02/DSC_1234.jpg      -> grouped under Tag 3 · Zingst
    photos/planung/whatever.jpg         -> grouped under Planungsphase
    photos/2026-09-05/clip.mp4          -> shown inline as a video

What it does
------------
* resizes every photo to a 1600px web copy and a 480px thumbnail, in place
  under photos/<group>/web/ and photos/<group>/thumb/
* strips EXIF on the way out (the originals keep theirs)
* reads the EXIF capture time for ordering, and GPS if present
* maps each dated folder onto its trip day and base town from itinerary.json
* leaves videos alone apart from listing them — compress those yourself,
  720p and under ~20 MB, or the repo gets unpleasant

Re-runnable: existing derivatives are skipped unless the original is newer.
"""

import json
import os
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ExifTags
except ImportError:
    sys.exit("Pillow is needed:  python3 -m pip install --user Pillow")

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
OUT = ROOT / "data" / "photos.json"

WEB_W, THUMB_W, QUALITY = 1600, 480, 80
PHOTO_EXT = {".jpg", ".jpeg", ".png", ".heic", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm"}

TAG = {v: k for k, v in ExifTags.TAGS.items()}
GPSTAG = {v: k for k, v in ExifTags.GPSTAGS.items()}


def exif_bits(path):
    """(captured_iso, (lat, lon)) — either may be None."""
    try:
        with Image.open(path) as im:
            ex = im.getexif()
            if not ex:
                return None, None
            raw = ex.get(TAG.get("DateTimeOriginal")) or ex.get(TAG.get("DateTime"))
            when = None
            if raw and isinstance(raw, str):
                m = re.match(r"(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})", raw)
                if m:
                    y, mo, d, h, mi, s = m.groups()
                    when = f"{y}-{mo}-{d}T{h}:{mi}:{s}"

            coords = None
            gps = ex.get_ifd(0x8825) if hasattr(ex, "get_ifd") else None
            if gps:
                def dms(v):
                    return float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
                try:
                    lat = dms(gps[GPSTAG["GPSLatitude"]])
                    lon = dms(gps[GPSTAG["GPSLongitude"]])
                    if gps.get(GPSTAG["GPSLatitudeRef"]) == "S":
                        lat = -lat
                    if gps.get(GPSTAG["GPSLongitudeRef"]) == "W":
                        lon = -lon
                    coords = [round(lat, 6), round(lon, 6)]
                except (KeyError, TypeError, ZeroDivisionError):
                    coords = None
            return when, coords
    except Exception as err:                       # noqa: BLE001 — never fail the whole run
        print(f"    ! could not read EXIF from {path.name}: {err}")
        return None, None


def derive(src, dest, width):
    """Resize src into dest at `width`, stripping metadata. Skips if fresh."""
    if dest.exists() and dest.stat().st_mtime >= src.stat().st_mtime:
        with Image.open(dest) as im:
            return im.size
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = im.convert("RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)
        return im.size


def trip_days():
    """date -> (day number, title, base town) from the itinerary."""
    try:
        it = json.loads((ROOT / "data" / "itinerary.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    return {d["date"]: (d["day"], d["title"], d["base"]) for d in it["days"]}


def reference_group():
    """The Commons photography the site already ships, as a first group."""
    try:
        cr = json.loads((ROOT / "data" / "credits.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    items = []
    for c in cr["images"]:
        if "-sm." in c["file"]:
            continue
        items.append({
            "type": "photo",
            "web": c["file"],
            "thumb": c["file"].replace(".jpg", "-sm.jpg"),
            "caption": c["caption"],
            "credit": c["author"],
            "license": c["license"],
            "source": c["source"],
        })
    if not items:
        return None
    return {
        "id": "referenz",
        "label": "Warum wir überhaupt fahren",
        "kind": "reference",
        "note": ("Not ours — placeholder photography from Wikimedia Commons, each under its own "
                 "licence. These are the pictures that made the trip look like a good idea. They "
                 "get replaced as we take our own."),
        "items": items,
    }


def main():
    PHOTOS.mkdir(exist_ok=True)
    days = trip_days()
    groups = []

    ref = reference_group()
    if ref:
        groups.append(ref)

    for folder in sorted(p for p in PHOTOS.iterdir() if p.is_dir()):
        if folder.name in {"web", "thumb"}:
            continue
        originals = sorted(
            f for f in folder.iterdir()
            if f.is_file() and f.suffix.lower() in PHOTO_EXT | VIDEO_EXT
        )
        if not originals:
            continue

        dated = re.fullmatch(r"\d{4}-\d{2}-\d{2}", folder.name)
        if dated and folder.name in days:
            n, title, base = days[folder.name]
            label = f"Tag {n} · {base}"
            note = title
        elif dated:
            label, note = folder.name, ""
        else:
            label = folder.name.replace("-", " ").replace("_", " ").title()
            note = ""

        print(f"  {folder.name}: {len(originals)} file(s)")
        items = []
        for src in originals:
            rel = folder.name
            if src.suffix.lower() in VIDEO_EXT:
                mb = src.stat().st_size / 1048576
                if mb > 25:
                    print(f"    ! {src.name} is {mb:.0f} MB — compress it before committing")
                items.append({
                    "type": "video",
                    "web": f"photos/{rel}/{src.name}",
                    "thumb": None,
                    "caption": "",
                    "sizeMB": round(mb, 1),
                })
                continue

            stem = src.stem
            web = folder / "web" / f"{stem}.jpg"
            thumb = folder / "thumb" / f"{stem}.jpg"
            try:
                w, h = derive(src, web, WEB_W)
                derive(src, thumb, THUMB_W)
            except Exception as err:               # noqa: BLE001
                print(f"    ! skipped {src.name}: {err}")
                continue
            when, coords = exif_bits(src)
            items.append({
                "type": "photo",
                "web": f"photos/{rel}/web/{stem}.jpg",
                "thumb": f"photos/{rel}/thumb/{stem}.jpg",
                "caption": "",
                "w": w, "h": h,
                "captured": when,
                "coords": coords,
            })

        items.sort(key=lambda i: (i.get("captured") or "", i["web"]))
        groups.append({
            "id": folder.name, "label": label, "kind": "trip" if dated else "planning",
            "date": folder.name if dated else None, "note": note, "items": items,
        })

    doc = {
        "note": ("Generated by tools/fotos.py — do not hand-edit the item lists; captions are the "
                 "exception and survive nothing, so add those here and keep a copy. Drop files "
                 "into photos/YYYY-MM-DD/ and re-run."),
        "generatedFrom": "photos/",
        "groups": groups,
    }
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    total = sum(len(g["items"]) for g in groups)
    print(f"\n{OUT.relative_to(ROOT)}: {len(groups)} group(s), {total} item(s)")


if __name__ == "__main__":
    main()
