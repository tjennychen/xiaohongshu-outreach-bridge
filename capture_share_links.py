"""
mitmproxy script: captures xhslink.com URLs as they flow through the proxy.

Run with:
    mitmdump --listen-port 8080 -s capture_share_links.py

Then on iPhone: open XHS notes and tap Share → Copy Link for each.
All captured links are saved to share_links_captured.csv automatically.
"""

import csv
import gzip
import json
import re
import time
from pathlib import Path

OUTPUT = Path("share_links_captured.csv")
captured = {}

def _write_row(note_id: str, share_url: str, source_url: str = ""):
    already = note_id in captured
    captured[note_id] = share_url
    mode = "a" if OUTPUT.exists() else "w"
    with open(OUTPUT, mode, newline="") as f:
        w = csv.writer(f)
        if mode == "w":
            w.writerow(["note_id", "share_url", "source_url", "captured_at"])
        if not already:
            w.writerow([note_id, share_url, source_url, time.strftime("%Y-%m-%d %H:%M:%S")])
    if not already:
        print(f"  ✓ [{len(captured)}] {note_id} → {share_url}")


def response(flow):
    if "xiaohongshu.com" not in flow.request.pretty_host:
        return
    if "/api/sns/v1/share/code" not in flow.request.path:
        return

    print(f"  [intercept] {flow.request.method} {flow.request.path[:100]}")
    print(f"  [status] {flow.response.status_code}")

    # extract note_id from POST body
    note_id = ""
    try:
        body = flow.request.get_text()
        m = re.search(r'(?:^|&)id=([a-f0-9]+)', body)
        if m:
            note_id = m.group(1)
            print(f"  [note_id] {note_id}")
    except Exception as e:
        print(f"  [body err] {e}")

    # decode response
    try:
        content = flow.response.content
        if flow.response.headers.get("content-encoding") == "gzip":
            content = gzip.decompress(content)
        print(f"  [response] {content[:300]}")
        data = json.loads(content)
        code = data.get("data", {}).get("code") or data.get("code")
        if code:
            share_url = f"http://xhslink.com/o/{code}"
            _write_row(note_id or code, share_url, flow.request.path[:80])
            return
    except Exception as e:
        print(f"  [resp err] {e}")

    # GET follow-up contains entireText with the xhslink URL
    if flow.request.method == "GET" and "entireText" in flow.request.path:
        try:
            import base64, urllib.parse
            full_url = flow.request.path
            code_m = re.search(r'code=([A-Za-z0-9]+)', full_url)
            et_m = re.search(r'entireText=([^&]+)', full_url)
            if code_m and et_m:
                code = code_m.group(1)
                b64 = urllib.parse.unquote(et_m.group(1))
                b64 = b64.replace('-', '+').replace('_', '/')
                b64 += '=' * (4 - len(b64) % 4)
                text = base64.b64decode(b64).decode('utf-8', errors='replace')
                print(f"  [decoded] {text[:200]}")
                url_m = re.search(r'http://xhslink\.com/o/\S+', text)
                if url_m:
                    share_url = url_m.group(0).rstrip('！!')
                    _write_row(note_id or code, share_url, full_url[:80])
        except Exception as e:
            print(f"  [get err] {e}")
