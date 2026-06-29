// UI validation — log in as HAHA, visit key fixed surfaces, screenshot, assert clear display.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ACCOUNT = 'uchsfvb-HAHA', USER = 'HAHA', PASS = process.env.DATA360_E2E_PASSWORD || '';
const OUT = process.env.SHOT_DIR || '/tmp';

const ROUTES = [
  { name: 'security-matrix', path: '/governance/security-matrix', expect: 'A13 batch save' },
  { name: 'data-products',   path: '/data-products',              expect: 'A12 refresh' },
  { name: 'profile',         path: '/profile',                    expect: 'A9 profile' },
];

const p = await chromium.launch();
const ctx = await p.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
const failed = [];
page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace('http://localhost:3000','')}`); });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push((e.stack || e.message || String(e)).split('\n').slice(0, 4).join(' | ')));

try {
  // --- login ---
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="account_name"]', { timeout: 20000 });
  // RHF needs real keystrokes — fill() didn't register. Click + type each field.
  for (const [name, val] of [['account_name', ACCOUNT], ['username', USER], ['password', PASS]]) {
    const el = page.locator(`input[name="${name}"]`);
    for (let attempt = 0; attempt < 4; attempt++) {
      await el.click();
      await el.fill('');                 // reliable clear (one-shot empty)
      await page.waitForTimeout(80);
      await el.pressSequentially(val, { delay: 55 });
      await page.waitForTimeout(150);
      const cur = await el.inputValue().catch(() => '');
      if (cur === val) break;
    }
  }
  await page.waitForTimeout(300);
  const vals = await page.evaluate(() => ['account_name','username','password'].map(n => (document.querySelector(`input[name="${n}"]`)||{}).value?.length||0));
  console.log('field value lengths:', vals);
  const [resp] = await Promise.all([
    page.waitForResponse(r => /\/api\/auth\/(callback|signin)/.test(r.url()), { timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  if (resp) console.log('auth response:', resp.status(), resp.url().split('/').slice(-2).join('/'));
  await page.waitForURL(u => !u.toString().includes('/signin'), { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const errText = await page.locator('[role="alert"], .text-red-700, .text-red-500').first().innerText().catch(() => '');
  console.log('LOGIN: landed at', page.url(), errText ? '| formError: ' + errText.slice(0, 80) : '');

  for (const r of ROUTES) {
    const before = errors.length;
    failed.length = 0; pageErrors.length = 0;
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    // dev-mode first compile can be slow; wait for network to settle + content
    await page.waitForTimeout(7000);
    const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
    const errorBoundary = /something went wrong|application error|unhandled|stack trace|TypeError|undefined is not/i.test(bodyText);
    const shot = `${OUT}/ui_${r.name}.png`;
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    console.log(`ROUTE ${r.name} (${r.path}) [${r.expect}]: url=${page.url()} | textLen=${bodyText.length} | errorBoundary=${errorBoundary} | failedReqs=[${failed.slice(0,4).join(' ; ')}] | pageErrors=[${pageErrors.slice(0,2).join(' ;; ')}]`);
  }
} catch (e) {
  console.log('FATAL', String(e).slice(0, 300));
} finally {
  if (errors.length) console.log('CONSOLE ERRORS (sample):', errors.slice(0, 6).join(' || '));
  await p.close();
}
