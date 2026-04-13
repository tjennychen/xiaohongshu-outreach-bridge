"""
XHS Share Link Automator
------------------------
Prerequisites:
  - mitmproxy running: mitmdump --listen-port 8080 -s capture_share_links.py
  - iPhone Mirroring open and connected
  - Safari open on mirrored iPhone

Usage:
  python3 xhs_auto.py urls.txt

urls.txt: one discovery URL per line, e.g.:
  https://www.xiaohongshu.com/discovery/item/69a82ed000000000220206e3
"""

import subprocess
import sys
import time
import re
import os
from pathlib import Path

# ── COORDINATES (calibrated) ─────────────────────────────────────────────────
SAFARI_URL_BAR   = (1244, 848)   # Safari address bar (bottom)
OPEN_IN_APP      = (1252, 757)   # Red "Open in App" button on XHS web page
SHARE_BUTTON     = (1377, 343)   # XHS share button (top right of post)
COPY_LINK        = (1177, 859)   # Copy Link in share sheet
BACK_TO_SAFARI   = (1112, 885)   # Safari browser back button (bottom left)

CLICLICK = '/opt/homebrew/bin/cliclick'
CAPTURE_CSV = Path('/Users/jenny/Sites/xiaohongshu/share_links_captured.csv')

def activate_mirroring():
    """Bring iPhone Mirroring to focus."""
    subprocess.run(['osascript', '-e', 'tell application "iPhone Mirroring" to activate'], capture_output=True)
    time.sleep(0.5)

def click(x, y, delay=0.1):
    activate_mirroring()
    subprocess.run([CLICLICK, f'c:{x},{y}'], capture_output=True)
    time.sleep(delay)

def type_text(text):
    activate_mirroring()
    subprocess.run([CLICLICK, f't:{text}'], capture_output=True)

def press_enter():
    subprocess.run([CLICLICK, 'kp:return'], capture_output=True)

def select_all():
    subprocess.run([CLICLICK, 'kd:cmd', 'kp:a', 'ku:cmd'], capture_output=True)

def count_captured():
    if not CAPTURE_CSV.exists():
        return 0
    with open(CAPTURE_CSV) as f:
        return sum(1 for line in f) - 1  # subtract header

def open_url_in_xhs(url):
    """Navigate Safari to URL → click Open in App → XHS opens."""
    # triple-click address bar to select all, then type new URL
    subprocess.run([CLICLICK, f'tc:{SAFARI_URL_BAR[0]},{SAFARI_URL_BAR[1]}'], capture_output=True)
    time.sleep(0.5)
    type_text(url)
    time.sleep(0.3)
    press_enter()
    time.sleep(3)           # wait for web page to load
    click(*OPEN_IN_APP)     # tap "Open in App"

def do_share():
    """Click share button, wait for sheet, click Copy Link."""
    time.sleep(4)           # wait for XHS post to load
    click(*SHARE_BUTTON)
    time.sleep(2)           # wait for share sheet
    click(*COPY_LINK)
    time.sleep(1.5)         # wait for mitmproxy to capture

def return_to_safari():
    """Go back to Safari via browser back button."""
    click(*BACK_TO_SAFARI)
    time.sleep(1.5)

def extract_note_id(url):
    m = re.search(r'/(?:discovery/item|explore)/([a-f0-9]+)', url)
    return m.group(1) if m else None

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 xhs_auto.py urls.txt")
        print("urls.txt: one discovery URL per line")
        sys.exit(1)

    with open(sys.argv[1]) as f:
        urls = [l.strip() for l in f if l.strip() and 'xiaohongshu' in l]

    print(f"Loaded {len(urls)} URLs")
    print(f"Starting in 5 seconds — make sure iPhone Mirroring is focused...\n")
    time.sleep(5)

    already_before = count_captured()

    for i, url in enumerate(urls, 1):
        note_id = extract_note_id(url)
        print(f"[{i}/{len(urls)}] {note_id} ...", end=" ", flush=True)

        captured_before = count_captured()
        open_url_in_xhs(url)
        do_share()

        # verify capture happened
        captured_after = count_captured()
        if captured_after > captured_before:
            print("captured")
        else:
            print("MISSED — retrying share")
            click(*SHARE_BUTTON)
            time.sleep(2)
            click(*COPY_LINK)
            time.sleep(1.5)
            if count_captured() > captured_before:
                print(f"  → captured on retry")
            else:
                print(f"  → FAILED, continuing")

        return_to_safari()
        time.sleep(0.5)

    total = count_captured() - already_before
    print(f"\nDone. Captured {total}/{len(urls)} links → {CAPTURE_CSV}")

if __name__ == '__main__':
    main()
