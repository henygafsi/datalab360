// Verify the SSE singleton: count /cache-stream/stream connections across login + navigations.
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3000';
const PASS = process.env.DATA360_E2E_PASSWORD || '';
const p = await chromium.launch();
const page = await (await p.newContext()).newPage();
let sse = 0;
page.on('request', r => { if (r.url().includes('/cache-stream/stream')) { sse++; console.log('  SSE open #' + sse, '->', r.url().replace(BASE,'')); } });
try {
  await page.goto(`${BASE}/signin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="account_name"]', { timeout: 20000 });
  for (const [n,v] of [['account_name','uchsfvb-HAHA'],['username','HAHA'],['password',PASS]]) {
    const el = page.locator(`input[name="${n}"]`);
    for (let a=0;a<4;a++){ await el.click(); await el.fill(''); await page.waitForTimeout(60); await el.pressSequentially(v,{delay:55}); await page.waitForTimeout(120); if((await el.inputValue().catch(()=>''))===v) break; }
  }
  await page.click('button[type="submit"]');
  await page.waitForURL(u=>!u.toString().includes('/signin'),{timeout:45000}).catch(()=>{});
  await page.waitForTimeout(5000);
  console.log(`after login: ${sse} SSE connection(s)`);
  for (const route of ['/governance/security-matrix','/data-products','/observability','/account-overview']) {
    await page.goto(`${BASE}${route}`, { waitUntil:'domcontentloaded' }).catch(()=>{});
    await page.waitForTimeout(5000);
    console.log(`after nav ${route}: ${sse} SSE connection(s) total`);
  }
  console.log(`\nTOTAL /cache-stream/stream opens across login + 4 navigations: ${sse}  (singleton target: 1; pre-fix: ~5 per page)`);
} catch(e){ console.log('FATAL', String(e).slice(0,200)); }
finally { await p.close(); }
