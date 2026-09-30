import { chromium } from '@playwright/test';
const ACCOUNT = process.env.D360_ACCOUNT, USER = process.env.D360_USER, PASS = process.env.D360_PASS;
const PAGES = ['/governance', '/governance/roles', '/data-quality', '/workflow', '/explore-design',
               '/observability', '/account-overview', '/bi-dashboard', '/studio'];
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto('http://localhost:3000/signin', { waitUntil: 'domcontentloaded' });
await p.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT);
await p.locator('input[name="username"], input#username').first().fill(USER);
await p.locator('input[type="password"]').first().fill(PASS);
await p.locator('button[type="submit"]').first().click();
for (let i = 0; i < 90; i++) { const s = await p.request.get('http://localhost:3000/api/auth/session').then(r=>r.json()).catch(()=>null); if (s?.user?.access_token) { console.log('role', s.user.role, '| modules', (s.user.items||[]).length); break; } await p.waitForTimeout(1000); }
for (const url of PAGES) {
  await p.goto('http://localhost:3000' + url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(700);
  const final = new URL(p.url()).pathname + new URL(p.url()).search;
  const gated = final.startsWith("/signin") || final.includes("denied=");
  console.log(`  ${url.padEnd(24)} → ${gated ? 'BLOCKED' : 'allowed'}  ${final.slice(0, 60)}`);
}
await b.close();
