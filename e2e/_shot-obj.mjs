import { chromium } from '@playwright/test';
const ROOT='/Users/datalab360/Documents/data360_pro/datalab360Front';
const OUT=process.env.CLAUDE_JOB_DIR + '/tmp';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ storageState: ROOT+'/e2e/.auth/state.json', viewport:{width:1500,height:1600} });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/account-overview?tab=snowflake-objects', { waitUntil:'domcontentloaded', timeout:45000 });
await p.waitForTimeout(7000);
const txt = await p.evaluate(()=>document.body.innerText);
console.log('OBJ', JSON.stringify({
  storage_audit: txt.includes('Stockage par table'),
  table_storage_metrics: txt.includes('TABLE_STORAGE_METRICS'),
  ligne: /ligne/.test(txt),
  database_name: /Database Name|Total Tb|Active Bytes/i.test(txt),
}));
await p.screenshot({ path: OUT+'/obj.png', fullPage:true });
console.log('SHOT', OUT+'/obj.png');
await b.close();
