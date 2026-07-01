import fs from 'fs';
const JWT = fs.readFileSync('/tmp/jwt.txt','utf8').trim();
const BASE='http://localhost:8000';
const H={'Authorization':`Bearer ${JWT}`,'Content-Type':'application/json'};
const PID='proj_25447131ab9e';
async function j(method,path,body){
  const r=await fetch(BASE+path,{method,headers:H,body:body?JSON.stringify(body):undefined});
  const t=await r.text(); let d; try{d=JSON.parse(t)}catch{d=t}
  return {status:r.status,d};
}
// 1. verify project exists
const projs=await j('GET','/projects');
const arr=Array.isArray(projs.d)?projs.d:(projs.d.projects||projs.d.items||projs.d.data||[]);
const found=arr.find(p=>(p.id||p.project_id)===PID);
console.log('projects status',projs.status,'count',arr.length,'PID found:',!!found, found?(found.name||found.project_name):'');
// 2. find largest table in DRAFT_SOURCE.RETAIL_DW
const q=await j('POST','/workflow/run-sql',{sql:"SELECT TABLE_NAME, ROW_COUNT, BYTES FROM DRAFT_SOURCE.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='RETAIL_DW' ORDER BY ROW_COUNT DESC NULLS LAST LIMIT 25"});
console.log('run-sql status',q.status);
console.log(JSON.stringify(q.d).slice(0,2000));
