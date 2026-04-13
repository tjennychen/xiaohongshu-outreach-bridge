/**
 * XHS Batch Comment v2 — Search by name, find profile, comment on first post.
 *
 * Connects to running Chrome via CDP (port 9222).
 * For each influencer name: searches XHS → finds profile → opens first post → comments.
 *
 * Usage: node batch_comment_v2.mjs
 */

import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const COMMENT_TEXT = '超喜欢你的内容！我在做Tory Burch品牌调研，有偿请教几个问题，可以私信聊吗？';
const SCREENSHOTS = '/Users/jenny/Sites/xiaohongshu';
const DB_PATH = '/Users/jenny/Sites/tory burch/outreach.db';

// Today's qualifying targets from Qian Gua top 30
// Filtered: real people, not 头部达人/知名KOL, not brand/store/news accounts, under 6K engagement
const TARGETS = [
  { name: 'iamMaynia', tier: '腰部达人', engagement: 5733, sponsored: true },
  { name: 'Cathena嫣', tier: '素人', engagement: 3715, sponsored: false },
  { name: '楼下小姨', tier: '腰部达人', engagement: 3360, sponsored: true },
  { name: '东东miaaa', tier: '腰部达人', engagement: 3215, sponsored: true },
  { name: '一原里美', tier: '腰部达人', engagement: 3151, sponsored: true },
  { name: 'Vansbb', tier: '初级达人', engagement: 2807, sponsored: true },
  { name: '薛Tiffany', tier: '初级达人', engagement: 2761, sponsored: true },
  { name: '章馨心Erin', tier: '腰部达人', engagement: 2742, sponsored: true },
  { name: 'SHIYI', tier: '腰部达人', engagement: 2424, sponsored: true },
  { name: 'kathyyymm', tier: '腰部达人', engagement: 2419, sponsored: true },
  { name: '扭扭就泡泡', tier: '腰部达人', engagement: 2105, sponsored: false },
  { name: '罗岚珊RHO', tier: '腰部达人', engagement: 1756, sponsored: true },
  { name: '樹一SENSENG', tier: '腰部达人', engagement: 1729, sponsored: true },
  { name: 'chowei', tier: '腰部达人', engagement: 1696, sponsored: true },
  { name: '耶涵米', tier: '初级达人', engagement: 1626, sponsored: true },
  { name: 'imeating', tier: '腰部达人', engagement: 1575, sponsored: true },
  { name: '瘦瘦璐-', tier: '腰部达人', engagement: 1492, sponsored: true },
  { name: '鱼老蓓', tier: '腰部达人', engagement: 1294, sponsored: true },
];

// ── SCREENING KEYWORDS (from batch_comment.mjs) ────────────────────────────
const COMMERCIAL_KEYWORDS = [
  '柜姐', '柜哥', '专柜', '导购', '合作', '商务', '品牌', '官方', '旗舰',
  '代购', '跑腿', '推广', '种草', '接单', '报价', '询价', '私信下单',
  '店铺', '门店', '专卖', '经销', '批发', '零售', '采购',
  '新闻', '资讯', '媒体', '编辑', '记者', '杂志',
  '粉丝团', '后援会', '应援', '打call',
  '每日更新', '天天更新', '好物分享', '好物推荐',
  '活动', '随拍', '展示', '专业讲解',
  '欢迎留言', '感谢关注', '福利多多',
];

const PERSONAL_KEYWORDS = [
  '水瓶', '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '双鱼',
  'INTP', 'INTJ', 'INFP', 'INFJ', 'ENTP', 'ENTJ', 'ENFP', 'ENFJ', 'ISTP', 'ISTJ', 'ISFP', 'ISFJ', 'ESTP', 'ESTJ', 'ESFP', 'ESFJ',
  '大学', 'University', '学院',
  '吃不胖', '健身', '旅行', '潜水', '生活', '日常',
  '坐标', '一枚', '宝妈', '打工人',
];

