#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// data360-roles — MCP (stdio) server: role-based DATA ACCESS + role-aware USER
// HOOKS (the two meanings of "hooks to user via best UX of data roles").
//
// Grounded in vault _RBAC_TEST_MATRIX.md: provision distinct personas (e.g.
// Deploy Approver / Dashboard Viewer / Data Governor), then prove RBAC isolation
// (each persona can do exactly what its grants allow, sees exactly the data its
// Snowflake role exposes — no privilege bleed) AND surface the role-aware user
// hooks (notifications bell, real-time cache-invalidation SSE, actionable
// insights). CLIENT of the running backend (env API_BASE). All HTTP + the single
// auth path go through lib/client.mjs (apiFetch / login) — NEVER raw fetch here.
//
// TOOL CATALOG (this file):
//   RBAC / DATA ACCESS (read):
//     ping                     liveness (backend-independent; kept for smoke)
//     roles_login              login() one persona; cache token PER PERSONA (lib Map)
//     list_roles               GET /gouvernance/d360-roles      — granular RBAC roles
//     list_users               GET /gouvernance/users-with-roles — directory
//     my_permissions           GET /gouvernance/d360-roles/my-permissions — allow-set
//     data_access              GET /common/databases (+/common/tables) — per-role scope
//     access_matrix            log in as N personas; diff allow-sets + data scopes →
//                              PASS/FAIL isolation matrix (the _RBAC_TEST_MATRIX audit)
//   RBAC PROVISIONING (DESTRUCTIVE — require confirm:true; mutate the Snowflake acct):
//     provision_persona        add-user + assign-role + POST d360-roles +
//                              PUT d360-roles/{role}/permissions + POST gui-permissions
//     teardown_persona         drop-users-batch + drop-roles-batch + DELETE d360 role +
//                              delete gui rows   (rollback via in-proc ledger or args)
//   ROLE-AWARE USER HOOKS (the UX-of-data-roles part, read):
//     notifications            GET /notifications + /notifications/unread-count (the bell)
//     watch_cache_invalidations  open the /cache-stream/stream SSE for N s; capture events
//     insights                 GET /api/recommendations/ — actionable-insights feed for role
//
// Persona passwords come from tool args/env at login/provision time — NEVER
// hardcoded, NEVER logged, NEVER written to the rollback ledger or tool output.
//
// NOTE: provisioning is a real (reversible) Snowflake mutation; the user must
// launch the backend (with CACHE_READ_ALLOW_USER_FALLBACK=1) first. While the
// backend is DOWN only boot + tools/list + ping are verifiable.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createServer,
  toolJson,
  login,
  apiFetch,
  getCachedSession,
  clearSession,
  maskToken,
  log,
  API_BASE,
} from './lib/client.mjs';

const s = createServer({ name: 'data360-roles', version: '0.1.0' });

// ── In-process state (a stdio server is one long-lived process) ──────────────
// `_active` = the persona resolved by the last roles_login, used as the default
// token source for the single-persona read tools.
let _active = null; // { account, username }
// Rollback ledger for provisioned personas. NEVER stores the password.
const _ledger = new Map(); // username -> { username, account, sf_role, d360_role, gui_pages }

// ── Token resolution — the SINGLE auth path, credential-hygiene safe ─────────
// Precedence: explicit full creds (fresh login) → explicit cached persona →
// last active persona → env (API_ACCOUNT/API_USERNAME/API_PASSWORD). Throws a
// redaction-safe error if none resolve. Never logs/returns the password.
async function resolveSession(args = {}) {
  const { account, username, password } = args;
  if (account && username && password) {
    const sess = await login({ account, username, password });
    _active = { account: sess.account, username: sess.username };
    return sess;
  }
  if (account && username) {
    const cached = getCachedSession(account, username);
    if (cached) return cached;
    throw new Error(`no cached session for ${username}@${account}; call roles_login first (or pass password)`);
  }
  if (_active) {
    const cached = getCachedSession(_active.account, _active.username);
    if (cached) return cached;
  }
  const ea = process.env.API_ACCOUNT, eu = process.env.API_USERNAME, ep = process.env.API_PASSWORD;
  if (ea && eu && ep) {
    const sess = await login({ account: ea, username: eu, password: ep });
    _active = { account: sess.account, username: sess.username };
    return sess;
  }
  throw new Error('no active session: call roles_login (or set API_ACCOUNT/API_USERNAME/API_PASSWORD) first');
}

