import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'https://datalab360-data360.vercel.app';
const ACC = 'uchsfvb-HAHA', USER = 'HAHA', PASS = process.env.DATA360_E2E_PASSWORD || '';
if (!PASS) { console.error('no pass'); process.exit(1); }

const PAGES = [
  '/account-overview',
  '/account-overview?tab=dwh-plan',
  '/governance',
  '/data-quality',
  '/bi-dashboard',
  '/intelligent',
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();

// login
let ok = false;
for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
  try {
    await p.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch(() => {});
    await p.waitForSelector('input[name="account_name"]', { timeout: 30000 });
    for (const [n, v] of [['account_name', ACC], ['username', USER], ['password', PASS]]) {
      const el = p.locator(`input[name="${n}"]`);
      await el.click(); await el.fill(''); await p.waitForTimeout(80);
      await el.pressSequentially(v, { delay: 40 }); await p.waitForTimeout(120);
    }
    await Promise.all([
      p.waitForURL(u => !u.toString().includes('/signin'), { timeout: 60000 }).catch(() => {}),
      p.click('button[type="submit"]'),
    ]);
    await p.waitForTimeout(5000);
    ok = !p.url().includes('/signin');
    console.log(`login attempt ${attempt}: url=${p.url().replace(BASE, '')} ok=${ok}`);
  } catch (e) { console.log(`login attempt ${attempt} err: ${String(e).slice(0, 140)}`); }
}
if (!ok) { console.log('LOGIN_FAILED'); await b.close(); process.exit(1); }
fs.mkdirSync('e2e/.auth', { recursive: true });
await ctx.storageState({ path: 'e2e/.auth/live-haha.json' });
console.log('SAVED live-haha auth\n');

// probe pages for real-data vs cache/error banners
const BAD = ['cache is being provisioned', 'cache is initializing', 'analytics cache is initializing',
  "couldn't load", 'could not load', 'warming up', 'being prepared', 'CACHE_NOT_READY'];
for (const path of PAGES) {
  try {
    await p.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(6000); // let client fetches resolve
    const body = (await p.locator('body').innerText().catch(() => '')) || '';
    const low = body.toLowerCase();
    const hits = BAD.filter(s => low.includes(s.toLowerCase()));
    const errCount = (low.match(/could not load|couldn't load|failed to/g) || []).length;
    const nums = (body.match(/\b\d[\d,.]*\b/g) || []).length; // rough "has data" signal
    const slug = path.replace(/[^a-z0-9]+/gi, '_');
    await p.screenshot({ path: `e2e/.auth/live_${slug}.png` }).catch(() => {});
    console.log(`${path}\n   banners=${hits.length ? hits.join('|') : 'none'} | errText=${errCount} | numericTokens=${nums} | len=${body.length}`);
  } catch (e) { console.log(`${path} ERR ${String(e).slice(0, 120)}`); }
}
await b.close();
console.log('\nPROBE_DONE');
