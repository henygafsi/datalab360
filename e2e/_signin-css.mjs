import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:1400,height:900}}); // NO auth, fresh
const p=await ctx.newPage();
const css=[], failed=[];
p.on('response',r=>{const u=r.url(); if(u.includes('.css')) css.push(r.status()+' '+u.split('/').pop()); if(r.status()>=400) failed.push(r.status()+' '+u.replace(BASE,'').split('?')[0]);});
await p.goto(`${BASE}/signin`,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('nav',e.message));
await p.waitForTimeout(4000);
// check if a known element has Tailwind styling applied
const styled = await p.evaluate(()=>{
  const btn=document.querySelector('button[type="submit"]')||document.querySelector('button');
  if(!btn) return {found:false};
  const cs=getComputedStyle(btn);
  return {found:true, bg:cs.backgroundColor, radius:cs.borderRadius, padding:cs.padding, hasTailwind: cs.backgroundColor!=='rgba(0, 0, 0, 0)'};
});
console.log('CSS responses:', css.length, css.slice(0,6).join(' | '));
console.log('failed responses:', failed.length, [...new Set(failed)].slice(0,8).join(' | '));
console.log('submit button styled:', JSON.stringify(styled));
await p.screenshot({path:'docs/product-readiness-audit/screens/admin-green/_signin_test.png'});
await b.close();