// ── Small normalizers (mirror the frontend services, no reimplementation) ────
function extractDbNames(body) {
  const list = Array.isArray(body)
    ? body
    : (body?.databases || body?.data?.databases || body?.data || []);
  return (Array.isArray(list) ? list : [])
    .map((d) => (typeof d === 'string' ? d : d?.name || d?.DATABASE_NAME || d?.database || d?.NAME))
    .filter(Boolean);
}
/** Resolved allow-set as a Set of "module:page:tab:action" keys (DENY excluded). */
function allowKeys(perms) {
  const set = new Set();
  for (const p of Array.isArray(perms) ? perms : []) {
    const lvl = String(p?.access_level ?? p?.ACCESS_LEVEL ?? 'ALLOW').toUpperCase();
    if (lvl === 'DENY') continue;
    const k = `${p?.module ?? p?.MODULE ?? '?'}:${p?.page ?? p?.PAGE ?? '?'}:${p?.tab ?? p?.TAB ?? '*'}:${p?.action ?? p?.ACTION ?? '?'}`;
    set.add(k);
  }
  return set;
}

// ════════════════════════════════════════════════════════════════════════════
// liveness — kept (and EXTENDED by the catalog below) so smoke-list-tools passes
// ════════════════════════════════════════════════════════════════════════════
s.tool({
  name: 'ping',
  description: 'Liveness check for the data360-roles MCP server. Returns config (no secrets). Does not call the backend or provision anything.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => toolJson({ server: 'data360-roles', alive: true, api_base: API_BASE, active_persona: _active?.username ?? null }),
});

// ════════════════════════════════════════════════════════════════════════════
// RBAC / DATA ACCESS (read)
// ════════════════════════════════════════════════════════════════════════════
s.tool({
  name: 'roles_login',
  description: 'Authenticate ONE persona against the real backend (POST /user/login/) and cache its token per-persona. Sets the active persona for subsequent read tools. Creds via args or env API_ACCOUNT/API_USERNAME/API_PASSWORD — never logged.',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string', description: 'Snowflake account_name (or env API_ACCOUNT).' },
      username: { type: 'string', description: 'username (or env API_USERNAME).' },
      password: { type: 'string', description: 'password (or env API_PASSWORD) — never logged/stored.' },
    },
  },
  handler: async (args) => {
    const sess = await login({
      account: args.account || process.env.API_ACCOUNT,
      username: args.username || process.env.API_USERNAME,
      password: args.password || process.env.API_PASSWORD,
    });
    _active = { account: sess.account, username: sess.username };
    return toolJson({
      logged_in: true,
      account: sess.account,
      username: sess.username,
      role: sess.role,
      modules: Array.isArray(sess.items) ? sess.items.length : 0,
      token: maskToken(sess.token),
    });
  },
});

s.tool({
  name: 'list_roles',
  description: 'List the granular Data360 RBAC roles (GET /gouvernance/d360-roles) visible to the active token. Read-only governance call.',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    const r = await apiFetch('GET', '/gouvernance/d360-roles', { token: sess.token });
    const d = r.body ?? {};
    const raw = Array.isArray(d)
      ? d
      : [
          ...(Array.isArray(d.roles) ? d.roles : []),
          ...(Array.isArray(d.data) ? d.data : []),
          ...(Array.isArray(d.system_roles) ? d.system_roles : []),
          ...(Array.isArray(d.custom_roles) ? d.custom_roles : []),
        ];
    const roles = raw.map((x) => ({
      role_name: x?.role_name ?? x?.ROLE_NAME ?? '',
      display_name: x?.display_name ?? x?.DISPLAY_NAME ?? null,
      is_system: x?.is_system ?? x?.IS_SYSTEM ?? null,
      permission_count: x?.permission_count ?? x?.PERMISSION_COUNT ?? null,
    }));
    return toolJson({ status: r.status, ms: r.ms, count: roles.length, roles, error: r.error });
  },
});

