/**
 * XHS Comment Bot — connects to your RUNNING Chrome via CDP.
 * No cookie extraction. No closing Chrome. Uses your live session.
 *
 * Prereq: Launch Chrome with --remote-debugging-port=9222
 *
 * Usage: node comment_xhs.mjs
 */

import { chromium } from 'playwright';

const PROFILE_URL = 'https://www.xiaohongshu.com/user/profile/60e1a1c5000000000101de95';
const COMMENT_TEXT = '好喜欢你做的Tory Burch分享，求合作联系方式';
const SCREENSHOTS = '/Users/jenny/Sites/xiaohongshu';

async function findXhsTab() {
  // Use CDP directly to find the XHS tab's websocket URL
  const resp = await fetch('http://localhost:9222/json/list');
  const tabs = await resp.json();
  const xhsTab = tabs.find(t => t.url.includes('xiaohongshu.com') && t.type === 'page');
  return xhsTab;
}

async function main() {
  console.log('Connecting to Chrome...');

  const xhsTab = await findXhsTab();
  if (xhsTab) {
    console.log(`Found XHS tab: ${xhsTab.url}`);
  }

  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const allPages = context.pages();

  console.log(`Playwright sees ${allPages.length} pages:`);
  allPages.forEach((p, i) => console.log(`  [${i}] ${p.url()}`));

  // Find XHS page from Playwright's list
  let page = allPages.find(p => p.url().includes('xiaohongshu.com'));

  if (!page) {
    // If Playwright doesn't see it, use the first available page and navigate
    console.log('Playwright cannot see XHS tab directly. Using first page...');
    page = allPages[0] || await context.newPage();
  }

  // 1. Navigate to profile (from the existing logged-in session)
  console.log('Navigating to profile...');
  await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);

  await page.screenshot({ path: `${SCREENSHOTS}/debug_profile.png` });
  console.log('Profile screenshot saved.');

  // Check if logged in
  const needsLogin = await page.locator('text=手机号登录').isVisible({ timeout: 2000 }).catch(() => false);
  const needsQR = await page.locator('text=REDNote APP').isVisible({ timeout: 1000 }).catch(() => false);
  const needsScan = await page.locator('text=扫码登录').isVisible({ timeout: 1000 }).catch(() => false);
  if (needsLogin || needsQR || needsScan) {
    console.log('ERROR: Not logged in or verification required. Check debug_profile.png');
    return;
  }

  // 2. Click first post
  console.log('Looking for first post...');
  const postSelectors = [
    'section.note-item',
    '.note-item',
    'a[href*="/explore/"]',
    'a[href*="/discovery/"]',
    '.cover',
  ];

  let firstPost = null;
  for (const sel of postSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      firstPost = el;
      console.log(`Found post: ${sel}`);
      break;
    }
  }

  if (!firstPost) {
    console.log('Could not find posts. Check debug_profile.png');
    return;
  }

  await firstPost.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOTS}/debug_post.png` });
  console.log('Post opened.');

  // 3. Find comment box (XHS uses contenteditable div, not textarea)
  console.log('Looking for comment box...');
  const commentSelectors = [
    '#content-textarea',
    '[placeholder*="说点什么"]',
    '[placeholder*="评论"]',
    '[contenteditable="true"]',
  ];

  // First click the placeholder overlay to activate the comment box
  const placeholder = page.locator('text=说点什么').first();
  if (await placeholder.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Clicking placeholder to activate comment box...');
    await placeholder.click({ force: true });
    await page.waitForTimeout(1000);
  }

  let commentBox = null;
  for (const sel of commentSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      commentBox = el;
      console.log(`Found comment box: ${sel}`);
      break;
    }
  }

  if (!commentBox) {
    const { writeFileSync } = await import('fs');
    writeFileSync(`${SCREENSHOTS}/debug_page.html`, await page.content());
    console.log('Could not find comment box. Saved debug_page.html + debug_post.png');
    return;
  }

  // 4. Type comment (click with force to bypass overlay, then keyboard.type for contenteditable)
  await commentBox.click({ force: true });
  await page.waitForTimeout(500);
  await page.keyboard.type(COMMENT_TEXT, { delay: 80 });
  await page.waitForTimeout(1000);
  console.log('Comment typed.');

  // 5. Submit
  console.log('Looking for submit button...');
  const submitBtn = page.locator('button:has-text("发送")').first();
  if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Found submit button, clicking...');
    await submitBtn.click();
  } else {
    console.log('No submit button, pressing Enter...');
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOTS}/comment_result.png` });
  console.log('Done! Screenshot: comment_result.png');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
