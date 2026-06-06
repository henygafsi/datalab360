import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('e2e/.auth', { recursive: true });
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport:{width:1600,height:1100} });
const p = await ctx.newPage();
const posts = [];
p.on('request', r => { if (r.method()==='POST') posts.push(r.url().replace('http://api.datalab360.io','')); });
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE_ERR', m.text().slice(0,160)); });

await p.goto('http://localhost:3000/signin', { waitUntil:'networkidle', timeout:40000 });
await p.waitForTimeout(2500);
await p.fill('input[name="account_name"]', 'HAHA');
await p.fill('input[name="username"]', 'HAHA');
await p.fill('input[name="password"]', 'NewSecurePassword123!');
await p.waitForTimeout(400);
// submit via Enter (lets React handler run) then fallback click
await p.locator('input[name="password"]').press('Enter');
await p.waitForTimeout(1500);
if (p.url().includes('/signin')) { await p.click('button[type="submit"]').catch(()=>{}); }
const landed = await p.waitForURL(u => !u.pathname.startsWith('/signin'), { timeout:25000 }).then(()=>true).catch(()=>false);
console.log('LANDED', landed, 'URL', p.url());
console.log('POSTS', JSON.stringify(posts));
if (landed) { await ctx.storageState({ path:'e2e/.auth/state.json' }); console.log('SAVED_STATE'); }
await b.close();