s.tool({
  name: 'list_users',
  description: 'List directory users with their roles (GET /gouvernance/users-with-roles, falls back to /gouvernance/users). Read-only governance call.',
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
      limit: { type: 'number', description: 'Max users to return in the sample (default 50).' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    let r = await apiFetch('GET', '/gouvernance/users-with-roles', { token: sess.token });
    let path = '/gouvernance/users-with-roles';
    if (!r.ok || r.status === 404) {
      const r2 = await apiFetch('GET', '/gouvernance/users', { token: sess.token });
      if (r2.ok) { r = r2; path = '/gouvernance/users'; }
    }
    const d = r.body ?? {};
    const list = Array.isArray(d) ? d : (Array.isArray(d.data) ? d.data : (Array.isArray(d.users) ? d.users : []));
    const limit = Math.max(1, Number(args.limit) || 50);
    const sample = list.slice(0, limit).map((u) => (typeof u === 'string' ? { username: u } : {
      username: u?.username ?? u?.USERNAME ?? u?.name ?? '',
      roles: u?.roles ?? u?.ROLES ?? null,
      disabled: u?.disabled ?? u?.DISABLED ?? null,
    }));
    return toolJson({ endpoint: path, status: r.status, ms: r.ms, count: list.length, users: sample, error: r.error });
  },
});

s.tool({
  name: 'my_permissions',
  description: "Resolve the active token's effective Data360 action allow-set (GET /gouvernance/d360-roles/my-permissions): snowflake_role → d360_role → allow-set. The single source of truth for useCanPerform gating.",
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    const r = await apiFetch('GET', '/gouvernance/d360-roles/my-permissions', { token: sess.token });
    const d = r.body ?? {};
    const allow = [...allowKeys(d.permissions)].sort();
    return toolJson({
      status: r.status,
      ms: r.ms,
      username: d.username ?? sess.username,
      snowflake_role: d.snowflake_role ?? sess.role ?? null,
      d360_role: d.d360_role ?? null,
      permission_count: d.permission_count ?? allow.length,
      source: d.source ?? null,
      uninitialized: Boolean(d.uninitialized),
      allow_set: allow,
      error: r.error,
    });
  },
});

s.tool({
  name: 'data_access',
  description: "The data scope visible to the active token's Snowflake role: GET /common/databases (real SHOW DATABASES under the caller's role). If { database, schema } are given, also GET /common/tables/{db}/{schema}. Proves per-role Snowflake RBAC on data.",
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
      database: { type: 'string', description: 'optional — also list this DB\'s tables in <schema>' },
      schema: { type: 'string', description: 'schema for the optional /common/tables call (default PUBLIC)' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    const dbs = await apiFetch('GET', '/common/databases', { token: sess.token });
    const dbNames = extractDbNames(dbs.body);
    const out = {
      databases: { status: dbs.status, ms: dbs.ms, count: dbNames.length, names: dbNames, error: dbs.error },
    };
    if (args.database) {
      const schema = args.schema || 'PUBLIC';
      const t = await apiFetch('GET', `/common/tables/${encodeURIComponent(args.database)}/${encodeURIComponent(schema)}`, { token: sess.token });
      const tlist = Array.isArray(t.body) ? t.body : (t.body?.tables || t.body?.data || []);
      const tnames = (Array.isArray(tlist) ? tlist : [])
        .map((x) => (typeof x === 'string' ? x : x?.name || x?.TABLE_NAME || x?.table)).filter(Boolean);
      out.tables = { database: args.database, schema, status: t.status, ms: t.ms, count: tnames.length, names: tnames, error: t.error };
    }
    return toolJson(out);
  },
});

