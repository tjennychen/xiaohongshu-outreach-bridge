#!/usr/bin/env python3
"""
XHS Share Link Generator
Converts xiaohongshu.com/discovery/item/{id} URLs to xhslink.com short links.

Setup: paste your cookies from the mitmproxy capture below.
"""

import requests
import json
import time
import re
import sys
from urllib.parse import quote

# ── PASTE YOUR COOKIES HERE ──────────────────────────────────────────────────
# These come from the mitmproxy capture. Re-capture when they expire (weeks).
COOKIES = {
    "a1":          "19d20462685vcy5islu6pd4tqkyxbovbtxvluu1yx10000618177",
    "webId":       "718b3139ac1023651f12faec05cfbb32",
    "websectiga":  "f47eda31ec99545da40c2f731f0630efd2b0959e1dd10d5fedac3dce0bd1e04d",
    "gid":         "yjfJ84K44W9JyjfJ84KJKC7yY2hSv23M17KUhvCf49ATv1y8CDlhD7888KyYyWW8W000qqdd",
    "loadts":      "1774362997093",
    "xsecappid":   "risk-h5",
}

HEADERS = {
    "user-agent":    "discover/9.19.4 (iPhone; iOS 18.5; Scale/3.00) Resolution/1179*2556 Version/9.19.4 Build/9194802 Device/(Apple Inc.;iPhone15,4) NetType/WiFi",
    "content-type":  "application/x-www-form-urlencoded; charset=utf-8",
    "referer":       "https://app.xhs.cn/",
    "accept":        "*/*",
    "accept-encoding": "gzip",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)
SESSION.cookies.update(COOKIES)


def extract_note_id(url):
    m = re.search(r'/(?:discovery/item|explore)/([a-f0-9]+)', url)
    return m.group(1) if m else None


def get_share_link(note_id):
    origin_url = (
        f"https://www.xiaohongshu.com/discovery/item/{note_id}"
        f"?app_platform=ios&app_version=9.19.4&share_from_user_hidden=true"
        f"&xsec_source=app_share&type=normal&xhsshare=CopyLink"
        f"&apptime={int(time.time())}"
    )
    body = {
        "id": note_id,
        "origin_url": origin_url,
        "type": "note",
    }
    try:
        r = SESSION.post(
            "https://www.xiaohongshu.com/api/sns/v1/share/code",
            data=body,
            timeout=10,
        )
        data = r.json()
        # look for the xhslink in the response
        code = data.get("data", {}).get("code") or data.get("code")
        if code:
            return f"http://xhslink.com/o/{code}"
        # fallback: search raw response for xhslink
        m = re.search(r'http://xhslink\.com/o/[\w]+', r.text)
        if m:
            return m.group(0)
        print(f"  [warn] unexpected response: {r.text[:200]}")
        return None
    except Exception as e:
        print(f"  [error] {e}")
        return None


def main():
    # ── INPUT: list of discovery URLs, one per line ───────────────────────────
    urls = [
        "https://www.xiaohongshu.com/discovery/item/69a82ed000000000220206e3",
        # add more here, or pass a file as argument
    ]

    # if a file is passed as argument, read URLs from it
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            urls = [line.strip() for line in f if line.strip()]

    results = []
    for i, url in enumerate(urls, 1):
        note_id = extract_note_id(url)
        if not note_id:
            print(f"[{i}/{len(urls)}] skipping (can't parse): {url}")
            continue

        print(f"[{i}/{len(urls)}] {note_id} ...", end=" ", flush=True)
        link = get_share_link(note_id)
        if link:
            print(link)
            results.append({"source": url, "share_link": link})
        else:
            print("FAILED")
            results.append({"source": url, "share_link": None})

        if i < len(urls):
            time.sleep(1)  # be polite

    # save results
    with open("share_links.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    ok = sum(1 for r in results if r["share_link"])
    print(f"\nDone: {ok}/{len(results)} succeeded → share_links.json")


if __name__ == "__main__":
    main()
