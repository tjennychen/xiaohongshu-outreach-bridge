/**
 * XHS Batch Profile Check + Comment
 *
 * Connects to running Chrome via CDP.
 * For each uncertain profile: checks bio, classifies, comments if real person.
 * Outputs results as JSON for Excel update.
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const COMMENT_TEXT = '好喜欢你做的Tory Burch分享，求合作联系方式';
const SCREENSHOTS = '/Users/jenny/Sites/xiaohongshu';

// Profiles to check (row number, nickname, url)
const PROFILES = [
  { row: 17, name: 'Susu配色集', url: 'https://www.xiaohongshu.com/user/profile/640c48b5000000001f033964' },
  { row: 21, name: '冬天不适合健身！！！', url: 'https://www.xiaohongshu.com/user/profile/62f09a03000000001e01dfe7' },
  { row: 23, name: '牧生生', url: 'https://www.xiaohongshu.com/user/profile/5c66d9130000000012001e61' },
  { row: 25, name: 'Gateway Chan', url: 'https://www.xiaohongshu.com/user/profile/59bdfe5cdb2e60742b572ef2' },
  { row: 29, name: 'Kas', url: 'https://www.xiaohongshu.com/user/profile/6110d40e000000000101f42b' },
  { row: 32, name: 'Michelle Jing', url: 'https://www.xiaohongshu.com/user/profile/5a029e564eacab714901470f' },
  { row: 38, name: '奶茶半勺甜', url: 'https://www.xiaohongshu.com/user/profile/5fb74ac8000000000100522c' },
  { row: 39, name: '蘸点软妹酱', url: 'https://www.xiaohongshu.com/user/profile/634953740000000012024fd7' },
  { row: 50, name: '丢丢不丢', url: 'https://www.xiaohongshu.com/user/profile/5ac0c118e8ac2b30879cc2ab' },
];

// Already known: Cathena嫣 = Y (from user's row 10 rating)
const KNOWN = [
  { row: 20, name: 'Cathena嫣', url: 'https://www.xiaohongshu.com/user/profile/577a664e5e87e708b053dbe9', verdict: 'Y' },
];

// Commercial indicators in bio text
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

// Personal indicators in bio
const PERSONAL_KEYWORDS = [
  '水瓶', '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '双鱼',
  'INTP', 'INTJ', 'INFP', 'INFJ', 'ENTP', 'ENTJ', 'ENFP', 'ENFJ', 'ISTP', 'ISTJ', 'ISFP', 'ISFJ', 'ESTP', 'ESTJ', 'ESFP', 'ESFJ',
  '大学', 'University', '学院',
  '吃不胖', '健身', '旅行', '潜水', '生活', '日常',
  '坐标', '一枚', '宝妈', '打工人',
];

function classifyBio(bio, nickname) {
  const text = (bio + ' ' + nickname).toLowerCase();

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

  return { commercialScore, personalScore, commercialMatches, personalMatches };
}

async function checkProfile(page, profile) {
  console.log(`\n--- Checking: ${profile.name} (row ${profile.row}) ---`);

  await page.goto(profile.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Extract bio text
  const bioText = await page.evaluate(() => {
    // Try various selectors for bio/description
    const selectors = ['.user-desc', '.bio', '.desc', '[class*="desc"]', '[class*="bio"]'];
    let text = '';
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) text += el.textContent + ' ';
    }
    // Also get the header area text
    const header = document.querySelector('[class*="user-info"]') || document.querySelector('[class*="info"]');
    if (header) text += header.textContent;
    return text.trim();
  }).catch(() => '');

  // Extract follower/following counts
  const stats = await page.evaluate(() => {
    const text = document.body.innerText;
    const followingMatch = text.match(/(\d+)\s*关注/);
    const followersMatch = text.match(/(\d+(?:\.\d+)?万?)\s*粉丝/);
    return {
      following: followingMatch ? followingMatch[1] : '?',
      followers: followersMatch ? followersMatch[1] : '?',
    };
  }).catch(() => ({ following: '?', followers: '?' }));

  // Get full visible text for analysis
  const pageText = await page.evaluate(() => {
    const main = document.querySelector('main') || document.querySelector('[class*="user"]') || document.body;
    return main.innerText.substring(0, 2000);
  }).catch(() => '');

  // Take screenshot
  await page.screenshot({ path: `${SCREENSHOTS}/profile_row${profile.row}.png` });

  // Classify
  const analysis = classifyBio(pageText, profile.name);

  console.log(`  Bio text: ${bioText.substring(0, 100)}`);
  console.log(`  Stats: ${stats.following} following, ${stats.followers} followers`);
  console.log(`  Commercial signals (${analysis.commercialScore}): ${analysis.commercialMatches.join(', ') || 'none'}`);
  console.log(`  Personal signals (${analysis.personalScore}): ${analysis.personalMatches.join(', ') || 'none'}`);

  let verdict;
  if (analysis.commercialScore >= 2) {
    verdict = 'No';
    console.log(`  VERDICT: No (commercial signals)`);
  } else if (analysis.personalScore >= 1 && analysis.commercialScore === 0) {
    verdict = 'Y';
    console.log(`  VERDICT: Y (personal profile)`);
  } else if (analysis.commercialScore === 0 && analysis.personalScore === 0) {
    // Ambiguous - lean towards Y if following count is reasonable (real people follow others)
    const followingNum = parseInt(stats.following);
    if (followingNum > 50) {
      verdict = 'Y';
      console.log(`  VERDICT: Y (no commercial signals, follows ${followingNum} people)`);
    } else {
      verdict = '?';
      console.log(`  VERDICT: ? (ambiguous, saved screenshot for manual review)`);
    }
  } else {
    verdict = '?';
    console.log(`  VERDICT: ? (mixed signals, saved screenshot for manual review)`);
  }

  return { ...profile, verdict, bio: bioText.substring(0, 200), stats, analysis };
}

async function leaveComment(page, profileUrl) {
  // Navigate to profile
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Click first post
  const firstPost = page.locator('section.note-item').first();
  if (!await firstPost.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('  Could not find posts');
    return false;
  }
  await firstPost.click();
  await page.waitForTimeout(3000);

  // Click placeholder to activate comment box
  const placeholder = page.locator('text=说点什么').first();
  if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
    await placeholder.click({ force: true });
    await page.waitForTimeout(1000);
  }

  // Find and type in comment box
  const commentBox = page.locator('#content-textarea').first();
  if (!await commentBox.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('  Could not find comment box');
    return false;
  }

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
  return true;
}

async function main() {
  console.log('Connecting to Chrome via CDP...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  let page = pages.find(p => p.url().includes('xiaohongshu.com')) || pages[0];

  if (!page) {
    console.log('No usable page found');
    return;
  }
  console.log(`Using page: ${page.url()}`);

  const results = [];

  // Check each uncertain profile
  for (const profile of PROFILES) {
    const result = await checkProfile(page, profile);
    results.push(result);

    // If real person, leave a comment
    if (result.verdict === 'Y') {
      console.log(`  Leaving comment on ${profile.name}...`);
      const commented = await leaveComment(page, profile.url);
      result.commented = commented;
      // Random delay between comments (5-10 seconds)
      const delay = 5000 + Math.random() * 5000;
      console.log(`  Waiting ${(delay/1000).toFixed(1)}s before next...`);
      await page.waitForTimeout(delay);
    }
  }

  // Add known results
  for (const k of KNOWN) {
    results.push(k);
  }

  // Save results
  writeFileSync(`${SCREENSHOTS}/screening_results.json`, JSON.stringify(results, null, 2));

  // Print summary
  console.log('\n\n=== SUMMARY ===');
  console.log('Row  Name                           Verdict  Commented');
  console.log('-'.repeat(70));
  for (const r of results.sort((a, b) => a.row - b.row)) {
    const commented = r.commented ? 'Yes' : '';
    console.log(`${r.row.toString().padEnd(4)} ${r.name.padEnd(30)} ${r.verdict.padEnd(8)} ${commented}`);
  }

  const yCount = results.filter(r => r.verdict === 'Y').length;
  const noCount = results.filter(r => r.verdict === 'No').length;
  const unsure = results.filter(r => r.verdict === '?').length;
  console.log(`\nY: ${yCount}  No: ${noCount}  Unsure: ${unsure}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