s.tool({
  name: 'access_matrix',
  description: 'RBAC isolation audit (_RBAC_TEST_MATRIX). Log in as each persona, diff their my_permissions allow-sets + data_access DB scopes, and emit a PASS/FAIL matrix. By default asserts each persona resolves a non-empty allow-set and that distinct personas are not identical (no privilege bleed); pass `expect` to assert specific allow/forbid keys per persona. Personas may share access (e.g. view) — this reports overlaps descriptively, it does not force full disjointness.',
  inputSchema: {
    type: 'object',
    properties: {
      personas: {
        type: 'array',
        description: 'Personas to log in and compare. Passwords are used once for login, never stored/returned.',
        items: {
          type: 'object',
          properties: {
            account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
            label: { type: 'string', description: 'optional friendly label (e.g. "Dashboard Viewer")' },
          },
          required: ['account', 'username', 'password'],
        },
      },
      expect: {
        type: 'array',
        description: 'Optional per-persona assertions: { username, allow:[keys-that-must-be-present], forbid:[keys-that-must-be-absent] }; key = module:page:tab:action.',
        items: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            allow: { type: 'array', items: { type: 'string' } },
            forbid: { type: 'array', items: { type: 'string' } },
          },
          required: ['username'],
        },
      },
    },
    required: ['personas'],
  },
  handler: async (args) => {
    const personas = Array.isArray(args.personas) ? args.personas : [];
    if (personas.length < 1) throw new Error('access_matrix requires personas:[{account,username,password}]');
    const checks = [];
    const ok = (cond, msg) => checks.push({ pass: !!cond, msg });

    // 1. Log in + gather each persona's allow-set and DB scope.
    const rows = [];
    for (const p of personas) {
      const label = p.label || p.username;
      let sess;
      try {
        sess = await login({ account: p.account, username: p.username, password: p.password });
      } catch (e) {
        ok(false, `${label}: login FAILED — ${e.message}`);
        rows.push({ label, username: p.username, login_ok: false });
        continue;
      }
      const mp = await apiFetch('GET', '/gouvernance/d360-roles/my-permissions', { token: sess.token });
      const dbs = await apiFetch('GET', '/common/databases', { token: sess.token });
      const allow = allowKeys(mp.body?.permissions);
      const dbScope = new Set(extractDbNames(dbs.body));
      rows.push({
        label, username: p.username, login_ok: true,
        d360_role: mp.body?.d360_role ?? null,
        snowflake_role: mp.body?.snowflake_role ?? sess.role ?? null,
        allow, dbScope,
      });
      ok(allow.size > 0, `${label}: resolved a non-empty allow-set (${allow.size} actions)`);
    }

    // 2. Pairwise comparison (distinct usernames) — descriptive overlap + bleed flag.
    const live = rows.filter((r) => r.login_ok);
    const pairs = [];
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.username === b.username) continue;
        const shared = [...a.allow].filter((k) => b.allow.has(k));
        const onlyA = [...a.allow].filter((k) => !b.allow.has(k));
        const onlyB = [...b.allow].filter((k) => !a.allow.has(k));
        const identical = a.allow.size > 0 && a.allow.size === b.allow.size && onlyA.length === 0;
        const aSubsetB = [...a.dbScope].every((d) => b.dbScope.has(d));
        const bSubsetA = [...b.dbScope].every((d) => a.dbScope.has(d));
        pairs.push({
          a: a.label, b: b.label,
          shared_actions: shared.length, only_a: onlyA.length, only_b: onlyB.length, identical,
          db_scope: { a: a.dbScope.size, b: b.dbScope.size, a_subset_of_b: aSubsetB, b_subset_of_a: bSubsetA },
        });
        ok(!identical, `${a.label} vs ${b.label}: allow-sets are distinct (no full privilege bleed)`);
      }
    }

    // 3. Optional explicit allow/forbid assertions.
    if (Array.isArray(args.expect)) {
      for (const exp of args.expect) {
        const row = rows.find((r) => r.username === exp.username && r.login_ok);
        if (!row) { ok(false, `expect[${exp.username}]: no live session to assert against`); continue; }
        for (const k of exp.allow || []) ok(row.allow.has(k), `${row.label}: HAS required action ${k}`);
        for (const k of exp.forbid || []) ok(!row.allow.has(k), `${row.label}: does NOT have forbidden action ${k}`);
      }
    }

    const passed = checks.filter((c) => c.pass).length;
    const verdict = checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
    return toolJson({
      verdict,
      summary: `${passed}/${checks.length} checks passed`,
      personas: rows.map((r) => ({
        label: r.label, username: r.username, login_ok: r.login_ok,
        d360_role: r.d360_role ?? null, snowflake_role: r.snowflake_role ?? null,
        action_count: r.allow ? r.allow.size : 0,
        allow_set: r.allow ? [...r.allow].sort() : [],
        db_scope_count: r.dbScope ? r.dbScope.size : 0,
        db_scope: r.dbScope ? [...r.dbScope].sort() : [],
      })),
      pairwise: pairs,
      checks,
    });
  },
});

