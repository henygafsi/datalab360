#!/usr/bin/env node
/**
 * End-to-end probe for the Data360 user/password layer, data governance (RLS + masking)
 * and Data360 roles x per-feature access.
 *
 * It is deliberately built to FAIL LOUD and to report UNPROVEN rather than green when a
 * thing cannot be demonstrated. Three lanes, reported separately:
 *
 *   LANE A  user/password directory  — which sign-in path actually ran, bcrypt directory CRUD
 *   LANE B  RLS + column masking     — does the SAME read return DIFFERENT data per role
 *   LANE C  roles x feature access   — module gating + action allow-set, coarse-grant semantics
 *
 * The decisive oracle for LANE A is the JWT `auth` claim: services.py svc_signin() stamps
 * {"auth": "app_users_svc"} and the legacy validate_user_login() does not. So the token itself
 * tells us which code path executed — we never have to guess.
 *
 * The decisive oracle for LANE B is a DIFFERENCE, not a success: two roles reading the same
 * endpoint must not see identical rows. Identical rows across a privileged and a restricted
 * role is the signature of the IS_ROLE_IN_SESSION leak (the SVC session keeps ACCOUNTADMIN in
 * its secondary roles, so every `CASE WHEN IS_ROLE_IN_SESSION('ACCOUNTADMIN') THEN TRUE`
 * policy returns everything to everyone).
 *
 * USAGE
 *   BASE=http://127.0.0.1:8078 \
 *   D360_USERS='[{"label":"admin","account_name":"UCHSFVB-HAHA","username":"HAHA","password":"..."},
 *                {"label":"restricted","account_name":"UCHSFVB-HAHA","username":"...","password":"..."}]' \
 *   node e2e/auth-rls-rbac-e2e.mjs
 *
 * Nothing is written to the backend unless --provision is passed AND D360_PROVISION is set.
 * (app_users_service has no delete — only set_status('disabled') — so every provisioned user is
 * a permanent row in SECURITY.APP_USERS. Hence the double opt-in.)
 */

const BASE = process.env.BASE || 'http://127.0.0.1:8078';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 45000);
const ALLOW_PROVISION = process.argv.includes('--provision') && !!process.env.D360_PROVISION;

const results = [];
const rec = (lane, name, status, detail) => {
  results.push({ lane, name, status, detail });
  const glyph = { PASS: '✓', FAIL: '✗', UNPROVEN: '?', INFO: 'i' }[status] || '·';
  console.log(`  ${glyph} [${status}] ${name}`);
  if (detail) console.log(`      ${String(detail).split('\n').join('\n      ')}`);
};

async function http(method, path, { token, body } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ctl.signal,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON is fine, keep text */ }
    return { ok: res.ok, status: res.status, json, text, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, json: null, text: String(e?.message || e), ms: Date.now() - started, aborted: true };
  } finally {
    clearTimeout(t);
  }
}

