import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, '.auth', 'state-minted.json');
const BASE = 'http://localhost:3000';
const SHOTDIR = path.join(__dirname, '..', 'docs', 'product-readiness-audit', 'screens', 'qa');
const ROUTES = (process.argv[2] || 'policies,roles,users,grants,security-matrix,oauth,projects').split(',');
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

const browser = await chromium.launch({ headless:true });
const ctx = await browser.newContext({ storageState: STATE, viewport:{width:1500,height:1000} });

for (const r of ROUTES) {
  const page = await ctx.newPage();
  const bad = [], cerr = [], perr = [];
  page.on('response', resp => { const s=resp.status(); if(s>=400){ const u=resp.url(); if(!/_next|favicon|hot-update/.test(u)) bad.push(`${s} ${resp.request().method()} ${u.replace(BASE,'')}`);} });
  page.on('console', m => { if(m.type()==='error'){ const t=m.text(); if(!/extension|favicon|hydration|Download the React/.test(t)) cerr.push(t.slice(0,180)); } });
  page.on('pageerror', e => perr.push(e.message.slice(0,180)));
  const url = `${BASE}/governance/${r}`;
  let finalUrl='', bodyLen=0, h1='', signin=false, errBoundary=false;
  try {
    await page.goto(url, { waitUntil:'domcontentloaded', timeout:60000 });
    // poll for content
    for (let i=0;i<25;i++){
      finalUrl = page.url();
      const txt = await page.evaluate(()=>document.body.innerText).catch(()=>'');
      bodyLen = txt.length;
      signin = /sign in|log ?in to|authentication required/i.test(txt) && bodyLen<400;
      errBoundary = /something went wrong|client-side exception|application error/i.test(txt);
      if (bodyLen>600 && !/^\s*$/.test(txt)) break;
      await sleep(2000);
    }
    h1 = await page.evaluate(()=>{ const e=document.querySelector('h1,h2'); return e?e.textContent.trim().slice(0,80):''; }).catch(()=>'');
    await sleep(1500);
    await page.screenshot({ path: path.join(SHOTDIR, `governance-${r}.png`), fullPage:true }).catch(()=>{});
  } catch(e){ perr.push('GOTO:'+e.message.slice(0,120)); }
  // enumerate buttons
  const btns = await page.$$eval('button', els=>els.map(b=>({t:(b.textContent||'').trim().slice(0,40), d:b.disabled, title:(b.getAttribute('title')||'').slice(0,60)})).filter(b=>b.t)).catch(()=>[]);
  const btnSummary = {};
  for(const b of btns){ const k=b.t||'(icon)'; if(!btnSummary[k]) btnSummary[k]={n:0,disabled:0,title:b.title}; btnSummary[k].n++; if(b.d)btnSummary[k].disabled++; }
  console.log(`\n##### /governance/${r}`);
  console.log(`final=${finalUrl.replace(BASE,'')} bodyLen=${bodyLen} h1="${h1}" signin=${signin} errBoundary=${errBoundary}`);
  console.log(`buttons(${btns.length}): ` + Object.entries(btnSummary).map(([k,v])=>`${k}${v.disabled?`[${v.disabled}/${v.n} disabled]`:''}`).join(' | ').slice(0,1200));
  if(bad.length) console.log('NET>=400:\n  '+[...new Set(bad)].join('\n  '));
  if(cerr.length) console.log('CONSOLE.ERR:\n  '+[...new Set(cerr)].join('\n  '));
  if(perr.length) console.log('PAGEERR:\n  '+[...new Set(perr)].join('\n  '));
  await page.close();
}
await browser.close();
console.log('\nDONE');