// ════════════════════════════════════════════════════════════════════════════
// RBAC PROVISIONING (DESTRUCTIVE — confirm:true enforced by the lib factory)
// ════════════════════════════════════════════════════════════════════════════
s.tool({
  name: 'provision_persona',
  description: 'DESTRUCTIVE. Provision a login-able RBAC persona via the documented 5-step sequence: 1) POST /gouvernance/add-user (create Snowflake user + password) 2) POST /gouvernance/assign-role (grant sf_role) 3) POST /gouvernance/d360-roles (create granular role) 4) PUT /gouvernance/d360-roles/{role}/permissions (action allow-set) 5) POST /gouvernance/gui-permissions (page access). Records created objects (NOT the password) for clean teardown. Uses the active/admin session (env API_* or a prior roles_login).',
  destructive: true,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'username for the new persona.' },
      password: { type: 'string', description: 'login password — used once, never logged/stored.' },
      email: { type: 'string', description: 'email for add-user (default <name>@local.test).' },
      sf_role: { type: 'string', description: 'Snowflake role to grant (step 2). Optional.' },
      d360_role: { type: 'string', description: 'granular Data360 role to create (step 3). Optional.' },
      actions: {
        type: 'array',
        description: 'allow-set rows for the d360_role (step 4). Each: { module, page, tab?, action }. access_level forced to ALLOW.',
        items: {
          type: 'object',
          properties: { module: { type: 'string' }, page: { type: 'string' }, tab: { type: 'string' }, action: { type: 'string' } },
          required: ['module', 'page', 'action'],
        },
      },
      gui_pages: { type: 'array', description: 'page paths to grant the role WRITE access (step 5).', items: { type: 'string' } },
    },
    required: ['name', 'password'],
  },
  handler: async (args) => {
    if (!args.name || !args.password) throw new Error('provision_persona requires { name, password }');
    const admin = await resolveSession({}); // admin token (active persona or env)
    const T = admin.token;
    const email = args.email || `${args.name}@local.test`;
    const guiRole = args.d360_role || args.sf_role || null;
    const steps = [];
    const record = (step, endpoint, r) => steps.push({ step, endpoint, status: r.status, ok: r.ok, error: r.error });

    // 1. create the Snowflake user with a password (login-able). Body holds the
    //    password but is sent straight to the backend — never logged/recorded.
    const u = await apiFetch('POST', '/gouvernance/add-user', { token: T, body: { username: args.name, password: args.password, email } });
    record('create_user', 'POST /gouvernance/add-user', u);

    // 2. grant the Snowflake role.
    if (args.sf_role) {
      const a = await apiFetch('POST', '/gouvernance/assign-role', { token: T, body: { username: args.name, role_name: args.sf_role } });
      record('assign_sf_role', 'POST /gouvernance/assign-role', a);
    }
    // 3. create the granular D360 role.
    if (args.d360_role) {
      const c = await apiFetch('POST', '/gouvernance/d360-roles', { token: T, body: { role_name: args.d360_role, display_name: args.d360_role } });
      record('create_d360_role', 'POST /gouvernance/d360-roles', c);
    }
    // 4. set the action allow-set on the D360 role.
    if (args.d360_role && Array.isArray(args.actions) && args.actions.length) {
      const permissions = args.actions.map((p) => ({
        module: p.module, page: p.page, tab: p.tab ?? '*', action: p.action, access_level: 'ALLOW',
      }));
      const perm = await apiFetch('PUT', `/gouvernance/d360-roles/${encodeURIComponent(args.d360_role)}/permissions`, { token: T, body: { permissions } });
      record('set_permissions', `PUT /gouvernance/d360-roles/${args.d360_role}/permissions`, perm);
    }
    // 5. grant GUI page access.
    if (guiRole && Array.isArray(args.gui_pages) && args.gui_pages.length) {
      for (const page_path of args.gui_pages) {
        const g = await apiFetch('POST', '/gouvernance/gui-permissions', { token: T, body: { role_name: guiRole, page_path, access_level: 'WRITE' } });
        record(`gui:${page_path}`, 'POST /gouvernance/gui-permissions', g);
      }
    }

    // Ledger for rollback — password intentionally absent.
    const entry = { username: args.name, account: admin.account, sf_role: args.sf_role || null, d360_role: args.d360_role || null, gui_pages: args.gui_pages || [] };
    _ledger.set(args.name, entry);
    log(`[provision] recorded persona ${args.name} (sf_role=${args.sf_role ?? '-'} d360_role=${args.d360_role ?? '-'})`);

    return toolJson({
      provisioned: args.name,
      steps,
      ledger: entry,
      note: 'SF-role↔d360-role resolution is enforced inside the backend (unverifiable here). Run my_permissions as this persona on a backend-up smoke to confirm the allow-set resolved.',
    });
  },
});

