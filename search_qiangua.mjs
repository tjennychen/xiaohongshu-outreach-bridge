import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const contexts = browser.contexts();
let qgPage = null;

for (const ctx of contexts) {
  for (const page of ctx.pages()) {
    const url = page.url();
    if (url.includes('qian-gua.com')) {
      qgPage = page;
      break;
    }
  }
  if (qgPage) break;
}

if (!qgPage) {
  console.log('ERROR: No 千瓜 tab found');
  process.exit(1);
}

console.log('Found 千瓜 tab:', qgPage.url());

// Navigate to brand search for Dior
await qgPage.goto('https://app.qian-gua.com/#/brand/brandDetail?brandName=dior', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

// Wait for content to load
await qgPage.waitForTimeout(3000);

// Get the full page text
const text = await qgPage.evaluate(() => document.body.innerText);
console.log('=== PAGE TEXT ===');
console.log(text);
