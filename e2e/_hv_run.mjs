import fs from 'fs';
const JWT = fs.readFileSync('/tmp/jwt.txt','utf8').trim();
const BASE='http://localhost:8000';
const H={'Authorization':`Bearer ${JWT}`,'Content-Type':'application/json'};
const PID='proj_25447131ab9e';
const ACCT='UCHSFVB-HAHA';
const out={};
async function call(method,path,body){
  const t0=performance.now();
  const r=await fetch(BASE+path,{method,headers:H,body:body?JSON.stringify(body):undefined});
  const txt=await r.text(); const ms=+(performance.now()-t0).toFixed(1);
  let d; try{d=JSON.parse(txt)}catch{d=txt}
  return {status:r.status,ms,d};
}
const log=(...a)=>console.log(...a);

// warmup TCP/TLS
await call('GET','/admin/cache/svc-health');

// ===== PART 1: HIGH VOLUME INGESTION =====
const TGT=`HV_TGT_${Date.now()}`;
log('\n=== PART1 INGESTION === target',TGT);
const ing=await call('POST',`/explore-design/${PID}/ingestion/execute`,{
  source_database:'DRAFT_SOURCE',source_schema:'RETAIL_DW',source_table:'DIM_ITEMS',
  target_database:'DRAFT_SOURCE',target_schema:'RETAIL_DW',target_table:TGT,
  ingestion_mode:'full_refresh'});
log('ingest status',ing.status,'wall_ms',ing.ms);
log('ingest body:',JSON.stringify(ing.d).slice(0,1200));
out.ingest={status:ing.status,wall_ms:ing.ms,body:ing.d};

// verify rows landed
const ver=await call('POST','/workflow/run-sql',{sql:`SELECT COUNT(*) AS C FROM DRAFT_SOURCE.RETAIL_DW.${TGT}`});
log('verify count:',JSON.stringify(ver.d).slice(0,400));
out.verifyCount=ver.d;

// ===== PART 2: CACHE TIMING (cold vs warm) =====
log('\n=== PART2 CACHE TIMING ===');
const surfaces=[
  ['GET','/admin/cache/coverage'],
  ['GET','/gouvernance/d360-roles/my-permissions'],
  ['GET',`/explore-design/${PID}/versions?limit=20`],
  ['GET',`/explore-design/${PID}/ddl-actions`],
];
out.cacheTiming=[];
for(const [m,p] of surfaces){
  const a=await call(m,p);
  const b=await call(m,p);
  log(`${p}  cold=${a.ms}ms(${a.status})  warm=${b.ms}ms(${b.status})`);
  out.cacheTiming.push({path:p,cold_ms:a.ms,warm_ms:b.ms,status:a.status});
}

// ===== PART 3: CROSS-MODULE GOVERNANCE INVALIDATION =====
log('\n=== PART3 INVALIDATE-SURFACE ===');
// re-warm coverage then invalidate then re-time
await call('GET','/admin/cache/coverage');
const preInv=await call('GET','/admin/cache/coverage');
const inv=await call('POST','/admin/cache/invalidate-surface',{account:ACCT,page:'governance',module:'gouvernance',dry_run:false});
log('invalidate status',inv.status,'wall_ms',inv.ms,'body:',JSON.stringify(inv.d).slice(0,600));
const postPerm=await call('GET','/gouvernance/d360-roles/my-permissions');
const postPerm2=await call('GET','/gouvernance/d360-roles/my-permissions');
const postCov=await call('GET','/admin/cache/coverage');
log(`my-permissions  warm-before? n/a  post-invalidate cold=${postPerm.ms}ms(${postPerm.status})  re-warm=${postPerm2.ms}ms`);
out.invalidation={status:inv.status,body:inv.d,preInvCoverage_ms:preInv.ms,postPerm_cold_ms:postPerm.ms,postPerm_warm_ms:postPerm2.ms,postCoverage_ms:postCov.ms};

// ===== PART 4: MULTI-ROLE =====
log('\n=== PART4 MULTI-ROLE ===');
const roles=['ACCOUNTADMIN','BI_ANALYST','DATA_MODELER','BI_VIEWER','DATA_STEWARD'];
out.multiRole=[];
for(const role of roles){
  const a=await call('GET',`/gouvernance/d360-roles/${role}/permissions`);
  const b=await call('GET',`/gouvernance/d360-roles/${role}/permissions`);
  log(`d360-roles/${role}/permissions  cold=${a.ms}ms(${a.status})  warm=${b.ms}ms`);
  out.multiRole.push({role,endpoint:'d360-roles/{role}/permissions',cold_ms:a.ms,warm_ms:b.ms,status:a.status});
}
log('\n--- platform grants per role ---');
for(const role of ['ACCOUNTADMIN','BI_ANALYST','DATA_MODELER']){
  const a=await call('GET',`/api/platform/grants/role/${role}`);
  const b=await call('GET',`/api/platform/grants/role/${role}`);
  log(`platform/grants/role/${role}  cold=${a.ms}ms(${a.status})  warm=${b.ms}ms`);
  out.multiRole.push({role,endpoint:'platform/grants/role/{role}',cold_ms:a.ms,warm_ms:b.ms,status:a.status});
}

// ===== CLEANUP: DROP via ddl-actions =====
log('\n=== CLEANUP DROP via ddl-actions ===');
const queuedBefore=await call('GET',`/explore-design/${PID}/ddl-actions?status=PENDING`);
log('pending before:',JSON.stringify(queuedBefore.d).slice(0,500));
const drop=await call('POST',`/explore-design/${PID}/ddl-actions`,{
  ddl_sql:`DROP TABLE IF EXISTS DRAFT_SOURCE.RETAIL_DW.${TGT}`,
  ddl_type:'DROP_TABLE',description:`cleanup HV target ${TGT}`,target_table:TGT});
log('queue DROP status',drop.status,'body:',JSON.stringify(drop.d).slice(0,500));
out.dropQueue={status:drop.status,body:drop.d};
const eventId=drop.d&&(drop.d.event_id||drop.d.id||(drop.d.data&&(drop.d.data.event_id||drop.d.data.id)));
log('event_id:',eventId);
const exec=await call('POST',`/explore-design/${PID}/ddl-actions/execute`);
log('execute status',exec.status,'body:',JSON.stringify(exec.d).slice(0,600));
out.dropExec={status:exec.status,body:exec.d};
// verify gone
const gone=await call('POST','/workflow/run-sql',{sql:`SELECT COUNT(*) AS N FROM DRAFT_SOURCE.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='RETAIL_DW' AND TABLE_NAME='${TGT}'`});
log('exists-after-drop (0=gone):',JSON.stringify(gone.d).slice(0,400));
out.dropVerify=gone.d;

fs.writeFileSync('/tmp/hv_out.json',JSON.stringify(out,null,2));
log('\nDONE -> /tmp/hv_out.json');