s.tool({
  name: 'teardown_persona',
  description: 'DESTRUCTIVE. Roll back a provisioned persona: POST /gouvernance/drop-users-batch, POST /gouvernance/drop-roles-batch (sf_role), DELETE /gouvernance/d360-roles/{d360_role}, and delete matching /gouvernance/gui-permissions rows. Missing sf_role/d360_role/gui_pages are filled from the in-process provisioning ledger.',
  destructive: true,
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'username of the persona to remove.' },
      sf_role: { type: 'string', description: 'Snowflake role to drop (defaults from ledger).' },
      d360_role: { type: 'string', description: 'D360 role to delete (defaults from ledger).' },
      gui_pages: { type: 'array', items: { type: 'string' }, description: 'gui pages to revoke (defaults from ledger).' },
    },
    required: ['name'],
  },
  handler: async (args) => {
    if (!args.name) throw new Error('teardown_persona requires { name }');
    const admin = await resolveSession({});
    const T = admin.token;
    const led = _ledger.get(args.name) || {};
    const sfRole = args.sf_role ?? led.sf_role ?? null;
    const d360Role = args.d360_role ?? led.d360_role ?? null;
    const guiPages = (args.gui_pages && args.gui_pages.length ? args.gui_pages : led.gui_pages) || [];
    const guiRole = d360Role || sfRole || null;
    const steps = [];
    const record = (step, endpoint, r) => steps.push({ step, endpoint, status: r.status, ok: r.ok, error: r.error });

    // 1. drop the user.
    const du = await apiFetch('POST', '/gouvernance/drop-users-batch', { token: T, body: { usernames: [args.name] } });
    record('drop_user', 'POST /gouvernance/drop-users-batch', du);
    // 2. drop the Snowflake role.
    if (sfRole) {
      const dr = await apiFetch('POST', '/gouvernance/drop-roles-batch', { token: T, body: { role_names: [sfRole] } });
      record('drop_sf_role', 'POST /gouvernance/drop-roles-batch', dr);
    }
    // 3. delete the D360 granular role row.
    if (d360Role) {
      const dd = await apiFetch('DELETE', `/gouvernance/d360-roles/${encodeURIComponent(d360Role)}`, { token: T });
      record('delete_d360_role', `DELETE /gouvernance/d360-roles/${d360Role}`, dd);
    }
    // 4. delete matching GUI permission rows (list → match role+page → delete by id).
    if (guiRole && guiPages.length) {
      const listed = await apiFetch('GET', '/gouvernance/gui-permissions', { token: T });
      const all = Array.isArray(listed.body?.data) ? listed.body.data : (Array.isArray(listed.body) ? listed.body : []);
      for (const row of all) {
        const rn = row?.role_name ?? row?.ROLE_NAME;
        const pp = row?.page_path ?? row?.PAGE_PATH;
        const id = row?.permission_id ?? row?.id ?? row?.PERMISSION_ID;
        if (rn === guiRole && guiPages.includes(pp) && id != null) {
          const dg = await apiFetch('DELETE', `/gouvernance/gui-permissions/${encodeURIComponent(id)}`, { token: T });
          record(`delete_gui:${pp}`, `DELETE /gouvernance/gui-permissions/${id}`, dg);
        }
      }
    }

    _ledger.delete(args.name);
    clearSession(admin.account, args.name);
    return toolJson({ torn_down: args.name, steps });
  },
});

