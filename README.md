# XHS Outreach Bridge

Bridges [Qian Gua](https://qian-gua.com) (千瓜), a Chinese influencer analytics platform, with [Xiaohongshu](https://xiaohongshu.com) (小红书 / Little Red Book) for influencer outreach campaigns. Automates the full pipeline from influencer discovery through profile screening to personalized comment outreach, while evading XHS anti-bot detection.

## Tech Stack

- **Node.js + Playwright** for CDP-based browser automation
- **Python + mitmproxy** for intercepting and converting XHS share links
- **iPhone Mirroring + cliclick** for physical device automation (share link capture)
- **SQLite** for tracking outreach state (profiles, posts, comments)

## Architecture

```
Qian Gua (千瓜)              Data Bridge              Xiaohongshu (小红书)
 brand search       -->   target filtering     -->    profile navigation
 influencer list    -->   tier classification   -->    bio extraction
 engagement data    -->   SQLite persistence    -->    comment posting
                                                -->    rate limit monitoring
```

**1. Discovery (Qian Gua)**
Connects to a running Chrome session via CDP port 9222. Navigates Qian Gua's brand analytics pages to pull influencer lists with engagement metrics, tier classifications (素人 / 初级达人 / 腰部达人), and sponsorship history.

**2. Filtering & Screening**
Automatically classifies influencers using keyword matching against their bios. Filters out brand accounts, store fronts, news outlets, and fan clubs using commercial keyword detection. Prioritizes real users via personal keyword signals (MBTI types, zodiac signs, lifestyle markers).

**3. Share Link Conversion**
Two approaches for converting discovery URLs to shareable xhslink.com links:
- **mitmproxy intercept**: runs `mitmdump` as a local proxy, captures share codes from XHS API responses as they flow through
- **iPhone Mirroring automation**: drives the physical XHS app via cliclick coordinate-based clicks (Safari URL bar, "Open in App" button, share sheet, copy link)

**4. XHS Outreach**
Connects to Chrome via CDP, navigates to each influencer's XHS profile, opens their latest post, and leaves a personalized comment. Uses `keyboard.type()` with per-character delay (80ms) to simulate human typing speed.

## Key Technical Challenges

**Anti-bot evasion.** XHS aggressively detects automation. The system monitors for captcha triggers, rate limit warnings, and account anomaly signals (验证, 滑块, 操作频繁, 账号异常). Backs off immediately when any red flag appears.

**Typing simulation.** XHS comment boxes use `contenteditable` divs, not standard form inputs. Direct value injection gets detected. The workaround: click the placeholder overlay with `force: true` to activate the comment box, then use Playwright's `keyboard.type()` with realistic inter-keystroke delays.

**Behavioral pacing.** Each action includes human-plausible wait times between steps: page loads, scroll pauses, share sheet animations. The system runs one tab at a time and spaces outreach across sessions to stay under detection thresholds.

**CDP session reuse.** Instead of launching a headless browser (instant detection), all automation connects to an already running Chrome instance where XHS and Qian Gua are logged in via real user sessions.

## Usage

Requires Chrome running with `--remote-debugging-port=9222`, logged into both Qian Gua and Xiaohongshu.

```bash
# Initialize the outreach database
python3 init_db.py

# Run batch outreach (search, screen, comment)
node batch_comment_v2.mjs

# Capture share links via mitmproxy
mitmdump --listen-port 8080 -s capture_share_links.py

# Automate share link capture via iPhone Mirroring
python3 xhs_auto.py urls.txt
```

---

Built by [Jenny Chen](https://linkedin.com/in/tjennychen)
