import { chromium } from 'playwright';
import { execSync } from 'child_process';

const COMMENT = '超喜欢你的内容！我在做Tory Burch品牌调研，有偿请教几个问题，可以私信聊吗？';
const DB_PATH = '/Users/jenny/Sites/tory burch/outreach.db';

// Remaining 5 (skip 楼下小姨 = bad URL, skip iamMaynia + Cathena嫣 = already done)
const TARGETS = [
  { name: '东东miaaa', uid: '62b36ab3000000001b02aedf', tier: '腰部达人', engagement: 3215 },
  { name: '一原里美', uid: '5e7787040000000001003b4c', tier: '腰部达人', engagement: 3151 },
  { name: 'Vansbb', uid: '588da31c82ec39628eea1aa7', tier: '初级达人', engagement: 2807 },
  { name: '薛Tiffany', uid: '6819ab63000000000e01fa28', tier: '初级达人', engagement: 2761 },
  { name: '章馨心Erin', uid: '5c65aa0e00000000110356f7', tier: '腰部达人', engagement: 2742 },
];

function dbExec(sql) {
  try { return execSync(`sqlite3 "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}
function isAlreadyDone(url) {
  return parseInt(dbExec(`SELECT COUNT(*) FROM outreach WHERE profile_url='${url}' AND status='commented'`)) > 0;
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
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  let page = context.pages().find(p => p.url().includes('xiaohongshu.com') && !p.url().includes('captcha'));
  if (!page) { console.log('No XHS page!'); return; }
  console.log(`Using: ${page.url().substring(0, 60)}\n`);

  let commented = 0;

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const profileUrl = `https://www.xiaohongshu.com/user/profile/${t.uid}`;
    console.log(`\n[${i+1}/${TARGETS.length}] ${t.name}`);

    if (isAlreadyDone(profileUrl)) { console.log('  Already done, skip'); continue; }

    // Navigate
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Rate limit
    let rl = await checkRateLimit(page);
    if (rl) {
      console.log(`  ⚠️ RATE LIMITED: ${rl.join(', ')}. Waiting 60s...`);
      await page.waitForTimeout(60000);
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      rl = await checkRateLimit(page);
      if (rl) { console.log(`  ⚠️ STILL BLOCKED. Stopping.`); break; }
    }

    // Extract info
    const info = await page.evaluate(() => {
      const t = document.body.innerText;
      const em = t.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      const fm = t.match(/(\d+(?:\.\d+)?万?)\s*粉丝/);
      let f = 0; if (fm) f = fm[1].includes('万') ? Math.round(parseFloat(fm[1])*10000) : parseInt(fm[1]);
      const bio = (document.querySelector('.user-desc,[class*="desc"]') || {}).textContent || '';
      const wx = t.match(/(?:微信|wx|vx)[号]?\s*[:：]\s*([A-Za-z0-9_-]{5,20})/i);
      return { email: em?em[0]:'', followers: f, bio: bio.substring(0,200), wechat: wx?wx[1]:'' };
    }).catch(() => ({}));

    const c = []; if (info.email) c.push(`email:${info.email}`); if (info.wechat) c.push(`wx:${info.wechat}`);
    console.log(`  ${info.followers} followers  ${c.join(' ') || 'no contact'}`);

    // Click first post
    let clicked = false;
    for (const sel of ['section.note-item', '.note-item']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click(); clicked = true; break;
      }
    }
    if (!clicked) { console.log('  No posts, skip'); continue; }
    await page.waitForTimeout(4000);

    // Activate comment box (force:true to bypass overlay)
    const placeholder = page.locator('text=说点什么').first();
    if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
      await placeholder.click({ force: true });
      await page.waitForTimeout(1000);
    }

    // Type into comment box (force:true to bypass scroll/overlay issues)
    const commentBox = page.locator('#content-textarea').first();
    if (!await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('  Comment box not found, skip'); continue;
    }
    await commentBox.click({ force: true });
    await page.waitForTimeout(500);
    await page.keyboard.type(COMMENT, { delay: 80 });
    await page.waitForTimeout(1000);

    // Send
    let sent = false;
    const sendBtn = page.locator('button:has-text("发送")').first();
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click(); sent = true; console.log('  ✓ Comment sent!');
    } else {
      await page.keyboard.press('Enter'); sent = true; console.log('  ✓ Comment sent (Enter)');
    }
    await page.waitForTimeout(3000);

    // Post-comment check
    rl = await checkRateLimit(page);
    if (rl) {
      console.log(`  ⚠️ BLOCKED: ${rl.join(', ')}`);
      if (sent) { saveToDB({ ...t, url: profileUrl, ...info }); commented++; }
      break;
    }

    if (sent) { saveToDB({ ...t, url: profileUrl, ...info }); commented++; console.log('  Saved to DB'); }

    const delay = 12000 + Math.floor(Math.random() * 6000);
    console.log(`  Wait ${(delay/1000).toFixed(0)}s...`);
    await page.waitForTimeout(delay);
  }

  console.log(`\n=== DONE: ${commented}/${TARGETS.length} ===`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
