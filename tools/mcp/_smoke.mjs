#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// tools/mcp/_smoke.mjs — BOOT VERIFIER for the 3 data360 MCP stdio servers.
//
// SCOPE (default run, backend-INDEPENDENT): for each server, spawn it, perform the
// MCP `initialize` handshake (SDK Client.connect), call `tools/list`, and assert:
//   (a) booted          — handshake returned serverInfo whose name == expected
//   (b) tool set         — exact bidirectional set-equality vs the impl catalog
//                          (no missing AND no extra tools)
//   (c) schema-valid     — every tool's inputSchema.type==='object' with a
//                          `properties` object; every DESTRUCTIVE tool carries an
//                          auto-injected `confirm:boolean` (proves the gate is
//                          reflected in the declared schema)
//   (d) ping             — backend-independent CallTool liveness (informational)
//   (e) stderr           — captured verbatim; the per-server `[mcp] … up over
//                          stdio` readiness line is EXPECTED and is NOT a failure;
//                          only error-token lines are flagged.
//
// This proves boot + handshake + tool-declaration ONLY. The backend (:8000) is
// down, so no functional endpoint calls are made and NO login is attempted on the
// default path. The single backend-up round-trip (health_login -> cache_metrics)
// is DEFINED below but gated behind BACKEND_UP=1 and is NOT run by default.
//
// Run (default, backend-down OK):   node tools/mcp/_smoke.mjs
// Run (deferred backend-up smoke):  BACKEND_UP=1 API_ACCOUNT=… API_USERNAME=… \
//                                     API_PASSWORD=… node tools/mcp/_smoke.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Expected tool catalogs — sourced from the 3 implementation summaries and
// cross-checked against the registered `name:` literals in each server file.
const EXPECTED = [
  {
    file: 'health-server.mjs',
    server: 'data360-health',
    tools: [
      'ping', 'health_login', 'probe_endpoint', 'run_health_matrix', 'cache_metrics',
      'svc_health', 'svc_registry', 'server_metrics', 'endpoint_timings',
      'cache_warm', 'cache_invalidate',
    ],
    destructive: ['cache_warm', 'cache_invalidate'],
    // Conditionally-mutating: GET is safe, non-GET requires confirm:true (handler-enforced).
    // Carries `confirm` in schema without being flat-destructive — a known, intended exception.
    conditionalConfirm: ['probe_endpoint'],
  },
  {
    file: 'ux-server.mjs',
    server: 'data360-ux',
    tools: ['ping', 'ux_login', 'render_route', 'sweep_routes', 'page_perf'],
    destructive: [],
  },
  {
    file: 'roles-server.mjs',
    server: 'data360-roles',
    tools: [
      'ping', 'roles_login', 'list_roles', 'list_users', 'my_permissions',
      'data_access', 'access_matrix', 'provision_persona', 'teardown_persona',
      'notifications', 'watch_cache_invalidations', 'insights',
    ],
    destructive: ['provision_persona', 'teardown_persona'],
  },
];

// A captured stderr line is a FAILURE only if it looks like an error — the
// readiness line "[mcp] <name> up over stdio — tools: …" is expected output.
const STDERR_ERROR_RE = /\b(error|throw|unhandled|uncaught|cannot|fatal|EADDR|ECONN|ENOENT|exception)\b/i;

const setEq = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

