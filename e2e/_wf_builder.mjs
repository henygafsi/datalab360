import { chromium } from '@playwright/test';
const root='/Users/datalab360/Documents/data360_pro/datalab360Front';
const out=[]; const errs=[]; const bad=[];
const b=await chromium.launch();
const ctx=await b.newContext({storageState:root+'/e2e/.auth/state.json'});
const p=await ctx.newPage();
p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
p.on('response',r=>{if(r.status()>=500)bad.push(r.status()+' '+r.url().replace('http://localhost:3000',''));});
await p.goto('http://localhost:3000/workflow',{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>out.push('goto-err '+e.message));
await p.waitForTimeout(4000);
// click a real non-DELETEME workflow
const item=p.getByText('SEED_WF_GOV_SCORE',{exact:false}).first();
let clicked=false;
try{ await item.click({timeout:8000}); clicked=true; }catch(e){ out.push('click-err '+e.message); }
await p.waitForTimeout(8000);
await p.screenshot({path:root+'/docs/product-readiness-audit/screens/module-green/workflow_builder.png',fullPage:false});
const body=await p.evaluate(()=>document.body.innerText);
const empties=['Could not load','Failed to load','Something went wrong','Error loading'].filter(s=>body.includes(s));
// look for builder-specific surfaces
const hasPalette=/Source|Transform|Filter|Join|Palette|block/i.test(body);
const hasCanvas=await p.evaluate(()=>!!document.querySelector('.react-flow, [data-testid="rf__wrapper"], canvas'));
out.push('clicked: '+clicked);
out.push('url: '+p.url());
out.push('bodyLen: '+body.length);
out.push('hasPaletteWords: '+hasPalette+' hasCanvas: '+hasCanvas);
out.push('emptyMarkers: '+JSON.stringify(empties));
out.push('5xx: '+JSON.stringify(bad.slice(0,12)));
out.push('consoleErrs: '+JSON.stringify(errs.slice(0,6)));
out.push('bodySample: '+body.replace(/\s+/g,' ').slice(0,500));
console.log(out.join('\n'));
await b.close();