// ════════════════════════════════════════════════════════════════════════════
// ROLE-AWARE USER HOOKS (the UX-of-data-roles part)
// ════════════════════════════════════════════════════════════════════════════
s.tool({
  name: 'notifications',
  description: "The role-scoped notification bell: GET /notifications (list) + GET /notifications/unread-count. Backend wraps payloads in {success,data} (unwrapped here).",
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
      unread_only: { type: 'boolean' }, limit: { type: 'number', description: 'max items in the sample (default 20).' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    const params = {};
    if (args.unread_only) params.unread_only = true;
    const listRes = await apiFetch('GET', '/notifications', { token: sess.token, params });
    const cntRes = await apiFetch('GET', '/notifications/unread-count', { token: sess.token });
    const list = listRes.body?.data ?? listRes.body ?? {};
    const cnt = cntRes.body?.data ?? cntRes.body ?? {};
    const items = Array.isArray(list?.items) ? list.items : [];
    const limit = Math.max(1, Number(args.limit) || 20);
    return toolJson({
      status: listRes.status,
      unread_count: cnt?.unread ?? list?.unread_count ?? 0,
      total: list?.total ?? items.length,
      items: items.slice(0, limit).map((n) => ({
        id: n.notification_id, kind: n.kind, title: n.title, ui_origin: n.ui_origin ?? null,
        created_at: n.created_at, read: !!n.read_at,
      })),
      error: listRes.error ?? cntRes.error,
    });
  },
});

s.tool({
  name: 'watch_cache_invalidations',
  description: "Open the role-scoped real-time cache-invalidation SSE stream (GET /cache-stream/stream, Bearer auth) for N seconds and return the captured events. Proves the useCacheInvalidation hook's live invalidation feed. The timed close is normal termination, not an error.",
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
      seconds: { type: 'number', description: 'how long to listen (1–60, default 10).' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    const secs = Math.min(Math.max(1, Number(args.seconds) || 10), 60);
    const url = `${API_BASE}/cache-stream/stream`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), secs * 1000);
    const events = [];
    let connected = false, note = null;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${sess.token}`, Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        clearTimeout(timer);
        return toolJson({ connected: false, status: res.status, duration_s: secs, event_count: 0, events: [], note: `SSE not available (HTTP ${res.status})` });
      }
      connected = true;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      // Read until the AbortController fires (normal end) or the stream closes.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) { note = 'stream closed by server'; break; }
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = frame.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
          if (!dataLines.length) continue;
          const raw = dataLines.join('\n');
          let ev;
          try { ev = JSON.parse(raw); } catch { ev = { raw }; }
          events.push(ev);
        }
      }
    } catch (e) {
      // The timed abort surfaces as AbortError — that is the intended end of the
      // listen window, NOT a failure. Anything else is a real transport error.
      if (e?.name !== 'AbortError') {
        clearTimeout(timer);
        throw e;
      }
      note = note || `listen window elapsed (${secs}s)`;
    } finally {
      clearTimeout(timer);
    }
    const byType = {};
    for (const e of events) { const t = e?.type || 'unknown'; byType[t] = (byType[t] || 0) + 1; }
    return toolJson({
      connected,
      duration_s: Math.round((Date.now() - t0) / 100) / 10,
      event_count: events.length,
      by_type: byType,
      events,
      note,
    });
  },
});

s.tool({
  name: 'insights',
  description: "The actionable-insights state for the role: GET /api/recommendations/ (the detect→notify→act feed backing app/shared/insights) plus the unread bell count. Honest-degrades to an empty list if the AI_RECOMMENDATIONS store isn't installed. NOTE: this router keeps the literal /api prefix.",
  inputSchema: {
    type: 'object',
    properties: {
      account: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' },
      limit: { type: 'number', description: 'max recommendations in the sample (default 20).' },
    },
  },
  handler: async (args) => {
    const sess = await resolveSession(args);
    const rec = await apiFetch('GET', '/api/recommendations/', { token: sess.token });
    const cnt = await apiFetch('GET', '/notifications/unread-count', { token: sess.token });
    const body = rec.body?.data ?? rec.body ?? {};
    const list = Array.isArray(body) ? body : (Array.isArray(body.recommendations) ? body.recommendations : (Array.isArray(body.items) ? body.items : []));
    const limit = Math.max(1, Number(args.limit) || 20);
    const cd = cnt.body?.data ?? cnt.body ?? {};
    return toolJson({
      status: rec.status,
      degraded: !rec.ok,
      unread_notifications: cd?.unread ?? 0,
      recommendation_count: list.length,
      recommendations: list.slice(0, limit).map((r) => ({
        id: r.reco_id ?? r.id, severity: r.severity, title: r.title,
        module: r.module ?? null, status: r.status ?? null, score: r.score ?? null,
      })),
      error: rec.error,
    });
  },
});

await s.start();