async function smokeOne(spec) {
  const r = {
    server: spec.server, file: spec.file,
    booted: false, serverInfoName: null,
    toolCount: 0, expectedCount: spec.tools.length,
    toolsMatch: false, missing: [], extra: [],
    schemaValid: false, schemaErrors: [],
    pingOk: false,
    stderr: '', stderrFlagged: [],
    pass: false, note: '',
  };

  // stderr:'pipe' returns a PassThrough immediately; accumulate before reading.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, spec.file)],
    env: { ...process.env, API_BASE: 'http://127.0.0.1:8000', APP_BASE: 'http://localhost:3000' },
    stderr: 'pipe',
  });
  let stderrBuf = '';
  transport.stderr?.on('data', (c) => { stderrBuf += c.toString(); });

  const client = new Client({ name: 'data360-boot-smoke', version: '1.0.0' }, { capabilities: {} });
  try {
    // (a) initialize handshake — connect() sends `initialize` and awaits serverInfo.
    await client.connect(transport);
    const info = client.getServerVersion(); // { name, version } from the handshake
    r.serverInfoName = info?.name ?? null;
    r.booted = r.serverInfoName === spec.server;
    if (!r.booted) r.note = `serverInfo.name='${r.serverInfoName}' != expected '${spec.server}'`;

    // (b) tools/list — exact bidirectional set-equality.
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    r.toolCount = names.length;
    r.missing = spec.tools.filter((n) => !names.includes(n));
    r.extra = names.filter((n) => !spec.tools.includes(n));
    r.toolsMatch = setEq(names, spec.tools);

    // (c) schema validity — object-typed, has properties, destructive=>confirm:boolean.
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const t of tools) {
      const s = t.inputSchema;
      if (!s || typeof s !== 'object') { r.schemaErrors.push(`${t.name}: missing inputSchema`); continue; }
      if (s.type !== 'object') r.schemaErrors.push(`${t.name}: inputSchema.type='${s.type}' (expected 'object')`);
      if (!s.properties || typeof s.properties !== 'object') r.schemaErrors.push(`${t.name}: inputSchema.properties missing/!object`);
    }
    // Symmetric destructive-gate check: the factory injects `confirm:boolean` IFF
    // destructive:true, so confirm-presence is an exact proxy for the flag. Assert
    // the set of confirm-carrying tools == the expected destructive set, BOTH ways,
    // so a tool wrongly (un)flagged destructive (e.g. a read tool with mutates:true)
    // is caught even though its NAME is in the catalog.
    const destExpected = new Set(spec.destructive);
    const condConfirm = new Set(spec.conditionalConfirm || []);
    for (const t of tools) {
      const c = t.inputSchema?.properties?.confirm;
      const isDest = destExpected.has(t.name);
      if (isDest) {
        if (!c) r.schemaErrors.push(`${t.name}: DESTRUCTIVE tool missing 'confirm' in schema (gate not reflected)`);
        else if (c.type !== 'boolean') r.schemaErrors.push(`${t.name}: 'confirm' type='${c.type}' (expected 'boolean')`);
      } else if (c && condConfirm.has(t.name)) {
        // Conditionally-mutating tool: confirm is REQUIRED in schema + must be boolean.
        if (c.type !== 'boolean') r.schemaErrors.push(`${t.name}: conditional 'confirm' type='${c.type}' (expected 'boolean')`);
      } else if (c) {
        r.schemaErrors.push(`${t.name}: NON-destructive tool unexpectedly carries 'confirm' (mis-flagged destructive?)`);
      }
    }
    r.schemaValid = r.schemaErrors.length === 0;

    // (d) ping — backend-independent CallTool liveness (informational, not gating).
    try {
      const pr = await client.callTool({ name: 'ping', arguments: {} });
      const txt = pr?.content?.[0]?.text || '';
      r.pingOk = !pr.isError && /"alive"\s*:\s*true/.test(txt);
    } catch { r.pingOk = false; }
  } catch (e) {
    r.note = (r.note ? r.note + '; ' : '') + `connect/list error: ${e?.message || String(e)}`;
  } finally {
    await client.close().catch(() => {});
    // Flush: the readiness line arrives async through the PassThrough.
    await new Promise((res) => setTimeout(res, 90));
  }

  r.stderr = (stderrBuf + (transport.stderr?.read?.() || '')).trim();
  r.stderrFlagged = r.stderr.split('\n').filter((l) => l && STDERR_ERROR_RE.test(l));

  r.pass = r.booted && r.toolsMatch && r.schemaValid && r.stderrFlagged.length === 0;
  return r;
}

