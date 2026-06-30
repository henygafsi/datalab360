import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1100}});
const p=await ctx.newPage();
await p.goto(`${BASE}/administration?tab=serverMetrics`,{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForTimeout(8000);
const txt = await p.locator('body').innerText().catch(()=> '');
// UI total: the "N total" sub under Requests / min
const mTotal = txt.match(/([\d,]+)\s+total/i);
const uiTotal = mTotal ? Number(mTotal[1].replace(/,/g,'')) : null;
// UI active user line "HAHA 6578"
const mUser = txt.match(/HAHA\s*([\d,]+)/i);
const uiHaha = mUser ? Number(mUser[1].replace(/,/g,'')) : null;
// backend at same moment
const jwt = readFileSync('/tmp/jwt.txt','utf8').trim();
const be = JSON.parse(execSync(`curl -s -H "Authorization: Bearer ${jwt}" http://localhost:8000/admin/server-metrics`).toString());
console.log('UI total requests:', uiTotal);
console.log('BE total_requests :', be.total_requests);
console.log('UI HAHA requests  :', uiHaha);
console.log('BE active_users   :', JSON.stringify(be.active_users));
console.log('uptime_s BE       :', be.uptime_seconds, 'error_rate BE:', be.error_rate);
await b.close();
