import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1100}});
const p=await ctx.newPage();
const bad=[];
p.on('response',(r)=>{ if(r.status()>=400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
await p.goto(`${BASE}/administration?tab=serverMetrics`,{waitUntil:'networkidle'}).catch(()=>{});
await p.waitForTimeout(7000);
console.log('=== >=400 responses ===');
console.log([...new Set(bad)].join('\n'));
// read Server Metrics total requests KPI from DOM
const txt = await p.locator('body').innerText().catch(()=> '');
const idx = txt.search(/total requests/i);
console.log('\n=== around "total requests" ===');
console.log(idx>=0 ? JSON.stringify(txt.slice(Math.max(0,idx-40), idx+60)) : 'not found');
// dump all KPI-ish lines
const m = txt.match(/[\d,]{2,}/g)||[];
console.log('\nUI big numbers:', [...new Set(m)].slice(0,30).join(', '));
await b.close();
