import { chromium } from '@playwright/test';
const BASE='http://localhost:3000';
const PROJ='/explore-design?project_id=proj_25447131ab9e&view=catalog';
const SH='docs/product-readiness-audit/screens';
const b=await chromium.launch();
const ctx=await b.newContext({storageState:'e2e/.auth/state.json',viewport:{width:1600,height:1000}});
const p=await ctx.newPage();
const log=[];
await p.goto(`${BASE}${PROJ}`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(5000);
log.push('landed '+p.url().replace(BASE,''));
await p.screenshot({path:`${SH}/ed_01_initial.png`,fullPage:false});
// try select DB
async function pick(label){
  // try native select first
  const sel=p.locator('select').first();
  if(await sel.count()){ try{ await sel.selectOption({label}); return 'select:'+label; }catch{} }
  // custom dropdown: click the "No DB" / db combobox button then the option
  const combos=['button:has-text("No DB")','button:has-text("DB")','[class*="db" i] button','button:has-text("Select database")'];
  for(const c of combos){ const el=p.locator(c).first(); if(await el.count()){ try{ await el.click(); await p.waitForTimeout(700); const opt=p.locator(`[role="option"]:has-text("${label}"), li:has-text("${label}"), button:has-text("${label}")`).first(); if(await opt.count()){ await opt.click(); await p.waitForTimeout(1500); return 'combo:'+label; } }catch{} } }
  return 'NOTFOUND:'+label;
}
log.push('pickDB='+await pick('DRAFT_SOURCE'));
await p.waitForTimeout(2000);
log.push('pickSchema='+await pick('RETAIL_DW'));
await p.waitForTimeout(3500);
await p.screenshot({path:`${SH}/ed_02_after_select.png`,fullPage:false});
const srcCount=await p.locator('text=Source Tables').first().innerText().catch(()=>'?');
const tableRows=await p.locator('[class*="source" i] li, [class*="table" i] [draggable], aside li').count().catch(()=>0);
log.push('sourceHeader="'+srcCount+'" leftItems='+tableRows);
// capture deploy right tab sub-states
const deployBtns=['Review','Config','Checks','Dry Run','Diff','Impact','Deploy','Verify'];
for(const d of deployBtns){ const el=p.locator(`button:has-text("${d}"), [role="tab"]:has-text("${d}")`).first(); if(await el.count()){ try{ await el.click(); await p.waitForTimeout(900);}catch{} } }
await p.screenshot({path:`${SH}/ed_03_deploy_tab.png`,fullPage:false});
console.log(log.join('\n'));
await b.close();
