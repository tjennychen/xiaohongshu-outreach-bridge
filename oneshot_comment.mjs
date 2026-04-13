/**
 * One-shot XHS comment pipeline using Playwright.
 * For each target: navigate to profile → extract info → click post → comment → save to DB → next.
 * One visit per person. No going back.
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const COMMENT = '超喜欢你的内容！我在做Tory Burch品牌调研，有偿请教几个问题，可以私信聊吗？';
const DB_PATH = '/Users/jenny/Sites/tory burch/outreach.db';

const TARGETS = [
  { name: 'iamMaynia', uid: '60e6e225000000000100a9f7', tier: '腰部达人', engagement: 5733 },
  { name: 'Cathena嫣', uid: '577a664e5e87e708b053dbe9', tier: '素人', engagement: 3715 },
  { name: '楼下小姨', uid: '58a3d7685e87e70e19cc0978', tier: '腰部达人', engagement: 3360 },
  { name: '东东miaaa', uid: '62b36ab3000000001b02aedf', tier: '腰部达人', engagement: 3215 },
  { name: '一原里美', uid: '5e7787040000000001003b4c', tier: '腰部达人', engagement: 3151 },
  { name: 'Vansbb', uid: '588da31c82ec39628eea1aa7', tier: '初级达人', engagement: 2807 },
  { name: '薛Tiffany', uid: '6819ab63000000000e01fa28', tier: '初级达人', engagement: 2761 },
  { name: '章馨心Erin', uid: '5c65aa0e00000000110356f7', tier: '腰部达人', engagement: 2742 },
];

function dbExec(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  try { return execSync(`sqlite3 "${DB_PATH}" "${escaped}"`, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function isAlreadyDone(profileUrl) {
  return parseInt(dbExec(`SELECT COUNT(*) FROM outreach WHERE profile_url='${profileUrl}' AND status='commented'`)) > 0;
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
  console.log('Connecting to Chrome via Playwright CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const allPages = context.pages();

  // Find one XHS page, reuse it
  let page = allPages.find(p => p.url().includes('xiaohongshu.com') && !p.url().includes('captcha'));
  if (!page) { console.log('No XHS page found!'); return; }
  console.log(`Using: ${page.url().substring(0, 60)}\n`);

  let commented = 0;

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const profileUrl = `https://www.xiaohongshu.com/user/profile/${t.uid}`;
    console.log(`\n[${i+1}/${TARGETS.length}] ${t.name}`);

    if (isAlreadyDone(profileUrl)) {
      console.log('  Already commented, skip');
      continue;
    }

    // === NAVIGATE to profile ===
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Rate limit check
    let rl = await checkRateLimit(page);
    if (rl) {
      console.log(`  ⚠️ RATE LIMITED: ${rl.join(', ')}`);
      console.log(`  Waiting 60s then retrying...`);
      await page.waitForTimeout(60000);
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      rl = await checkRateLimit(page);
      if (rl) {
        console.log(`  ⚠️ STILL BLOCKED. Stopping. ${commented} done.`);
        break;
      }
    }

    // === EXTRACT info (one shot, while we're here) ===
    const info = await page.evaluate(() => {
      const t = document.body.innerText;
      const emailMatch = t.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      const fMatch = t.match(/(\d+(?:\.\d+)?万?)\s*粉丝/);
      let followers = 0;
      if (fMatch) followers = fMatch[1].includes('万') ? Math.round(parseFloat(fMatch[1]) * 10000) : parseInt(fMatch[1]);
      const bioEl = document.querySelector('.user-desc, [class*="desc"]');
      const bio = bioEl ? bioEl.textContent.trim() : '';
      const wxMatch = t.match(/(?:微信|wx|vx)[号]?\s*[:：]\s*([A-Za-z0-9_-]{5,20})/i);
      return {
        email: emailMatch ? emailMatch[0] : '',
        followers,
        bio: bio.substring(0, 200),
        wechat: wxMatch ? wxMatch[1] : ''
      };
    }).catch(() => ({}));

    const contacts = [];
    if (info.email) contacts.push(`email:${info.email}`);
    if (info.wechat) contacts.push(`wx:${info.wechat}`);
    console.log(`  ${info.followers} followers  ${contacts.join(' ') || 'no contact info'}`);

    // === CLICK first post ===
    const postSelectors = ['section.note-item', '.note-item', 'a[href*="/explore/"]'];
    let clicked = false;
    for (const sel of postSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      console.log('  No posts found, skip');
      continue;
    }
    await page.waitForTimeout(4000);

    // === ACTIVATE comment box ===
    const placeholder = page.locator('text=说点什么').first();
    if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
      await placeholder.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // Find comment box
    const commentBox = page.locator('#content-textarea').first();
    if (!await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Comment box not found, skip');
      continue;
    }

    // === TYPE comment (Playwright keyboard.type = real key events) ===
    await commentBox.click({ force: true });
    await page.waitForTimeout(500);
    await page.keyboard.type(COMMENT, { delay: 80 });
    await page.waitForTimeout(1000);

    // === SEND ===
    let sent = false;
    const sendBtn = page.locator('button:has-text("发送")').first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
      sent = true;
      console.log('  ✓ Comment sent!');
    } else {
      await page.keyboard.press('Enter');
      sent = true;
      console.log('  ✓ Comment sent (Enter)');
    }
    await page.waitForTimeout(3000);

    // Post-comment rate check
    rl = await checkRateLimit(page);
    if (rl) {
      console.log(`  ⚠️ BLOCKED after comment: ${rl.join(', ')}`);
      saveToDB({ ...t, url: profileUrl, ...info });
      commented++;
      break;
    }

    // === SAVE to DB ===
    if (sent) {
      saveToDB({ ...t, url: profileUrl, ...info });
      commented++;
      console.log('  Saved to DB');
    }

    // Wait 12-18s
    const delay = 12000 + Math.floor(Math.random() * 6000);
    console.log(`  Wait ${(delay/1000).toFixed(0)}s...`);
    await page.waitForTimeout(delay);
  }

  console.log(`\n=== DONE: ${commented}/${TARGETS.length} commented ===`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
