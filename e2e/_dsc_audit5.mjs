import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json'});
const p=await ctx.newPage();
const e5=[], connect=[];
p.on('response',x=>{const u=x.url();const s=x.status(); if(s>=500)e5.push(s+' '+u.slice(-60)); if(u.includes('/connect/')||u.includes('source-catalog')||u.includes('common/databases'))connect.push(s+' '+(u.match(/(connect\/[^?]*|source-catalog|common\/databases)/)||[''])[0]);});
// warm compile
await p.goto(`${BASE}/data-source-connection`,{waitUntil:'domcontentloaded'}).catch(()=>{});
await p.waitForTimeout(9000);
// reload now that route is compiled -> fresh chunk hashes
await p.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
await p.waitForTimeout(9000);
const bl=await p.evaluate(()=>document.body.innerText.length);
const body=await p.evaluate(()=>document.body.innerText);
const headings=await p.evaluate(()=>[...document.querySelectorAll('h1,h2,h3')].map(x=>x.innerText.trim()).filter(Boolean).slice(0,14));
const connectorWords=['Snowflake','Azure','AWS','PostgreSQL','MySQL','GCS','S3','Oracle','Stage','Datalake','Catalog'].filter(w=>body.includes(w));
await p.screenshot({path:'docs/product-readiness-audit/screens/module-green/data-source-connection.png',fullPage:true});
console.log('bodyLen',bl);
console.log('headings',JSON.stringify(headings));
console.log('connectorWordsVisible',JSON.stringify(connectorWords));
console.log('connectCalls',JSON.stringify([...new Set(connect)]));
console.log('5xx',JSON.stringify(e5));
console.log('BODYSNIP',body.replace(/\s+/g,' ').slice(0,800));
await b.close();
