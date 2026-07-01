import { chromium } from '@playwright/test';
const BASE='http://localhost:3000', STATE='/Users/datalab360/Documents/data360_pro/datalab360Front/e2e/.auth/state-minted.json';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:STATE,viewport:{width:1700,height:1050}});
const p=await ctx.newPage();
const errs=[];
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,90));});
await p.goto(`${BASE}/data-products`,{waitUntil:'domcontentloaded',timeout:120000}).catch(()=>{});
let trust='—';
for(let i=0;i<26;i++){await p.waitForTimeout(1800);
  trust=await p.evaluate(()=>{const c=[...document.querySelectorAll('*')].find(e=>e.textContent&&e.textContent.trim()==='TRUST SCORE');if(!c)return '?';let n=c.parentElement;for(let d=0;d<4&&n;d++){const m=n.textContent.match(/\b(\d{1,3})\b/);if(m)return m[1];n=n.parentElement;}return '—';}).catch(()=>'?');
  if(trust!=='—'&&trust!=='?')break;}
const buttonInButton = errs.filter(e=>/descendant of|cannot be a descendant|button.*button/i.test(e)).length;
console.log('button-in-button hydration errors:', buttonInButton, '(target 0)');
console.log('data-products Trust Score:', trust, '(expect 82)');
console.log('other console errors:', errs.length);
await p.screenshot({path:'docs/product-readiness-audit/screens/qa/p1_data_products.png'});
await b.close();
