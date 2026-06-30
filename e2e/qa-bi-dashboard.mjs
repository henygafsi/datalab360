import { chromium } from '@playwright/test';

const STATE = '/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const SHOT = '/Users/datalab360/Documents/data360_pro/datalab360Front/docs/product-readiness-audit/screens/qa/bi-dashboard.png';
const consoleErrors = [];
const netErrors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STATE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().split(String.fromCharCode(10))[0].slice(0,160)); });
page.on('response', r => { if (r.status() >= 400) netErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`); });

await page.goto('http://localhost:3000/bi-dashboard', { waitUntil: 'domcontentloaded' });

// poll for real content
let ok = false;
for (let i = 0; i < 50; i++) {
  const t = await page.locator('body').innerText().catch(()=> '');
  if (/BI Dashboard|Self-service analytics|No BI Dashboard/i.test(t)) { ok = true; break; }
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(2500);

const bodyText = await page.locator('body').innerText().catch(()=> '');
const h1 = await page.locator('h1').first().innerText().catch(()=> 'NONE');
const isSignin = /sign ?in|log ?in/i.test(h1);

// Enumerate buttons
const buttons = await page.locator('button:visible').evaluateAll(els =>
  els.map(e => (e.getAttribute('aria-label') || e.innerText || e.title || '').trim()).filter(Boolean)
);
// Links
const relatedLinks = await page.locator('a:visible').evaluateAll(els =>
  els.map(e => ({ t: (e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,40), href: e.getAttribute('href') })).filter(x => x.t)
);

// project cards count
const projectCards = await page.locator('a[href^="/bi-dashboard/"]').count();
// score cards
const scoreText = await page.locator('text=/score|quality|governance|freshness|coverage/i').count().catch(()=>0);

await page.screenshot({ path: SHOT, fullPage: true });

// Try clicking "New Dashboard" to open modal (read-only, just opens panel)
let modalOpened = false;
try {
  await page.getByRole('button', { name: /New Dashboard/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(1000);
  modalOpened = await page.locator('text=/Dashboard name/i').count() > 0;
  // close
  await page.getByRole('button', { name: /Cancel/i }).first().click({ timeout: 2000 }).catch(()=>{});
} catch(e) { modalOpened = 'ERR:'+e.message.slice(0,60); }

// Try Auto-create
let autoOpened = false;
try {
  await page.getByRole('button', { name: /Auto-create/i }).first().click({ timeout: 3000 });
  await page.waitForTimeout(1000);
  autoOpened = await page.locator('text=/schema|table|Generate|source/i').count() > 0;
} catch(e) { autoOpened = 'ERR:'+e.message.slice(0,60); }

console.log('=== RESULT ===');
console.log('contentLoaded:', ok, '| isSignin:', isSignin);
console.log('h1:', h1);
console.log('projectCards:', projectCards, '| scoreCardMatches:', scoreText);
console.log('buttons:', JSON.stringify([...new Set(buttons)]));
console.log('relatedLinks:', JSON.stringify(relatedLinks.filter(l=>l.href && !l.href.startsWith('/bi-dashboard/')).slice(0,12)));
console.log('newDashboardModalOpened:', modalOpened);
console.log('autoCreateModalOpened:', autoOpened);
console.log('bodySnippet:', bodyText.replace(/\n+/g,' | ').slice(0, 600));
console.log('=== CONSOLE ERRORS ('+consoleErrors.length+') ===');
console.log(consoleErrors.slice(0,15).join('\n'));
console.log('=== NET >=400 ('+netErrors.length+') ===');
console.log([...new Set(netErrors)].slice(0,25).join('\n'));

await browser.close();
