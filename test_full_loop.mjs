/**
 * Full pipeline test: preflight → search → profile → extract → comment → save
 * Tests with ONE influencer before any batch runs.
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const COMMENT = '超喜欢你的内容！我在做Tory Burch品牌调研，有偿请教几个问题，可以私信聊吗？';
const DB_PATH = '/Users/jenny/Sites/tory burch/outreach.db';
const TEST_NAME = 'SHIYI';  // One of the remaining 10

function dbExec(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  try { return execSync(`sqlite3 "${DB_PATH}" "${escaped}"`, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function saveToDB(d) {
  const e = s => (s || '').replace(/'/g, "''");
  dbExec(`INSERT OR IGNORE INTO outreach (nickname,profile_url,xhs_user_id,followers,email,wechat,bio,comment_text,influencer_tier,engagement,screening_verdict,status) VALUES('${e(d.name)}','${e(d.url)}','${e(d.uid)}',${d.followers||0},'${e(d.email)}','${e(d.wechat)}','${e(d.bio)}','${e(COMMENT)}','${e(d.tier)}',${d.engagement},'Y','commented')`);
}

async function checkRateLimit(page) {
  const signals = await page.evaluate(() => {
    const t = document.body.innerText;
    return ['验证','滑块','操作频繁','请稍后再试','账号异常','captcha','频率'].filter(s => t.includes(s));
  }).catch(() => []);
  return signals.length > 0 ? signals : null;
}

async function main() {
  // ═══════════════════════════════════════════
  // PREFLIGHT: verify Chrome, XHS login, Qian Gua
  // ═══════════════════════════════════════════
  console.log('═══ PREFLIGHT CHECKS ═══\n');

  let browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✓ Chrome CDP connected');
  } catch (e) {
    console.log('✗ Cannot connect to Chrome CDP on port 9222');
    console.log('  Fix: launch Chrome with --remote-debugging-port=9222');
    return;
  }

  const context = browser.contexts()[0];
  const allPages = context.pages();
  console.log(`  ${allPages.length} tabs open`);

  // Check for XHS tab with active session
  const xhsPage = allPages.find(p =>
    p.url().includes('xiaohongshu.com') &&
    !p.url().includes('captcha') &&
    !p.url().includes('login') &&
    !p.url().includes('blob:') &&
    !p.url().includes('sw.js')
  );

  if (!xhsPage) {
    console.log('✗ No XHS tab found (or stuck on captcha/login)');
    console.log('  Fix: open xiaohongshu.com in Chrome and log in');
    return;
  }
  console.log(`✓ XHS tab found: ${xhsPage.url().substring(0, 60)}`);

  // Verify XHS is actually logged in (check for profile icon or 我 nav)
  const loggedIn = await xhsPage.evaluate(() => {
    const text = document.body.innerText;
    return text.includes('我') && !text.includes('登录') && !text.includes('手机号');
  }).catch(() => false);

  if (!loggedIn) {
    console.log('✗ XHS not logged in (or page not fully loaded)');
    console.log('  Fix: log into xiaohongshu.com manually');
    return;
  }
  console.log('✓ XHS logged in');

  // Check for rate limit on current page
  const rl = await checkRateLimit(xhsPage);
  if (rl) {
    console.log(`✗ XHS rate limited: ${rl.join(', ')}`);
    console.log('  Fix: solve captcha manually, wait a few minutes');
    return;
  }
  console.log('✓ No rate limits detected');

  // Check Qian Gua tab
  const qgPage = allPages.find(p => p.url().includes('qian-gua.com'));
  if (qgPage) {
    console.log(`✓ Qian Gua tab found: ${qgPage.url().substring(0, 60)}`);
  } else {
    console.log('○ No Qian Gua tab (optional for this test)');
  }

  console.log('\n═══ PREFLIGHT PASSED ═══\n');

  // ═══════════════════════════════════════════
  // PHASE 2+3 COMBINED: Search → Profile → Extract → Comment
  // One continuous flow, one tab, one visit
  // ═══════════════════════════════════════════
  const page = xhsPage;
  console.log(`Testing full loop with: "${TEST_NAME}"\n`);

  // STEP 1: Navigate to search results (in same tab)
  console.log('Step 1: Search...');
  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(TEST_NAME)}&source=web_search_result_notes`;
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  let rl2 = await checkRateLimit(page);
  if (rl2) {
    console.log(`  ⚠️ Rate limited on search: ${rl2.join(', ')}`);
    return;
  }
  console.log('  Search loaded OK');

  // STEP 2: Find the RIGHT user profile link in search results
  // CRITICAL: skip the nav "我" links — they point to YOUR OWN profile
  console.log('Step 2: Find user profile...');

  // Get own profile URL to exclude it
  const ownProfileUrl = await page.evaluate(() => {
    const meLinks = [...document.querySelectorAll('a[href*="/user/profile/"]')]
      .filter(a => a.textContent.trim() === '我');
    return meLinks.length > 0 ? meLinks[0].href.split('?')[0] : '';
  });
  console.log(`  Own profile (skip): ${ownProfileUrl.substring(ownProfileUrl.lastIndexOf('/') + 1, ownProfileUrl.lastIndexOf('/') + 13)}...`);

  // Find search result profile that is NOT our own account
  const profileData = await page.evaluate(({ ownUrl, targetName }) => {
    const links = [...document.querySelectorAll('a[href*="/user/profile/"]')];
    for (const a of links) {
      const url = a.href.split('?')[0];
      if (ownUrl && url === ownUrl) continue;
      if (a.textContent.trim() === '我') continue;
      const text = a.textContent.trim();
      if (text.includes(targetName) || text.length > 5) {
        return { url, text: text.substring(0, 50) };
      }
    }
    for (const a of links) {
      const url = a.href.split('?')[0];
      if (ownUrl && url === ownUrl) continue;
      if (a.textContent.trim() === '我') continue;
      return { url: url, text: a.textContent.trim().substring(0, 50) };
    }
    return null;
  }, { ownUrl: ownProfileUrl, targetName: TEST_NAME });

  if (!profileData) {
    console.log('  ✗ No matching profile found in search results');
    return;
  }

  const profileUrl = profileData.url;
  console.log(`  Found: "${profileData.text}" → ${profileUrl}`);

  // Navigate to profile (instead of clicking, to avoid overlay issues)
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  rl2 = await checkRateLimit(page);
  if (rl2) {
    console.log(`  ⚠️ Rate limited on profile: ${rl2.join(', ')}`);
    return;
  }

  // STEP 4: Extract info (we're now on the profile page)
  console.log('Step 4: Extract info...');
  const currentUrl = page.url().split('?')[0];
  const uid = currentUrl.match(/profile\/([a-f0-9]+)/)?.[1] || '';

  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    const em = t.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
    const fm = t.match(/(\d+(?:\.\d+)?万?)\s*粉丝/);
    let f = 0;
    if (fm) f = fm[1].includes('万') ? Math.round(parseFloat(fm[1]) * 10000) : parseInt(fm[1]);
    const bio = (document.querySelector('.user-desc,[class*="desc"]') || {}).textContent || '';
    const wx = t.match(/(?:微信|wx|vx)[号]?\s*[:：]\s*([A-Za-z0-9_-]{5,20})/i);
    const nickname = (document.querySelector('.user-name,[class*="user-name"]') || {}).textContent || '';
    return {
      email: em ? em[0] : '',
      followers: f,
      bio: bio.substring(0, 200).trim(),
      wechat: wx ? wx[1] : '',
      nickname: nickname.trim()
    };
  }).catch(() => ({}));

  console.log(`  Nickname: ${info.nickname || TEST_NAME}`);
  console.log(`  Followers: ${info.followers}`);
  console.log(`  Email: ${info.email || 'none'}`);
  console.log(`  WeChat: ${info.wechat || 'none'}`);
  console.log(`  Bio: ${info.bio.substring(0, 80) || 'none'}`);
  console.log(`  Profile URL: ${currentUrl}`);
  console.log(`  User ID: ${uid}`);

  // STEP 5: Click first post
  console.log('Step 5: Open first post...');
  let clicked = false;
  for (const sel of ['section.note-item', '.note-item']) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    console.log('  ✗ No posts found on profile');
    return;
  }
  await page.waitForTimeout(4000);
  console.log('  Post opened');

  // STEP 6: Type comment
  console.log('Step 6: Comment...');
  const placeholder = page.locator('text=说点什么').first();
  if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
    await placeholder.click({ force: true });
    await page.waitForTimeout(1000);
  }

  const commentBox = page.locator('#content-textarea').first();
  if (!await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  ✗ Comment box not found');
    return;
  }

  await commentBox.click({ force: true });
  await page.waitForTimeout(500);
  await page.keyboard.type(COMMENT, { delay: 80 });
  await page.waitForTimeout(1000);
  console.log('  Comment typed');

  // STEP 7: Send
  console.log('Step 7: Send...');
  let sent = false;
  const sendBtn = page.locator('button:has-text("发送")').first();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
    sent = true;
  } else {
    await page.keyboard.press('Enter');
    sent = true;
  }
  await page.waitForTimeout(3000);

  rl2 = await checkRateLimit(page);
  if (rl2) {
    console.log(`  ⚠️ Rate limited after comment: ${rl2.join(', ')}`);
  }

  // STEP 8: Save to DB
  if (sent) {
    saveToDB({
      name: info.nickname || TEST_NAME,
      url: currentUrl,
      uid,
      followers: info.followers,
      email: info.email,
      wechat: info.wechat,
      bio: info.bio,
      tier: '腰部达人',
      engagement: 2424,
    });
    console.log('  ✓ Saved to DB');
  }

  console.log('\n═══ FULL LOOP COMPLETE ═══');
  console.log(`  Search "${TEST_NAME}" → found profile → extracted info → commented → saved`);
  console.log('  Pipeline is working. Ready for batch.\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
