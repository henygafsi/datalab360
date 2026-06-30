import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({ storageState: 'e2e/.auth/state.json' });
const p = await c.newPage();
for (const path of ['/governance/policies','/governance/users','/governance/roles','/governance/grants','/governance/security-matrix']) {
  const r = await p.goto('http://localhost:3001'+path,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>null);
  await p.waitForTimeout(1500);
  const txt = (await p.locator('body').innerText().catch(()=>''))||'';
  const nf = txt.includes('Page not found');
  console.log(`${r?r.status():'ERR'} ${path}  notFound=${nf} len=${txt.length}`);
}
await b.close();
