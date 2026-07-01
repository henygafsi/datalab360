import fs from 'fs';
const st = JSON.parse(fs.readFileSync('e2e/.auth/state.json','utf8'));
const toks=[...JSON.stringify(st).matchAll(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g)].map(m=>m[0]).sort((a,b)=>a.length-b.length);
const JWT=toks[toks.length-1];
const BASE='http://localhost:8000';
const H={Authorization:`Bearer ${JWT}`,'Content-Type':'application/json'};
const DB='CP_DATA360';
const eps=[
 ['/cortex/kpis'],
 ['/cortex/models'],
 [`/cortex/agents?database=${DB}`],
 [`/cortex/semantic-views?database=${DB}`],
 [`/cortex/vectors/columns?database=${DB}`],
 ['/cortex/semantic-models/list'],
 ['/cortex/ml/classification/models'],
 ['/cortex/ml/document-ai/models'],
 ['/cortex/ml/finetune/jobs'],
 ['/cortex/ml/top-insights'],
 ['/cortex/snowpark/compute-pools'],
 ['/cortex/snowpark/services'],
 ['/cortex/snowpark/streamlit'],
 ['/cortex/snowpark/image-repos'],
 ['/cortex/query-analytics/results'],
 ['/cortex/query-analytics/summary'],
 ['/cortex/query-analytics/redundant-groups'],
 ['/cortex/duckdb/datasets'],
 ['/cortex/explore/databases'],
 [`/cortex/explore/schemas?database=${DB}`],
 ['/cortex/conversations?limit=10'],
 ['/api/recommendations/?module=intelligent&limit=10'],
];
const out=[];
for(const [path] of eps){
  try{
    const r=await fetch(BASE+path,{headers:H});
    let body=''; try{body=await r.text();}catch{}
    out.push({path,status:r.status,len:body.length,snippet:body.slice(0,160).replace(/\s+/g,' ')});
  }catch(e){ out.push({path,status:0,err:String(e).slice(0,80)}); }
}
for(const o of out) console.log(`${o.status}\t${o.path}\t${o.len??''}\t${o.snippet??o.err??''}`);
fs.writeFileSync('e2e/_audit_intelligent_results.json',JSON.stringify(out,null,2));