const decodeJwt = (tok) => {
  try {
    const p = tok.split('.')[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch { return null; }
};

// ─────────────────────────────────────────────────────────────────────────────
// LANE A — the user/password layer
// ─────────────────────────────────────────────────────────────────────────────
async function signIn(u) {
  const r = await http('POST', '/signin', {
    body: { account_name: u.account_name, username: u.username, password: u.password },
  });
  if (r.aborted) {
    rec('A', `signin(${u.label})`, 'UNPROVEN', `no response in ${TIMEOUT_MS}ms — backend wedged or the legacy path is hanging on a warehouse connect`);
    return null;
  }
  if (!r.ok || !r.json?.access_token) {
    rec('A', `signin(${u.label})`, 'FAIL', `HTTP ${r.status} in ${r.ms}ms :: ${(r.text || '').slice(0, 300)}`);
    return null;
  }
  const claims = decodeJwt(r.json.access_token);
  const path = claims?.auth === 'app_users_svc' ? 'NEW app-user directory (svc_signin)' : 'LEGACY per-user warehouse login';
  rec('A', `signin(${u.label})`, 'PASS', `HTTP 200 in ${r.ms}ms · role=${claims?.role} · items=${JSON.stringify(claims?.items)}\npath taken: ${path}   [oracle: JWT 'auth' claim = ${JSON.stringify(claims?.auth ?? null)}]`);
  return { ...u, token: r.json.access_token, claims, role: claims?.role, items: claims?.items || [] };
}

async function laneA(users) {
  console.log('\n═══ LANE A — user / password layer ═══');
  const sessions = [];
  for (const u of users) {
    const s = await signIn(u);
    if (s) sessions.push(s);
  }

  // Which path is live? This is the single most important fact in lane A.
  const paths = new Set(sessions.map((s) => (s.claims?.auth === 'app_users_svc' ? 'new' : 'legacy')));
  if (sessions.length) {
    if (paths.has('new')) {
      rec('A', 'AUTH_APP_USERS active', 'PASS', 'the app-user directory is the live sign-in path');
    } else {
      rec('A', 'AUTH_APP_USERS active', 'FAIL',
        'every sign-in took the LEGACY warehouse path — the new directory is implemented but INERT.\n' +
        'services.py:345 app_users_enabled() reads env AUTH_APP_USERS; set it to 1 and restart to exercise svc_signin().');
    }
  }

  // Negative controls — these must NOT succeed.
  const anyUser = users[0];
  if (anyUser) {
    const bad = await http('POST', '/signin', {
      body: { account_name: anyUser.account_name, username: anyUser.username, password: 'definitely-not-the-password-' + 'x'.repeat(12) },
    });
    if (bad.aborted) rec('A', 'wrong password rejected', 'UNPROVEN', 'no response');
    else if (bad.ok) rec('A', 'wrong password rejected', 'FAIL', `a bogus password returned HTTP ${bad.status} — authentication is not verifying`);
    else rec('A', 'wrong password rejected', 'PASS', `HTTP ${bad.status} in ${bad.ms}ms`);

    const ghost = await http('POST', '/signin', {
      body: { account_name: anyUser.account_name, username: 'e2e_no_such_user_' + Date.now(), password: 'irrelevant-but-long-enough' },
    });
    if (!ghost.aborted && !bad.aborted) {
      // Enumeration oracle: app_users_service.authenticate() deliberately burns a bcrypt-shaped
      // amount of time for a missing user so it is not measurably faster than a wrong password.
      const skew = Math.abs(ghost.ms - bad.ms);
      const ratio = skew / Math.max(1, Math.min(ghost.ms, bad.ms));
      rec('A', 'no user-enumeration timing oracle', ratio < 0.5 ? 'PASS' : 'UNPROVEN',
        `unknown-user ${ghost.ms}ms vs wrong-password ${bad.ms}ms (skew ${skew}ms).\n` +
        (ratio < 0.5 ? 'comparable — no obvious oracle' : 'DIVERGENT, but one sample over a network is not proof; re-run with many samples before calling this a finding'));
    }
  }

  // The directory CRUD. Read-only unless double opt-in.
  const admin = sessions.find((s) => /ADMIN/i.test(s.role || '')) || sessions[0];
  if (admin) {
    const list = await http('GET', '/user/app-users', { token: admin.token });
    if (list.aborted) rec('A', 'GET /user/app-users', 'UNPROVEN', 'no response');
    else if (list.status === 404) rec('A', 'GET /user/app-users', 'FAIL', 'route absent from the running process');
    else if (!list.ok) rec('A', 'GET /user/app-users', 'FAIL', `HTTP ${list.status} :: ${(list.text || '').slice(0, 300)}`);
    else {
      const rows = list.json?.users || [];
      const leaked = JSON.stringify(list.json).match(/VERIFIER|\$2[aby]\$/i);
      rec('A', 'GET /user/app-users', 'PASS', `${rows.length} app user(s) in account ${list.json?.account}`);
      rec('A', 'no password verifier in the response', leaked ? 'FAIL' : 'PASS',
        leaked ? 'a bcrypt verifier appears in the API response — that must never leave the database' : 'response carries no verifier material');
    }
  }

  if (!ALLOW_PROVISION) {
    rec('A', 'provision an app user', 'UNPROVEN',
      'skipped by default. app_users_service has NO delete (only set_status disabled), so each test user is a\n' +
      'permanent row in SECURITY.APP_USERS. Re-run with --provision and D360_PROVISION=1 once the backend owner agrees.');
  }
  return sessions;
}

// ─────────────────────────────────────────────────────────────────────────────
// LANE C — Data360 roles x per-feature access  (runs before B: it is the live lane)
// ─────────────────────────────────────────────────────────────────────────────
const READ_ACTIONS = ['read', 'view', 'list', 'get', 'export'];
const WRITE_ACTIONS = ['create', 'update', 'delete', 'edit'];

async function laneC(sessions) {
  console.log('\n═══ LANE C — Data360 roles × per-feature access ═══');
  const perUser = [];

  for (const s of sessions) {
    const mods = await http('GET', '/user/me/modules', { token: s.token });
    const perms = await http('GET', '/gouvernance/d360-roles/my-permissions', { token: s.token });
    const access = await http('GET', '/gouvernance/d360-roles/my-module-access', { token: s.token });

    if (mods.ok) rec('C', `modules(${s.label})`, 'PASS', `role=${s.role} → ${JSON.stringify(mods.json).slice(0, 300)}`);
    else rec('C', `modules(${s.label})`, mods.aborted ? 'UNPROVEN' : 'FAIL', `HTTP ${mods.status} :: ${(mods.text || '').slice(0, 200)}`);

    if (perms.ok) {
      const body = JSON.stringify(perms.json);
      rec('C', `my-permissions(${s.label})`, 'PASS', `${body.length}B :: ${body.slice(0, 400)}`);

      // AO-015 coarse_decision: a role holding only coarse read/write rows (PAGE '*') must no
      // longer be denied every granular action. If the served allow-set contains ONLY the literal
      // strings read/write, the reporting side has not adopted coarse_decision — which means the
      // UI gates create/delete off even where enforcement would allow them.
      const flat = body.toLowerCase();
      const granular = WRITE_ACTIONS.filter((a) => flat.includes(`"${a}"`));
      const coarseOnly = flat.includes('"read"') && !granular.length;
      rec('C', `AO-015 coarse grant expands to granular actions (${s.label})`,
        coarseOnly ? 'FAIL' : 'PASS',
        coarseOnly
          ? 'my-permissions exposes only read/write and no granular action — enforcement (rbac.coarse_decision)\n' +
            'and reporting have DIVERGED: the UI will hide buttons the backend would allow.'
          : `granular actions present: ${granular.join(', ') || '(none needed — role is read-only)'}`);
    } else {
      rec('C', `my-permissions(${s.label})`, perms.aborted ? 'UNPROVEN' : 'FAIL', `HTTP ${perms.status} :: ${(perms.text || '').slice(0, 200)}`);
    }

    if (access.ok) rec('C', `my-module-access(${s.label})`, 'PASS', JSON.stringify(access.json).slice(0, 300));

    perUser.push({ s, mods: mods.json, perms: perms.json, access: access.json });
  }

  // The real test of "roles by feature access": two DIFFERENT roles must not get the SAME answer.
  if (perUser.length >= 2) {
    const [a, b] = perUser;
    if (a.s.role === b.s.role) {
      rec('C', 'roles differentiate feature access', 'UNPROVEN', `both sessions carry role=${a.s.role} — supply users with DIFFERENT D360 roles`);
    } else {
      const same = JSON.stringify(a.perms) === JSON.stringify(b.perms);
      rec('C', 'roles differentiate feature access', same ? 'FAIL' : 'PASS',
        same
          ? `${a.s.role} and ${b.s.role} receive an IDENTICAL allow-set — per-feature gating is not role-sensitive`
          : `${a.s.role} and ${b.s.role} receive different allow-sets`);
    }
  } else {
    rec('C', 'roles differentiate feature access', 'UNPROVEN', 'needs two users with different D360 roles');
  }

  // Unauthenticated + garbage-token controls: the gate must refuse, not fail open.
  const anon = await http('GET', '/gouvernance/d360-roles/my-permissions');
  if (!anon.aborted) {
    rec('C', 'my-permissions refuses anonymous', [401, 403].includes(anon.status) ? 'PASS' : 'FAIL',
      `HTTP ${anon.status} (expected 401/403)`);
  }
  const forged = await http('GET', '/gouvernance/d360-roles/my-permissions', { token: 'not.a.real.token' });
  if (!forged.aborted) {
    rec('C', 'my-permissions refuses a forged bearer', [401, 403].includes(forged.status) ? 'PASS' : 'FAIL',
      `HTTP ${forged.status} (expected 401/403)`);
  }
  return perUser;
}

// ─────────────────────────────────────────────────────────────────────────────
// LANE B — RLS + column masking
// ─────────────────────────────────────────────────────────────────────────────
async function laneB(sessions) {
  console.log('\n═══ LANE B — RLS + column masking per Data360 role ═══');

  if (sessions.length < 2) {
    rec('B', 'row filtering differs by role', 'UNPROVEN',
      'RLS can only be PROVEN by difference: the same read, two roles, different rows.\n' +
      'Supply at least two users with different D360 roles (ideally different ATTRIBUTES too).');
    return;
  }

  const [a, b] = sessions;
  if (a.role === b.role) {
    rec('B', 'row filtering differs by role', 'UNPROVEN', `both sessions are role=${a.role} — cannot demonstrate a difference`);
    return;
  }

  // Candidate data reads. Whichever answers for BOTH sessions becomes the comparison.
  const CANDIDATES = [
    '/studio/access/profiles',
    '/gouvernance/policies/row-access',
    '/gouvernance/policies/masking',
    '/catalog/tables',
    '/data-quality/indicators',
  ];

  let compared = false;
  for (const path of CANDIDATES) {
    const ra = await http('GET', path, { token: a.token });
    const rb = await http('GET', path, { token: b.token });
    if (!ra.ok || !rb.ok) continue;

    const norm = (r) => {
      const j = r.json;
      const arr = Array.isArray(j) ? j : (j?.items || j?.rows || j?.data || j?.results || null);
      return { n: Array.isArray(arr) ? arr.length : null, body: JSON.stringify(j) };
    };
    const na = norm(ra), nb = norm(rb);
    const identical = na.body === nb.body;

    rec('B', `same read, two roles :: ${path}`, identical ? 'FAIL' : 'PASS',
      identical
        ? `${a.role} and ${b.role} received BYTE-IDENTICAL responses (${na.n ?? '?'} rows each).\n` +
          'This is the signature of the IS_ROLE_IN_SESSION leak: the SVC session keeps ACCOUNTADMIN among its\n' +
          'secondary roles, so every policy opening with CASE WHEN IS_ROLE_IN_SESSION(\'ACCOUNTADMIN\') THEN TRUE\n' +
          'returns everything to everyone. Confirm at the warehouse with:\n' +
          "  SELECT CURRENT_ROLE(), CURRENT_SECONDARY_ROLES(), IS_ROLE_IN_SESSION('ACCOUNTADMIN');\n" +
          'The written fix, read_lane.pin_and_assert(), has no production caller.'
        : `${a.role}: ${na.n ?? '?'} rows · ${b.role}: ${nb.n ?? '?'} rows — the read IS role-sensitive`);

    // Masking: a restricted role should not receive raw values where a mask is attached.
    if (/\*\*\*MASKED\*\*\*/.test(nb.body) || /\*\*\*MASKED\*\*\*/.test(na.body)) {
      rec('B', `masking observed :: ${path}`, 'PASS', 'at least one response carried ***MASKED*** values');
    }
    compared = true;
    break;
  }

  if (!compared) {
    rec('B', 'row filtering differs by role', 'UNPROVEN',
      `none of the candidate reads answered for both sessions: ${CANDIDATES.join(', ')}.\n` +
      'Point this at a table that actually carries an attached row-access policy.');
  }

  rec('B', 'read_lane.pin_and_assert is wired into the read path', 'FAIL',
    'STATIC: grep finds callers only in tests/test_read_lane_fail_closed.py. No production read path pins the\n' +
    'acting identity or asserts the session. connection_manager._get_svc_role_connection (:1168) issues USE ROLE\n' +
    'but never USE SECONDARY ROLES NONE. Also: APP_ROLE/APP_SCOPE appear in NO .sql — the rewritten policies\n' +
    'that read_lane depends on do not exist yet.');
}

// ─────────────────────────────────────────────────────────────────────────────
(async function main() {
  console.log(`Data360 auth / RLS / RBAC end-to-end probe\ntarget: ${BASE}\n`);

  let users = [];
  try { users = JSON.parse(process.env.D360_USERS || '[]'); } catch {
    console.error('D360_USERS is not valid JSON'); process.exit(2);
  }
  if (!users.length) {
    console.error('Set D360_USERS to a JSON array of {label, account_name, username, password}.');
    console.error('At least two users with DIFFERENT Data360 roles are required to prove lanes B and C.');
    process.exit(2);
  }

  const up = await http('GET', '/openapi.json');
  if (!up.ok) {
    console.error(`\nBackend at ${BASE} is not answering (HTTP ${up.status}, ${up.ms}ms). Nothing can be proven. Aborting.`);
    process.exit(3);
  }
  console.log(`backend up: ${Object.keys(up.json?.paths || {}).length} paths\n`);

  const sessions = await laneA(users);
  if (sessions.length) {
    await laneC(sessions);
    await laneB(sessions);
  } else {
    console.log('\nNo session could be established — lanes B and C cannot run.');
  }

  const tally = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  console.log('\n═══ SUMMARY ═══');
  for (const lane of ['A', 'B', 'C']) {
    const rs = results.filter((r) => r.lane === lane);
    if (!rs.length) continue;
    const f = rs.filter((r) => r.status === 'FAIL').length;
    const u = rs.filter((r) => r.status === 'UNPROVEN').length;
    const verdict = f ? 'NOT PROVEN — failures present' : u ? 'PARTIALLY PROVEN' : 'PROVEN';
    console.log(`  LANE ${lane}: ${verdict}  (${rs.filter((r) => r.status === 'PASS').length} pass / ${f} fail / ${u} unproven)`);
  }
  console.log(`  totals: ${JSON.stringify(tally)}`);
  console.log('\nAn UNPROVEN is not a pass. Nothing above is claimed as verified unless it says PASS.');
  process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
})();
