// ─────────────────────────────────────────────────────────────────────────────
// data360-mcp / lib/client.mjs
// The SINGLE shared auth + HTTP + MCP-registration library for all 3 servers
// (health-server.mjs, ux-server.mjs, roles-server.mjs). Anything cross-cutting
// lives HERE so the 3 disjoint server files can't drift or skip an invariant.
//
// INVARIANTS THIS LIB ENFORCES (do not reimplement per-server):
//   1. ONE auth path — login() POSTs to ${API_BASE}/user/login/ and caches the
//      token in-memory, keyed PER PERSONA (roles-server runs >1 persona at once).
//   2. CREDENTIAL HYGIENE — passwords/tokens are NEVER logged. redact()/scrub()
//      mask them. login() takes creds as args/env only; never hardcode.
//   3. stdout IS THE JSON-RPC TRANSPORT for a stdio MCP server. ANY write to
//      stdout corrupts the protocol. ALL diagnostics go to STDERR via log().
//   4. DESTRUCTIVE-TOOL GATE — a tool declared { destructive:true } is auto-
//      rejected unless the caller passes { confirm:true }. Free + uniform for
//      provision/teardown/warm/invalidate tools the implement agents will add.
//   5. Tool handler errors are caught → returned as { isError:true } (redacted,
//      logged to stderr) so one bad call never kills the server.
//
// Node 24, ESM, global fetch (no axios/node-fetch). Servers are CLIENTS of the
// running backend/app and hold NO service-account (SVC) env.
// ─────────────────────────────────────────────────────────────────────────────

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ── Base URLs (env-overridable; defaults match .mcp.json) ────────────────────
export const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const APP_BASE = (process.env.APP_BASE || 'http://localhost:3000').replace(/\/+$/, '');

// ── stderr-only logging (stdout is reserved for JSON-RPC) ────────────────────
/** Log to STDERR only. Every argument is scrubbed of secrets first. */
export function log(...args) {
  const safe = args.map((a) => (typeof a === 'string' ? redact(a) : scrub(a)));
  process.stderr.write(safe.map(stringify).join(' ') + '\n');
}
function stringify(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

// ── Redaction (top security rule: never log a token/password) ─────────────────
const SECRET_KEY_RE = /pass(word)?|token|secret|authorization|bearer|access_token|cred/i;
/**
 * Mask secret-looking substrings inside a string. Keeps a short tail for
 * debugging (e.g. "***c3f1") without exposing the value.
 */
export function redact(str) {
  if (str == null) return str;
  let s = String(str);
  // Bearer <jwt> / token=... / password=...
  s = s.replace(/(bearer\s+)[A-Za-z0-9._\-]+/gi, '$1***');
  s = s.replace(/((?:pass(?:word)?|token|secret|access_token)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1***');
  return s;
}
/** Mask a raw token to a non-reversible hint, e.g. "tok_…a1b2" (or "tok_none"). */
export function maskToken(token) {
  if (!token) return 'tok_none';
  const t = String(token);
  return `tok_…${t.slice(-4)}`;
}
/**
 * Deep-clone an object with any secret-named keys replaced by "***". Use before
 * logging request bodies / responses / persona configs.
 */
export function scrub(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(scrub);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEY_RE.test(k)) out[k] = '***';
    else if (v && typeof v === 'object') out[k] = scrub(v);
    else out[k] = v;
  }
  return out;
}

// ── In-memory token cache, keyed PER PERSONA ─────────────────────────────────
// roles-server logs in as 3 personas at once and asserts disjoint allow-sets;
// a single "last token" would silently cross persona state. Key = account:username.
const _tokens = new Map(); // "ACCOUNT:USERNAME" -> { token, role, account, username, expiresAt }
const personaKey = (account, username) => `${account || ''}:${username || ''}`;

/** Look up a previously-cached persona token. Returns the cache entry or null. */
export function getCachedSession(account, username) {
  return _tokens.get(personaKey(account, username)) || null;
}
/** Drop a cached persona token (e.g. after teardown). */
export function clearSession(account, username) {
  if (account == null && username == null) { _tokens.clear(); return; }
  _tokens.delete(personaKey(account, username));
}

/**
 * Authenticate against the REAL backend and cache the token in-memory.
 *   POST ${API_BASE}/user/login/  body { account_name, username, password }
 *   → { access_token, token_type, account_name, username, role, items, message }
 * Creds come from args (or env API_ACCOUNT/API_USERNAME/API_PASSWORD via the
 * server) — NEVER hardcoded, NEVER logged. Returns a redaction-safe session
 * (token present for use by callers, but maskToken() it before logging).
 */
export async function login({ account, username, password } = {}) {
  if (!account || !username || !password) {
    throw new Error('login requires { account, username, password } (no creds hardcoded; pass as tool args or via env)');
  }
  const url = `${API_BASE}/user/login/`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ account_name: account, username, password }),
    });
  } catch (e) {
    // Network error (backend down) — surface WITHOUT echoing the body.
    throw new Error(`login: cannot reach ${url} — ${redact(e.message)}`);
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (res.status !== 200 || !body?.access_token) {
    const detail = typeof body?.detail === 'string' ? body.detail : body?.message || `HTTP ${res.status}`;
    throw new Error(`login failed for ${username}@${account}: ${redact(detail)}`);
  }
  const session = {
    token: body.access_token,
    tokenType: body.token_type || 'bearer',
    account: body.account_name || account,
    username: body.username || username,
    role: body.role || null,
    items: body.items || [],
  };
  _tokens.set(personaKey(session.account, session.username), session);
  log(`[auth] login ok ${session.username}@${session.account} role=${session.role} ${maskToken(session.token)}`);
  return session;
}