function screenProfile(pageText, nickname) {
  const text = (pageText + ' ' + nickname).toLowerCase();
  let commercialScore = 0;
  let personalScore = 0;
  const commercialMatches = [];
  const personalMatches = [];

  for (const kw of COMMERCIAL_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      commercialScore++;
      commercialMatches.push(kw);
    }
  }
  for (const kw of PERSONAL_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      personalScore++;
      personalMatches.push(kw);
    }
  }

  let verdict;
  if (commercialScore >= 2) {
    verdict = 'No';
  } else if (personalScore >= 1 && commercialScore === 0) {
    verdict = 'Y';
  } else if (commercialScore <= 1) {
    // Lean yes for influencers — they already passed Qian Gua tier filter
    verdict = 'Y';
  } else {
    verdict = '?';
  }

  return { verdict, commercialScore, personalScore, commercialMatches, personalMatches };
}

function dbExec(sql, params = []) {
  // Use sqlite3 CLI for simplicity
  const escaped = sql.replace(/"/g, '\\"');
  try {
    return execSync(`sqlite3 "${DB_PATH}" "${escaped}"`, { encoding: 'utf8' }).trim();
  } catch (e) {
    return '';
  }
}

function isAlreadyCommented(profileUrl) {
  const result = dbExec(`SELECT COUNT(*) FROM outreach WHERE profile_url='${profileUrl}' AND status='commented'`);
  return parseInt(result) > 0;
}

function insertOutreach(data) {
  // Escape single quotes in all text fields
  const esc = (s) => (s || '').replace(/'/g, "''");
  const status = data.verdict === 'No' ? 'screened_out' : 'commented';
  const commentText = data.verdict === 'No' ? '' : COMMENT_TEXT;
  const sql = `INSERT OR IGNORE INTO outreach (nickname, profile_url, xhs_user_id, followers, email, wechat, bio, comment_text, influencer_tier, engagement, is_sponsored, screening_verdict, contact_info, status) VALUES ('${esc(data.nickname)}', '${esc(data.profileUrl)}', '${esc(data.userId)}', ${data.followers || 0}, '${esc(data.email)}', '${esc(data.wechat)}', '${esc(data.bio)}', '${esc(commentText)}', '${esc(data.tier)}', ${data.engagement || 0}, '${data.sponsored ? '是' : '否'}', '${esc(data.verdict)}', '${esc(data.contactInfo)}', '${status}')`;
  dbExec(sql);
}

async function findProfileFromSearch(page, name) {
  console.log(`  Searching XHS for "${name}" via search box...`);

  // Use the visible search input (XHS has overlapping inputs; target #search-input with force click)
  const searchBox = page.locator('#search-input');

  if (await searchBox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchBox.click({ force: true });
    await page.waitForTimeout(500);
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(200);
    await page.keyboard.type(name, { delay: 60 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);
  } else {
    // Fallback: navigate to search URL
    console.log('  Search box not found, using URL fallback...');
    await page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(name)}&source=web_search_result_notes`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
  }

  // Check for rate limiting
  const rateLimit = await detectRateLimit(page);
  if (rateLimit) {
    console.log(`  ⚠️  Rate limited during search! Signals: ${rateLimit.join(', ')}`);
    return 'rate_limited';
  }

  // Click the "账号" (accounts) tab to filter to user results
  const accountTab = page.locator('text=账号').first();
  if (await accountTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await accountTab.click();
    await page.waitForTimeout(3000);
  }

  await page.screenshot({ path: `${SCREENSHOTS}/search_${name.replace(/[^\w\u4e00-\u9fff]/g, '')}.png` });

  // Click the first user card to navigate to their profile
  // User cards contain the name, follower count, and 关注 button
  const userCard = page.locator(`text=${name}`).first();
  if (await userCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    await userCard.click();
    await page.waitForTimeout(5000);

    // Now we should be on the profile page
    const currentUrl = page.url();
    if (currentUrl.includes('/user/profile/')) {
      return currentUrl.split('?')[0];
    }
  }

  // Fallback: try clicking any user card link
  const anyUserLink = page.locator('a[href*="/user/profile/"]').first();
  if (await anyUserLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await anyUserLink.click();
    await page.waitForTimeout(5000);
    const currentUrl = page.url();
    if (currentUrl.includes('/user/profile/')) {
      return currentUrl.split('?')[0];
    }
  }

  return null;
}

async function getProfileInfo(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText;

    // Extract follower count
    const followersMatch = text.match(/(\d+(?:\.\d+)?万?)\s*粉丝/);
    let followers = 0;
    if (followersMatch) {
      const raw = followersMatch[1];
      if (raw.includes('万')) {
        followers = Math.round(parseFloat(raw) * 10000);
      } else {
        followers = parseInt(raw);
      }
    }

    // Extract user ID from URL
    const urlMatch = window.location.href.match(/profile\/([a-f0-9]+)/);
    const userId = urlMatch ? urlMatch[1] : '';

    // Extract bio/desc area (may contain contact info)
    const bioSelectors = ['.user-desc', '[class*="desc"]', '[class*="bio"]', '.user-info'];
    let bio = '';
    for (const sel of bioSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > bio.length) {
        bio = el.textContent.trim();
      }
    }

    // Also get the full info header area for contact extraction
    const infoArea = document.querySelector('[class*="user-info"]') || document.querySelector('header');
    const fullText = bio + ' ' + (infoArea ? infoArea.textContent : '') + ' ' + text.substring(0, 3000);

    // Extract email from bio/page
    const emailMatch = fullText.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
    const email = emailMatch ? emailMatch[0] : '';

    // Extract WeChat ID patterns: 微信/wx/vx followed by : or ：then ID
    const wechatPatterns = [
      /(?:微信|wx|vx|WeChat|wechat)[号]?\s*[:：]\s*([A-Za-z0-9_-]{5,20})/i,
      /(?:微信|wx|vx|WeChat|wechat)[号]?\s+([A-Za-z0-9_-]{5,20})/i,
      /(?:v|V|💬)\s*[:：]\s*([A-Za-z0-9_-]{5,20})/,
    ];
    let wechat = '';
    for (const pat of wechatPatterns) {
      const m = fullText.match(pat);
      if (m) { wechat = m[1]; break; }
    }

    // Extract phone number
    const phoneMatch = fullText.match(/1[3-9]\d{9}/);
    const phone = phoneMatch ? phoneMatch[0] : '';

    // Extract nickname
    const nameEl = document.querySelector('.user-name, [class*="user-name"], [class*="nickname"]');
    const nickname = nameEl ? nameEl.textContent.trim() : '';

    // Get page text for screening
    const pageText = text.substring(0, 2000);

    return { followers, userId, bio: bio.substring(0, 500), email, wechat, phone, nickname, pageText };
  }).catch(() => ({}));
}

async function detectRateLimit(page) {
  // Check for common XHS rate-limiting / verification signals
  const blocked = await page.evaluate(() => {
    const text = document.body.innerText;
    const signals = [
      '验证', '滑块', '人机验证', '操作频繁', '请稍后再试',
      '系统繁忙', '访问受限', '账号异常', '安全验证',
      '网络异常', '请重新登录', 'captcha', '频率过高',
    ];
    const found = signals.filter(s => text.includes(s));
    return found.length > 0 ? found : null;
  }).catch(() => null);
  return blocked;
}

async function commentOnFirstPost(page, profileUrl) {
  // Navigate to profile (reuse current tab, don't open new ones)
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Check for rate limiting
  let rateLimit = await detectRateLimit(page);
  if (rateLimit) {
    console.log(`\n  ⚠️  RATE LIMITED! Signals: ${rateLimit.join(', ')}`);
    console.log('  Waiting 60 seconds before retry...');
    await page.waitForTimeout(60000);
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    rateLimit = await detectRateLimit(page);
    if (rateLimit) {
      console.log(`  ⚠️  STILL RATE LIMITED after wait. Signals: ${rateLimit.join(', ')}`);
      console.log('  STOPPING — need manual intervention.');
      return 'rate_limited';
    }
  }

  // Click first post
  const postSelectors = ['section.note-item', '.note-item', 'a[href*="/explore/"]', '.cover'];
  let firstPost = null;
  for (const sel of postSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      firstPost = el;
      break;
    }
  }

  if (!firstPost) {
    console.log('  Could not find posts on profile');
    return false;
  }

  await firstPost.click();
  await page.waitForTimeout(3000);

  // Check for rate limiting again after opening post
  rateLimit = await detectRateLimit(page);
  if (rateLimit) {
    console.log(`\n  ⚠️  RATE LIMITED on post page! Signals: ${rateLimit.join(', ')}`);
    console.log('  Waiting 60 seconds before retry...');
    await page.waitForTimeout(60000);
    return 'rate_limited';
  }

  // Click comment placeholder to activate
  const placeholder = page.locator('text=说点什么').first();
  if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
    await placeholder.click({ force: true });
    await page.waitForTimeout(1000);
  }

  // Find comment box
  const commentBox = page.locator('#content-textarea').first();
  if (!await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Could not find comment box');
    return false;
  }

  // Type comment
  await commentBox.click({ force: true });
  await page.waitForTimeout(500);
  await page.keyboard.type(COMMENT_TEXT, { delay: 80 });
  await page.waitForTimeout(1000);

  // Submit
  const submitBtn = page.locator('button:has-text("发送")').first();
  if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await submitBtn.click();
    console.log('  Comment submitted!');
  } else {
    await page.keyboard.press('Enter');
    console.log('  Comment submitted (Enter)');
  }

  await page.waitForTimeout(3000);

  // Check if comment was actually posted or blocked
  rateLimit = await detectRateLimit(page);
  if (rateLimit) {
    console.log(`  ⚠️  Comment may have been blocked! Signals: ${rateLimit.join(', ')}`);
    await page.screenshot({ path: `${SCREENSHOTS}/rate_limited.png` });
    return 'rate_limited';
  }

  await page.screenshot({ path: `${SCREENSHOTS}/comment_result_latest.png` });
  return true;
}

async function main() {
  console.log('Connecting to Chrome via CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const allPages = context.pages();

  // Find one XHS page and stick with it (don't open new tabs)
  const xhsPages = allPages.filter(p => p.url().includes('xiaohongshu.com') && !p.url().includes('captcha') && !p.url().includes('blob:') && !p.url().includes('sw.js'));
  let page = xhsPages[0] || allPages[0];

  if (!page) {
    console.log('No usable page found');
    return;
  }
  console.log(`Using single tab: ${page.url()}`);
  console.log('(All navigation happens in this tab — no new tabs opened)\n');

  const results = [];
  let commented = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i];
    console.log(`\n[${i + 1}/${TARGETS.length}] ${target.name} (${target.tier}, ${target.engagement} engagement)`);

    try {
      // Search for the user on XHS
      const profileUrl = await findProfileFromSearch(page, target.name);

      if (profileUrl === 'rate_limited') {
        console.log('\n🛑 RATE LIMITED during search — stopping batch.');
        results.push({ ...target, status: 'rate_limited' });
        break;
      }

      if (!profileUrl) {
        console.log('  Could not find profile, skipping');
        results.push({ ...target, status: 'not_found' });
        failed++;
        continue;
      }

      console.log(`  Profile: ${profileUrl}`);

      // Check if already commented
      if (isAlreadyCommented(profileUrl)) {
        console.log('  Already commented, skipping');
        results.push({ ...target, profileUrl, status: 'already_done' });
        skipped++;
        continue;
      }

      // Navigate to profile and get info
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const info = await getProfileInfo(page);

      // Collect all contact info
      const contactParts = [];
      if (info.email) contactParts.push(`email: ${info.email}`);
      if (info.wechat) contactParts.push(`wechat: ${info.wechat}`);
      if (info.phone) contactParts.push(`phone: ${info.phone}`);
      const contactInfo = contactParts.join(', ');

      console.log(`  Followers: ${info.followers}`);
      if (contactInfo) console.log(`  Contact: ${contactInfo}`);

      // Screen: is this a real person?
      const screening = screenProfile(info.pageText || '', info.nickname || target.name);
      console.log(`  Screening: ${screening.verdict} (commercial=${screening.commercialScore}, personal=${screening.personalScore})`);
      if (screening.commercialMatches.length) console.log(`    Commercial: ${screening.commercialMatches.join(', ')}`);
      if (screening.personalMatches.length) console.log(`    Personal: ${screening.personalMatches.join(', ')}`);

      await page.screenshot({ path: `${SCREENSHOTS}/profile_${target.name.replace(/[^\w\u4e00-\u9fff]/g, '')}.png` });

      if (screening.verdict === 'No') {
        console.log('  SKIPPED: not a real person');
        // Still record in DB for tracking, but don't comment
        insertOutreach({
          nickname: info.nickname || target.name,
          profileUrl,
          userId: info.userId,
          followers: info.followers,
          email: info.email,
          wechat: info.wechat,
          bio: info.bio,
          tier: target.tier,
          engagement: target.engagement,
          sponsored: target.sponsored,
          verdict: 'No',
          contactInfo,
        });
        skipped++;
        results.push({ ...target, profileUrl, status: 'screened_out', ...info, screening });
        continue;
      }

      // Leave comment on first post
      const success = await commentOnFirstPost(page, profileUrl);

      if (success === 'rate_limited') {
        // Save what we have so far and stop
        insertOutreach({
          nickname: info.nickname || target.name,
          profileUrl,
          userId: info.userId,
          followers: info.followers,
          email: info.email,
          wechat: info.wechat,
          bio: info.bio,
          tier: target.tier,
          engagement: target.engagement,
          sponsored: target.sponsored,
          verdict: screening.verdict,
          contactInfo,
        });
        results.push({ ...target, profileUrl, status: 'rate_limited', ...info });
        console.log('\n🛑 RATE LIMITED — stopping batch to protect account.');
        console.log(`Completed ${commented} comments before hitting the wall.`);
        console.log(`Remaining targets starting from: ${TARGETS.slice(i).map(t => t.name).join(', ')}`);
        break;
      }

      if (success) {
        // Record in database
        insertOutreach({
          nickname: info.nickname || target.name,
          profileUrl,
          userId: info.userId,
          followers: info.followers,
          email: info.email,
          wechat: info.wechat,
          bio: info.bio,
          tier: target.tier,
          engagement: target.engagement,
          sponsored: target.sponsored,
          verdict: screening.verdict,
          contactInfo,
        });
        commented++;
        results.push({ ...target, profileUrl, status: 'commented', ...info, screening });
        console.log('  Recorded in database');
      } else {
        failed++;
        results.push({ ...target, profileUrl, status: 'comment_failed', ...info, screening });
      }

      // Random delay between targets (8-15 seconds to avoid rate limiting)
      const delay = 8000 + Math.random() * 7000;
      console.log(`  Waiting ${(delay / 1000).toFixed(1)}s...`);
      await page.waitForTimeout(delay);

    } catch (err) {
      console.log(`  Error: ${err.message}`);
      results.push({ ...target, status: 'error', error: err.message });
      failed++;
    }
  }

  // Save results
  writeFileSync(`${SCREENSHOTS}/batch_v2_results.json`, JSON.stringify(results, null, 2));

  // Summary
  console.log('\n\n=== SUMMARY ===');
  console.log(`Commented: ${commented}`);
  console.log(`Skipped (already done): ${skipped}`);
  console.log(`Failed/Not found: ${failed}`);
  console.log(`Total: ${TARGETS.length}`);
  console.log(`\nResults saved to batch_v2_results.json`);

  console.log('\n--- Details ---');
  for (const r of results) {
    const status = r.status.padEnd(15);
    console.log(`  ${r.name.padEnd(20)} ${status} ${r.profileUrl || ''}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
