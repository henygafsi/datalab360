import { chromium } from '@playwright/test';
const ROOT='/Users/datalab360/Documents/data360_pro/datalab360Front';
const OUT=process.env.CLAUDE_JOB_DIR + '/tmp';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ storageState: ROOT+'/e2e/.auth/state.json', viewport:{width:1500,height:900} });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/account-overview?tab=finops', { waitUntil:'domcontentloaded', timeout:45000 });
await p.waitForTimeout(28000);
const txt = await p.evaluate(()=>document.body.innerText);
console.log('HEADER_CHECK', JSON.stringify({
  time_range: txt.includes('Time Range'),
  static_filters_row: /Filters\s+Project Type/.test(txt) || txt.includes('Environment') && txt.includes('Project Type'),
  has_project_type: txt.includes('Project Type'),
  has_clear_all: txt.includes('Clear all'),
}));
await p.screenshot({ path: OUT+'/hdr.png', clip:{x:230,y:120,width:1270,height:340} });
console.log('SHOT', OUT+'/hdr.png');
await b.close();