/**
 * Authenticated (or anonymous) HTTP call to the backend.
 *   apiFetch('GET', '/common/databases', { token })
 *   apiFetch('POST', '/gouvernance/policies/row-access', { token, body, params })
 * Returns { status, ms, ok, body, error } — NEVER throws on HTTP status; throws
 * only on a transport failure. Token is sent as Bearer; it is never logged.
 */
export async function apiFetch(method, path, { token, body, params, headers } = {}) {
  const url = new URL(API_BASE + (path.startsWith('/') ? path : `/${path}`));
  if (params) for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const h = { Accept: 'application/json', ...(headers || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body != null) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { method, headers: h, body: payload });
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, ok: false, body: null, error: redact(e.message) };
  }
  const ms = Date.now() - t0;
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON or empty */ }
  return { status: res.status, ms, ok: res.ok, body: data, error: res.ok ? null : (data?.detail ?? data?.message ?? `HTTP ${res.status}`) };
}

// ── Path to the existing harnesses (wrap, do not reimplement) ─────────────────
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Absolute repo root (…/datalab360Front), derived from this file's location. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
/** Absolute path into e2e/ux-audit/<file> — the harnesses the ux/roles servers shell out to. */
export const harness = (file) => path.join(REPO_ROOT, 'e2e', 'ux-audit', file);

// ── MCP server factory + tool-registration helper (JSON-Schema input) ────────
// Low-level Server (no zod): tools declare a plain JSON-Schema inputSchema, the
// implement-agent API is just .tool({...}) N times then .start(). The factory
// wires ListTools + CallTool from an internal registry, enforces the destructive
// gate, catches handler errors, and starts the stdio transport.

/** Wrap a handler's return into the MCP tool-result envelope. */
export function toolText(text) {
  return { content: [{ type: 'text', text: typeof text === 'string' ? text : stringify(text) }] };
}
/** JSON result helper — pretty-prints an object as a text block. */
export function toolJson(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Create an MCP server.
 *   const s = createServer({ name: 'data360-health', version: '0.1.0' });
 *   s.tool({
 *     name: 'api_probe',
 *     description: '...',
 *     inputSchema: { type:'object', properties:{ path:{type:'string'} }, required:['path'] },
 *     handler: async (args) => toolJson(...),   // return a tool-result envelope
 *   });
 *   s.tool({ name:'provision', destructive:true, ...handler });  // needs confirm:true
 *   await s.start();
 *
 * Returns: { tool(spec), start(), raw } where raw is the underlying SDK Server.
 */
export function createServer({ name, version = '0.1.0' }) {
  const registry = new Map(); // name -> { name, description, inputSchema, destructive, handler }
  const server = new Server({ name, version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...registry.values()].map((t) => ({
      name: t.name,
      description: t.destructive ? `[DESTRUCTIVE — requires confirm:true] ${t.description}` : t.description,
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name: toolName, arguments: args = {} } = req.params;
    const t = registry.get(toolName);
    if (!t) {
      return { ...toolText(`unknown tool: ${toolName}`), isError: true };
    }
    // Destructive gate — mutations require an explicit confirm:true.
    if (t.destructive && args.confirm !== true) {
      log(`[gate] refused destructive '${toolName}' (confirm!=true)`);
      return {
        ...toolText(`Refused: '${toolName}' is DESTRUCTIVE and requires { "confirm": true }. No action taken.`),
        isError: true,
      };
    }
    try {
      const result = await t.handler(args, { server });
      return result ?? toolText('(no result)');
    } catch (e) {
      log(`[tool:${toolName}] error: ${redact(e?.stack || e?.message || String(e))}`);
      return { ...toolText(`tool '${toolName}' failed: ${redact(e?.message || String(e))}`), isError: true };
    }
  });

  return {
    raw: server,
    /** Register a tool. inputSchema is plain JSON-Schema; set destructive:true for mutations. */
    tool({ name: tName, description = '', inputSchema, destructive = false, handler }) {
      if (!tName || typeof handler !== 'function') {
        throw new Error('tool({ name, handler }) — name + handler are required');
      }
      // Auto-add a `confirm` property to destructive tool schemas so it's discoverable.
      let schema = inputSchema || { type: 'object', properties: {} };
      if (destructive) {
        schema = {
          ...schema,
          properties: {
            ...(schema.properties || {}),
            confirm: { type: 'boolean', description: 'Must be true to run this destructive action.' },
          },
        };
      }
      registry.set(tName, { name: tName, description, inputSchema: schema, destructive, handler });
      return this;
    },
    /** Connect over stdio and start serving. Logs readiness to STDERR. */
    async start() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      log(`[mcp] ${name} v${version} up over stdio — tools: ${[...registry.keys()].join(', ') || '(none)'}`);
    },
  };
}
