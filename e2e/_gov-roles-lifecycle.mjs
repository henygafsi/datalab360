// Governance data-roles LIFECYCLE e2e — real CRUD + grant against the live
// HAHA / ACCOUNTADMIN account, through the SAME proxy the app uses.
//
// Proves the full admin-intelligence flow end to end:
//   create role → create user → grant role to user → verify grant →
//   (bulk) revoke → cleanup (delete user, delete role).
// Every call carries the saved session's bearer token, so it exercises the real
// backend → warehouse path exactly as the UI does — no fake ids, no mint.
//
// SAFE BY DESIGN:
//   • Test objects are clearly namespaced (D360TEST_*) and ALWAYS cleaned up in
//     a finally block, even on assertion failure.
//   • Read-back uses the real endpoints (getUsers / getRolesForUser) to PROVE
//     the mutation landed, not just that the POST returned 200.
//   • No security-setting changes. No network-policy edits. Localhost only.
//
// Run AFTER refreshing the session:
//   DATA360_E2E_PASSWORD='…' node e2e/_login-robust.mjs   # prints SAVED_STATE
//   node e2e/_gov-roles-lifecycle.mjs
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const PROXY = `${BASE}/api-proxy`;
// Unique, obviously-disposable names (uppercase = valid SF identifiers).
const STAMP = String(Date.now()).slice(-8);
const ROLE = `D360TEST_ROLE_${STAMP}`;
const USER = `D360TEST_USER_${STAMP}`;

// ── Pull the bearer token out of the saved Playwright storage state ──────────
function bearer() {
  const state = JSON.parse(readFileSync('e2e/.auth/state.json', 'utf8'));
  const entries = (state.origins ?? []).flatMap((o) => o.localStorage ?? []);
  // The app stores the Snowflake access token in localStorage; find the JWT.
  const jwt = entries
    .map((e) => e.value)
    .find((v) => typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\./.test(v));
  if (jwt) return jwt;
  // Some builds nest it inside a JSON blob (e.g. next-auth session) — dig one level.
  for (const e of entries) {
    try {
      const obj = JSON.parse(e.value);
      const hit = JSON.stringify(obj).match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      if (hit) return hit[0];
    } catch { /* not json */ }
  }
  throw new Error('No bearer token in e2e/.auth/state.json — run _login-robust.mjs first.');
}

const TOKEN = bearer();
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

async function call(method, path, body) {
  const res = await fetch(`${PROXY}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

const log = (m) => console.log(m);
const pass = [], fail = [];
const assert = (cond, label, detail) => {
  if (cond) { pass.push(label); log(`  ✅ ${label}`); }
  else { fail.push(`${label} — ${detail ?? ''}`); log(`  ❌ ${label} — ${detail ?? ''}`); }
};

log(`\n=== GOVERNANCE LIFECYCLE as HAHA/ACCOUNTADMIN — role=${ROLE} user=${USER} ===\n`);

try {
  // 1) Sanity: token authenticates against a known-good read.
  log('· precheck: list roles (auth check)');
  const roles0 = await call('GET', '/gouvernance/roles');
  assert(roles0.ok, 'auth: GET /gouvernance/roles 2xx', `status=${roles0.status} ${JSON.stringify(roles0.data).slice(0, 160)}`);
  if (!roles0.ok) throw new Error('auth failed — refresh the session and retry');

  // 2) CREATE ROLE
  log('· create role');
  const cr = await call('POST', '/gouvernance/add-role', { role_name: ROLE, comment: 'data360 e2e lifecycle test' });
  assert(cr.ok, 'create role 2xx', `status=${cr.status} ${JSON.stringify(cr.data).slice(0, 160)}`);

  // 3) CREATE USER
  log('· create user');
  const cu = await call('POST', '/gouvernance/add-user', {
    username: USER, password: `Aa1!${STAMP}xZ`, first_name: 'D360', last_name: 'Test',
    default_role: 'PUBLIC',
  });
  assert(cu.ok, 'create user 2xx', `status=${cu.status} ${JSON.stringify(cu.data).slice(0, 160)}`);

  // 4) GRANT ROLE → USER (the headline assign)
  log('· grant role to user');
  const gr = await call('POST', '/gouvernance/assign-role', { username: USER, role_name: ROLE });
  assert(gr.ok, 'assign-role 2xx', `status=${gr.status} ${JSON.stringify(gr.data).slice(0, 160)}`);

  // 5) VERIFY the grant via read-back (proves it landed in the warehouse)
  log('· verify grant (read-back)');
  const rfu = await call('GET', `/gouvernance/roles-for-user/${encodeURIComponent(USER)}`);
  const rolesForUser = JSON.stringify(rfu.data).toUpperCase();
  assert(rfu.ok && rolesForUser.includes(ROLE), 'role appears in user\'s roles', `status=${rfu.status} body=${rolesForUser.slice(0, 200)}`);

  // 6) REVOKE (the new unassign path)
  log('· revoke role from user');
  const rv = await call('DELETE', '/gouvernance/unassign-role', { username: USER, role_name: ROLE });
  assert(rv.ok, 'unassign-role 2xx', `status=${rv.status} ${JSON.stringify(rv.data).slice(0, 160)}`);

  // 7) VERIFY revoke
  log('· verify revoke (read-back)');
  const rfu2 = await call('GET', `/gouvernance/roles-for-user/${encodeURIComponent(USER)}`);
  assert(rfu2.ok && !JSON.stringify(rfu2.data).toUpperCase().includes(ROLE), 'role no longer in user\'s roles', `body=${JSON.stringify(rfu2.data).slice(0, 200)}`);
} catch (e) {
  fail.push(`harness error: ${String(e).slice(0, 200)}`);
  log(`\n‼️  ${String(e).slice(0, 200)}`);
} finally {
  // CLEANUP — always, even on failure. Delete user first (depends on role), then role.
  log('\n· cleanup');
  const du = await call('POST', '/gouvernance/drop-user', { username: USER }).catch(() => ({ ok: false }));
  log(`  ${du.ok ? '🧹' : '⚠️'} drop user ${USER} (status=${du.status ?? '?'})`);
  const dr = await call('POST', '/gouvernance/drop-role', { role_name: ROLE }).catch(() => ({ ok: false }));
  log(`  ${dr.ok ? '🧹' : '⚠️'} drop role ${ROLE} (status=${dr.status ?? '?'})`);

  log(`\n=== LIFECYCLE RESULT: ${pass.length} passed / ${fail.length} failed ===`);
  fail.forEach((f) => log(`  ✗ ${f}`));
  process.exit(fail.length ? 1 : 0);
}
