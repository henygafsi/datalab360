/**
 * _selects-probe — diagnose the « text half-displayed in every select box »
 * report: screenshots + computed styles of representative <select> and
 * rizzui/react-select controls across pages. Run:
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') node e2e/_selects-probe.mjs
 * Outputs to e2e/results/selects/.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'e2e/results/selects';
mkdirSync(OUT, { recursive: true });
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
if (!PASS) {
  console.error('D360_PASS required');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto('http://localhost:3000/signin', { waitUntil: 'domcontentloaded' });
await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
await page.locator('input[name="username"], input#username').first().fill(USER);
await page.locator('input[type="password"]').first().fill(PASS);
await page.locator('button[type="submit"]').first().click();
for (let i = 0; i < 45; i++) {
  const ok = await page
    .request.get('http://localhost:3000/api/auth/session')
    .then((r) => r.json())
    .then((s) => Boolean(s?.user?.access_token))
    .catch(() => false);
  if (ok) break;
  await page.waitForTimeout(2000);
}

const PAGES = [
  ['sources-objects', 'http://localhost:3000/studio/source?view=objects'],
  ['workspace', 'http://localhost:3000/studio/apps/proj_576e16333cdf?view=data'],
  ['governance', 'http://localhost:3000/governance'],
  ['bi', 'http://localhost:3000/bi-dashboard'],
];

for (const [name, url] of PAGES) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const info = await page.evaluate(() => {
      const out = [];
      const els = [
        ...document.querySelectorAll('select'),
        ...document.querySelectorAll('[class*="rizzui-select"], [class*="react-select"], [role="combobox"]'),
      ].slice(0, 8);
      for (const el of els) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out.push({
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 140),
          text: (el.selectedOptions?.[0]?.text ?? el.textContent ?? '').slice(0, 40),
          rect: { w: Math.round(r.width), h: Math.round(r.height) },
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          overflow: cs.overflow,
          appearance: cs.appearance,
          boxSizing: cs.boxSizing,
        });
      }
      return out;
    });
    console.log(`\n== ${name}`);
    for (const i of info) console.log(JSON.stringify(i));
    const sel = page.locator('select').first();
    if (await sel.isVisible().catch(() => false)) {
      await sel.screenshot({ path: `${OUT}/${name}-select.png` }).catch(() => {});
    }
    await page.screenshot({ path: `${OUT}/${name}-page.png` });
  } catch (e) {
    console.log(`== ${name} FAILED: ${e.message}`);
  }
}
await browser.close();
console.log('done → e2e/results/selects/');
