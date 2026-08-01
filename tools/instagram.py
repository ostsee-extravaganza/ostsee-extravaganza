#!/usr/bin/env python3
"""
Pull media from an Instagram Creator/Business account into photos/.

Usage
-----
    IG_TOKEN=... python3 tools/instagram.py            # sync new media
    IG_TOKEN=... python3 tools/instagram.py --check    # token status only, no writes
    IG_TOKEN=... python3 tools/instagram.py --refresh  # print a renewed token

Why it downloads instead of hotlinking
--------------------------------------
Instagram's media URLs are signed and expire. Linking to them means the gallery
quietly rots. Downloading means the photos are ours permanently, they work
offline through the service worker, and they survive the account being deleted.

What it does
------------
* reads every item from /me/media, following pagination
* unpacks carousels into their individual children
* files each item under photos/<date-it-was-posted>/ so tools/fotos.py maps it
  onto the right trip day
* records the Instagram id of everything it has seen in data/instagram.json, so
  re-running only fetches what is new
* keeps captions and permalinks in that same file; tools/fotos.py picks them up
  when it rebuilds data/photos.json

This talks to the *Instagram API with Instagram Login*. The old Basic Display
API was shut down in December 2024, and a personal account will not work — the
account has to be Creator or Business.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
STATE = ROOT / "data" / "instagram.json"

BASE = os.environ.get("IG_API_BASE", "https://graph.instagram.com")
TOKEN = os.environ.get("IG_TOKEN", "").strip()

FIELDS = (
    "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,"
    "children{id,media_type,media_url,thumbnail_url}"
)
MAX_VIDEO_MB = 40
UA = {"User-Agent": "OstseeExtravaganza/1.0 (personal trip site)"}


def die(msg, code=1):
    print(f"\n  {msg}\n", file=sys.stderr)
    sys.exit(code)


def api(path, **params):
    params["access_token"] = TOKEN
    url = f"{BASE}/{path.lstrip('/')}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", {})
            except json.JSONDecodeError:
                err = {"message": body[:300]}
            if e.code in (400, 401, 403):
                die(
                    "Instagram rejected the request:\n"
                    f"    {err.get('message', body[:200])}\n\n"
                    "  Usually this means the token has expired or the account is not\n"
                    "  a Creator/Business account. Re-run the OAuth step from\n"
                    "  docs/INSTAGRAM.md and update the IG_TOKEN secret."
                )
            if attempt == 3:
                die(f"Instagram kept failing ({e.code}): {err.get('message', '')}")
            time.sleep(3 * (attempt + 1))
        except urllib.error.URLError as e:
            if attempt == 3:
                die(f"Could not reach Instagram: {e.reason}")
            time.sleep(3 * (attempt + 1))


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print("  ! data/instagram.json was unreadable; starting fresh")
    return {"note": "", "lastSync": None, "seen": [], "items": {}}


def save_state(state):
    state["note"] = (
        "Written by tools/instagram.py. 'seen' holds Instagram media ids already "
        "downloaded so re-runs only fetch what is new; 'items' maps a filename in "
        "photos/ to its caption and permalink, which tools/fotos.py folds into "
        "data/photos.json."
    )
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 16):
            f.write(chunk)
    return dest.stat().st_size


def each_media():
    """Every media item, newest first, following pagination."""
    page = api("me/media", fields=FIELDS, limit=50)
    while True:
        yield from page.get("data", [])
        nxt = page.get("paging", {}).get("next")
        if not nxt:
            return
        # the cursor URL already carries the token and fields
        req = urllib.request.Request(nxt, headers=UA)
        with urllib.request.urlopen(req, timeout=45) as r:
            page = json.load(r)
        time.sleep(0.4)


def check():
    me = api("me", fields="id,username,account_type,media_count")
    print(f"  account      : @{me.get('username')} ({me.get('account_type')})")
    print(f"  media on IG  : {me.get('media_count')}")
    state = load_state()
    print(f"  already here : {len(state.get('seen', []))}")
    print(f"  last sync    : {state.get('lastSync') or 'never'}")
    if me.get("account_type") not in ("BUSINESS", "MEDIA_CREATOR", "CREATOR"):
        print(
            "\n  ! This does not look like a Creator/Business account. The API will\n"
            "    refuse most requests until it is converted."
        )
    return me


def refresh():
    """Long-lived tokens last 60 days and can be renewed once they are a day old."""
    url = (
        f"{BASE}/refresh_access_token?"
        + urllib.parse.urlencode({"grant_type": "ig_refresh_token", "access_token": TOKEN})
    )
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45) as r:
        d = json.load(r)
    days = round(d.get("expires_in", 0) / 86400)
    print("\n  A renewed token is below. Paste it into the IG_TOKEN repository secret.")
    print(f"  It is valid for about {days} days.\n")
    print(d["access_token"])
    print()


def sync():
    me = check()
    state = load_state()
    seen = set(state.get("seen", []))
    items = state.get("items", {})
    added = 0

    print(f"\n  scanning @{me.get('username')} …")
    for m in each_media():
        mid = m["id"]
        if mid in seen:
            continue
        ts = m.get("timestamp", "")
        try:
            day = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().date().isoformat()
        except ValueError:
            day = datetime.now(timezone.utc).date().isoformat()

        caption = (m.get("caption") or "").strip()
        permalink = m.get("permalink", "")

        # a carousel is downloaded as its individual children
        parts = m.get("children", {}).get("data") if m.get("media_type") == "CAROUSEL_ALBUM" else None
        parts = parts or [m]

        for n, part in enumerate(parts):
            kind = part.get("media_type", "IMAGE")
            url = part.get("media_url")
            if not url:
                continue
            ext = ".mp4" if kind == "VIDEO" else ".jpg"
            suffix = f"-{n + 1}" if len(parts) > 1 else ""
            name = f"ig-{re.sub(r'[^0-9A-Za-z]', '', mid)[-12:]}{suffix}{ext}"
            dest = PHOTOS / day / name
            if dest.exists():
                continue
            try:
                size = download(url, dest)
            except Exception as err:                       # noqa: BLE001
                print(f"    ! {name}: {err}")
                continue
            mb = size / 1048576
            if kind == "VIDEO" and mb > MAX_VIDEO_MB:
                dest.unlink()
                print(f"    ! {name} is {mb:.0f} MB — skipped, compress and add it by hand")
                continue
            items[f"{day}/{name}"] = {
                "caption": caption if n == 0 else "",
                "permalink": permalink,
                "timestamp": ts,
                "mediaId": mid,
            }
            added += 1
            print(f"    + {day}/{name}  {mb:.1f} MB")

        seen.add(mid)
        time.sleep(0.2)

    state["seen"] = sorted(seen)
    state["items"] = items
    state["lastSync"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    state["username"] = me.get("username")
    save_state(state)

    print(f"\n  {added} new file(s). data/instagram.json updated.")
    if added:
        print("  Now run: python3 tools/fotos.py")
    return added


if __name__ == "__main__":
    if not TOKEN:
        die("IG_TOKEN is not set. See docs/INSTAGRAM.md.")
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--check":
        check()
    elif arg == "--refresh":
        refresh()
    else:
        sync()
