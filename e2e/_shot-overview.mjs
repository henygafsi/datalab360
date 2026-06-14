import { chromium } from '@playwright/test';
const ROOT='/Users/datalab360/Documents/data360_pro/datalab360Front';
const OUT=process.env.CLAUDE_JOB_DIR + '/tmp';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ storageState: ROOT+'/e2e/.auth/state.json', viewport:{width:1500,height:1300} });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/account-overview?tab=overview', { waitUntil:'domcontentloaded', timeout:45000 });
await p.waitForTimeout(40000);
const txt = await p.evaluate(()=>document.body.innerText);
console.log('OVERVIEW', JSON.stringify({
  top_problems: txt.includes('Top problèmes détectés'),
  critique: /critique/.test(txt),
  ouverts: /ouverts/.test(txt),
  key_metrics: txt.includes('Key metrics'),
  no_time_range: !txt.includes('Time Range'),
}));
await p.screenshot({ path: OUT+'/overview.png', clip:{x:230,y:120,width:1270,height:620} });
console.log('SHOT', OUT+'/overview.png');
await b.close();
