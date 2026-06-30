import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ storageState: 'e2e/.auth/state.json' });
const p = await c.newPage();
for (const path of ['/governance','/governance/policies','/governance/users','/governance/roles','/governance/grants','/governance/security-matrix']) {
  await p.goto('http://localhost:3001'+path,{waitUntil:'networkidle',timeout:60000}).catch(e=>null);
  await p.waitForTimeout(4000);
  const txt = (await p.locator('body').innerText().catch(()=>''))||'';
  const nf = txt.includes('Page not found');
  console.log(`${path}  finalUrl=${p.url().replace('http://localhost:3001','')}  notFound=${nf} len=${txt.length}`);
}
await b.close();