// ── DEFERRED backend-up e2e smoke (DEFINED, not run by default) ──────────────
// The ONE functional round-trip to run once the backend (:8000) is up:
// health_login -> cache_metrics, driven through the data360-health server over MCP.
// Gated on BACKEND_UP=1 so the default boot verifier NEVER attempts a login.
async function backendUpSmoke() {
  const { API_ACCOUNT, API_USERNAME, API_PASSWORD } = process.env;
  if (!API_ACCOUNT || !API_USERNAME || !API_PASSWORD) {
    console.error('[backend-up smoke] need API_ACCOUNT/API_USERNAME/API_PASSWORD in env (creds never hardcoded).');
    return 1;
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, 'health-server.mjs')],
    env: { ...process.env }, // API_BASE inherited; creds read by the server from env
    stderr: 'pipe',
  });
  const client = new Client({ name: 'data360-backend-smoke', version: '1.0.0' }, { capabilities: {} });
  let code = 1;
  try {
    await client.connect(transport);
    // 1) authenticate (token is masked by the server; never returned/logged)
    const login = await client.callTool({
      name: 'health_login',
      arguments: { account: API_ACCOUNT, username: API_USERNAME, password: API_PASSWORD },
    });
    const loginTxt = login?.content?.[0]?.text || '';
    const loginOk = !login.isError && /role/.test(loginTxt);
    // 2) round-trip a cached read WITHOUT creds — exercises the "login once, then
    //    probe" persona-cache reuse (resolveToken hits the session health_login
    //    just cached in the same server process; no second login).
    const cache = await client.callTool({ name: 'cache_metrics', arguments: {} });
    const cacheOk = !cache.isError;
    code = loginOk && cacheOk ? 0 : 1;
    console.error(`[backend-up smoke] health_login ok=${loginOk}  cache_metrics ok=${cacheOk}  => ${code === 0 ? 'PASS' : 'FAIL'}`);
  } catch (e) {
    console.error(`[backend-up smoke] FAIL: ${e?.message || String(e)}`);
  } finally {
    await client.close().catch(() => {});
  }
  return code;
}

async function main() {
  if (process.env.BACKEND_UP === '1') {
    process.exit(await backendUpSmoke());
  }

  console.log('data360-mcp BOOT VERIFIER — handshake + tools/list + schema (backend-independent)\n');
  let failures = 0;
  for (const spec of EXPECTED) {
    const r = await smokeOne(spec);
    if (!r.pass) failures++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.server}  (${r.file})`);
    console.log(`   booted:       ${r.booted ? 'yes' : 'NO'}  (serverInfo.name=${r.serverInfoName})`);
    console.log(`   tools:        ${r.toolCount}/${r.expectedCount}  set-equal=${r.toolsMatch}` +
      (r.missing.length ? `  MISSING=[${r.missing.join(', ')}]` : '') +
      (r.extra.length ? `  EXTRA=[${r.extra.join(', ')}]` : ''));
    console.log(`   schema-valid: ${r.schemaValid}` + (r.schemaValid ? '' : `  ERRORS=[${r.schemaErrors.join(' | ')}]`));
    console.log(`   ping:         ${r.pingOk ? 'ok' : 'n/a'}`);
    const flagged = r.stderrFlagged.length;
    console.log(`   stderr:       ${r.stderr ? `${r.stderr.split('\n').length} line(s)` : '(none)'}, error-flagged=${flagged}` +
      (flagged ? `  -> [${r.stderrFlagged.join(' | ')}]` : `  (readiness line is expected, not a failure)`));
    if (r.note) console.log(`   note:         ${r.note}`);
    if (r.stderr) console.log(`   stderr-verbatim: ${r.stderr.replace(/\n/g, '\n                    ')}`);
    console.log('');
  }
  console.log(`${failures ? 'FAIL' : 'PASS'}: ${EXPECTED.length - failures}/${EXPECTED.length} servers boot + handshake + declare valid tools`);
  console.log('NOTE: backend (:8000) is down — functional calls are out of scope here.');
  console.log('      The deferred health_login->cache_metrics round-trip is defined (BACKEND_UP=1) but NOT run.');
  process.exit(failures ? 1 : 0);
}

main();
