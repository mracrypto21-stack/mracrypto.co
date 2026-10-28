#!/usr/bin/env python3
"""Atjauno assets/latest-videos.json ar 3 jaunākajiem YouTube video (Shorts + parastie).

Avots: YouTube kanāla bezmaksas RSS plūsma (bez API atslēgas, bez kvotas).
Drošība: ja YouTube nav pieejams vai dati nederīgi, esošais JSON netiek mainīts
(lapa turpina rādīt pēdējos saglabātos video). Ieraksta failu tikai tad, ja saturs mainījies.
Tikai Python stdlib.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

CHANNEL_ID = "UCQ563hO-_ZVdneijaMiy9bw"  # youtube.com/@mracryptos
FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=" + CHANNEL_ID
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "latest-videos.json")
UA = "Mozilla/5.0 (compatible; mracrypto-video-updater/1.0)"
COUNT = 3
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "yt": "http://www.youtube.com/xml/schemas/2015",
}


def http(url, method="GET", timeout=20):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout)


def status(url, method="HEAD"):
    try:
        with http(url, method) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def fetch_feed():
    last = None
    for attempt in range(3):
        try:
            with http(FEED_URL) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("feed unavailable: %r" % (last,))


def clean_title(t):
    # noņem beigu hashtagus ("UZMINI NU? #real #fyp" -> "UZMINI NU?")
    c = re.sub(r"(\s+#[^\s#]+)+\s*$", "", t).strip()
    return c or t.strip()


def pick_thumb(vid, is_short):
    base = "https://i.ytimg.com/vi/%s/" % vid
    # Short: oar2 = tīrs vertikāls kadrs; parasts: maxres (bez melnajām joslām), citādi mqdefault (16:9)
    order = ["oar2.jpg", "maxresdefault.jpg"] if is_short else ["maxresdefault.jpg", "mqdefault.jpg"]
    for name in order:
        if status(base + name) == 200:
            return base + name
    return base + "hqdefault.jpg"


def embeddable(vid):
    code = status(
        "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=" + vid,
        "GET",
    )
    return code not in (401, 403, 404)


def main():
    root = ET.fromstring(fetch_feed())
    entries = []
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", namespaces=NS)
        title = e.findtext("a:title", namespaces=NS) or ""
        pub = e.findtext("a:published", namespaces=NS) or ""
        link_el = e.find("a:link", NS)
        link = (link_el.get("href") if link_el is not None else "") or ""
        if not (vid and re.fullmatch(r"[A-Za-z0-9_-]{11}", vid) and pub):
            continue
        entries.append({"id": vid, "title": title, "published": pub, "short": "/shorts/" in link})
    if not entries:
        raise RuntimeError("no entries in feed")
    entries.sort(key=lambda x: x["published"], reverse=True)

    videos = []
    for e in entries[:COUNT]:
        videos.append({
            "id": e["id"],
            "title": clean_title(e["title"]),
            "type": "short" if e["short"] else "video",
            "published": e["published"],
            "thumb": pick_thumb(e["id"], e["short"]),
            "embeddable": embeddable(e["id"]),
        })

    new = json.dumps({"videos": videos}, ensure_ascii=False, indent=2) + "\n"
    try:
        with open(OUT, encoding="utf-8") as f:
            old = f.read()
    except FileNotFoundError:
        old = ""
    if new == old:
        print("no change")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(new)
    print("updated:", ", ".join(v["id"] for v in videos))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        # YouTube īslaicīgi nav pieejams / nederīgi dati: neko nemaina, lapa rāda pēdējo saglabāto sarakstu
        print("WARNING: not updated (%s); keeping existing file" % exc)
        sys.exit(0)
