'use client';
/**
 * Functional API View — a functional catalogue of ALL backend endpoints
 * (generated from the backend OpenAPI snapshot, ~1020 ops). For each endpoint
 * it shows: the ACTION (what it does), REAL test results (response time +
 * status + response sample), per-role allow/deny, the AI role, the FinOps
 * type, a cache/stored-response hint, and the data-user clarity flag.
 *
 * REAL-RESULT JOIN (three honest sources, each labeled):
 *   1. "test"  — wire-level capture: while this page is open, an axios
 *      interceptor on the shared apiClient records EVERY completed backend
 *      call (method, path, status, duration, size, 240-char response sample).
 *      Running the page's probe sweep ("Lancer les tests") therefore fills
 *      this view with real per-endpoint measurements, matched to catalog rows
 *      by method + path (literal ids matched against {param} templates).
 *   2. "run"   — the LATEST persisted release run (GET /admin/api-health/runs
 *      → newest → GET /admin/api-health/runs/{id}), joined the same way. The
 *      persisted payload carries status/category/time_ms/error only — NO
 *      success response bodies — so those rows honestly show status+time only.
 *   3. "live"  — server-side average latency from /admin/server-metrics
 *      (only endpoints hit recently have a value).
 *
 * "Stored responses (first time, to optimize cost)": the Probe button fetches a
 * safe GET once, measures latency, and CACHES the response in localStorage —
 * subsequent views read the stored copy instead of re-hitting the backend.
 *
 * RÔLES column: per catalog module group, the 7 application data roles are
 * checked against GET /api/platform/access-simulator (module-level allow/deny;
 * the simulator reads CONFIGURED grants — it is NOT the admin bypass). Batched:
 * one call per (role × module), fetched lazily on demand and cached — never
 * per row. Technical groups with no business module honestly show "—".
 */
import { useEffect, useMemo, useState, useCallback, useRef, Fragment, type ReactNode } from 'react';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import apiClient from '@/lib/api-client';
import { getServerMetrics } from '@/app/services/admin-visibility';
import {
  listApiHealthRuns, getApiHealthRunDetail, NotDeployedError,
  type RunDetailRow,
} from '@/app/services/admin-api-health';
import { simulateRoleAccess, D360_DATA_ROLES } from '@/app/services/platform/grants';
import { toMessage } from '@/lib/error-messages';
import CacheLivePanel from './CacheLivePanel';
import cacheMapRaw from '../data/endpoint-cache-map.json';

type CatalogEntry = {
  method: string; path: string; group: string; action: string; desc: string; hint: string;
  tags: string[]; params: { n: string; in: string; req: boolean }[]; hasBody: boolean;
  aiRole: string; finops: string; cache: string; audience: string; clear: boolean;
  needsDoc: boolean; rbac: string; wired: boolean;
  bodyFields?: string[]; returns?: string[];
};
type Meta = {
  generatedFrom: string; totalOps: number; totalPaths: number; manifestRoutes: number;
  groups: [string, number][]; aiOps: number; finopsOps: number; needsDoc: number; cacheable: number;
  wired: number; unwired: number;
};
type Probe = { ms: number; status: number; at: string; snippet: string };

const STORE_KEY = 'd360.api-probe-cache.v1';
const loadStore = (): Record<string, Probe> => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, Probe>; } catch { return {}; }
};
const saveStore = (s: Record<string, Probe>) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* quota */ } };
// Stored responses expire after PROBE_TTL_MS so the cost-cache never serves
// stale data — an expired entry is treated as "not cached" (re-probes on demand).
const PROBE_TTL_MS = 60 * 60 * 1000; // 1h
const isFresh = (p?: Probe): boolean => !!p && (Date.now() - new Date(p.at).getTime()) < PROBE_TTL_MS;

const norm = (p: string) => p.replace(/\{[^}]+\}/g, '{}').replace(/\/$/, '');
const keyOf = (m: string, p: string) => `${m} ${norm(p)}`;

// ── Wire-level test capture ───────────────────────────────────────────────────
// Every backend call completed while this page is open is recorded (real
// measurements only — no fabrication). Keyed by "METHOD /literal/path".
type WireHit = { ms: number; status: number; at: string; size: number | null; snippet: string };
const WIRE_KEY = 'd360.api-wire-log.v1';
const WIRE_MAX = 1500;
// Never sample auth/credential-shaped payloads into localStorage.
const WIRE_SKIP = /signin|auth|password|secret|token|credential/i;
type WireConfig = InternalAxiosRequestConfig & { __d360T0?: number };

const loadWire = (): Record<string, WireHit> => {
  try { return JSON.parse(localStorage.getItem(WIRE_KEY) || '{}') as Record<string, WireHit>; } catch { return {}; }
};
const saveWire = (w: Record<string, WireHit>) => {
  try {
    const keys = Object.keys(w);
    if (keys.length > WIRE_MAX) {
      // keep the newest WIRE_MAX entries
      keys.sort((a, b) => new Date(w[a].at).getTime() - new Date(w[b].at).getTime());
      for (const k of keys.slice(0, keys.length - WIRE_MAX)) delete w[k];
    }
    localStorage.setItem(WIRE_KEY, JSON.stringify(w));
  } catch { /* quota — keep in-memory copy only */ }
};

/** Path (no query/hash/proxy-prefix/trailing-slash) from an axios url. */
const pathOfUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  let u = raw;
  if (/^https?:\/\//i.test(u)) {
    try { u = new URL(u).pathname; } catch { return null; }
  }
  u = u.split('?')[0].split('#')[0];
  if (u.startsWith('/api-proxy/')) u = u.slice('/api-proxy'.length);
  if (u.length > 1 && u.endsWith('/')) u = u.slice(0, -1);
  if (!u.startsWith('/')) u = `/${u}`;
  return u;
};

// ── Persisted-run join ────────────────────────────────────────────────────────
type RunHit = {
  ms: number | null; status: number | null;
  category: string | null; statusWord: string | null; error: string | null;
};
type RunMeta = { runId: string; release: string; at: string | null; total: number | null };
type RunLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';

// ── Rôles (access simulator) ─────────────────────────────────────────────────
// Catalog group → business module id (the backend grant vocabulary from
// src/config/modules.ts apiName). Only CONFIDENT mappings — technical groups
// (health, cache, admin…) have no business module and are shown as "—",
// never as a fake deny. `projects` routes are the Explore & Design project
// spine (capabilities.ts cites app/modules/projects for explore_design gates).
const GROUP_TO_MODULE: Record<string, string> = {
  'explore-design': 'explore_design',
  projects: 'explore_design',
  gouvernance: 'gouvernance',
  workflow: 'workflow',
  cortex: 'cortex',
  connect: 'connect_datalake',
  observability: 'observability',
  'data-quality': 'data_quality',
  'bi-dashboard': 'bi_reporting',
  'command-center': 'account_overview',
  'org-accounts': 'client_accounts',
  'data-products': 'data_products',
};
const ROLE_INITIALS: Record<string, string> = {
  Admin: 'AD', 'Data Engineer': 'DE', 'Data Analyst': 'DA', 'Data Steward': 'DS',
  'Business User': 'BU', 'AI Engineer': 'AI', 'FinOps Manager': 'FM',
};

// ── Data-freshness ("température des données") ────────────────────────────────
// endpoint-cache-map.json carries, per endpoint, whether the served payload is
// cached, the cache TTL (seconds), the refresh "zone" (cacheType) and the cache
// key strategy. We join it to the catalog on the same method+normalised-path key
// so each row can show HOW FRESH the data it returns is.
type CacheInfo = { cached: boolean; cacheType: string | null; ttl: number | null; strategy: string | null; responseMs: number | null };
const CACHE_INFO: Record<string, CacheInfo> = (() => {
  const m: Record<string, CacheInfo> = {};
  const eps = (cacheMapRaw as { endpoints: ({ path: string; method: string } & CacheInfo)[] }).endpoints || [];
  for (const e of eps) m[keyOf(e.method, e.path)] = { cached: e.cached, cacheType: e.cacheType, ttl: e.ttl, strategy: e.strategy, responseMs: e.responseMs };
  return m;
})();
const humanizeTtl = (s?: number | null): string | null => {
  if (s == null) return null;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = s / 3600;
  return `${Number.isInteger(h) ? h : Math.round(h * 10) / 10} h`;
};
const relTime = (iso: string): string => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
};
// neutral labels (no vendor terms) for the refresh zone + cache-key strategy
const cacheZone: Record<string, string> = {
  shared_cache: 'partagé (compte)',
  account_role_cache: 'par rôle',
  session_cache: 'par session',
};
const strategyLabel: Record<string, string> = {
  query_based: 'par requête', project_based: 'par projet', user_based: 'par utilisateur',
  metadata_based: 'métadonnées', session: 'session',
};
// render desc that may carry "**Pre-hook:** … **Post-hook:** …" markdown bold
const renderDesc = (txt: string) =>
  txt.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <b key={i} style={{ color: '#374151' }}>{p.slice(2, -2)}</b>
      : <Fragment key={i}>{p}</Fragment>,
  );

const chip = (txt: string, bg: string, fg: string) => (
  <span style={{ background: bg, color: fg, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{txt}</span>
);
const aiChip = (r: string) => r === 'none' ? null : chip(r.replace('ai-', 'AI:'), '#ede9fe', '#6d28d9');
const finChip = (f: string) => f === 'none' ? null : chip(f.replace('finops-', 'FinOps '), '#dcfce7', '#15803d');
const methodColor: Record<string, string> = { GET: '#2563eb', POST: '#16a34a', PUT: '#d97706', PATCH: '#d97706', DELETE: '#dc2626' };

// Response-time color per spec: < 300 ms green, < 1500 ms amber, else red.
const msColor = (ms: number) => (ms < 300 ? '#16a34a' : ms < 1500 ? '#d97706' : '#dc2626');
// HTTP status chip colors (0 = network/no response).
const statusColors = (status: number): { bg: string; fg: string } => {
  if (status >= 200 && status < 300) return { bg: '#dcfce7', fg: '#15803d' };
  if (status >= 300 && status < 400) return { bg: '#dbeafe', fg: '#1d4ed8' };
  if (status >= 400 && status < 500) return { bg: '#fef3c7', fg: '#b45309' };
  return { bg: '#fee2e2', fg: '#b91c1c' };
};
const categoryColors: Record<string, { bg: string; fg: string }> = {
  ok: { bg: '#dcfce7', fg: '#15803d' },
  expected: { bg: '#f3f4f6', fg: '#6b7280' },
  slow: { bg: '#fef3c7', fg: '#b45309' },
  warn: { bg: '#fef3c7', fg: '#b45309' },
  defect: { bg: '#fee2e2', fg: '#b91c1c' },
  error: { bg: '#fee2e2', fg: '#b91c1c' },
};

interface FunctionalApiViewProps {
  /**
   * Triggers the page's existing probe sweep (the ~500-endpoint "Test All"
   * mechanism). Only the admin-gated api-health page passes it — the whole
   * route sits behind AdminRouteGuard, so the button inherits that gate.
   */
  onRunTests?: () => void;
  /** Live state of the page sweep (disables the button + shows progress). */
  sweepRunning?: boolean;
}

export default function FunctionalApiView({ onRunTests, sweepRunning }: FunctionalApiViewProps) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<CatalogEntry[]>([]);
  const [latency, setLatency] = useState<Record<string, number>>({});
  const [store, setStore] = useState<Record<string, Probe>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // filters
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [onlyAi, setOnlyAi] = useState(false);
  const [onlyFin, setOnlyFin] = useState(false);
  const [onlyDoc, setOnlyDoc] = useState(false);
  const [onlyUnwired, setOnlyUnwired] = useState(false);
  const [onlyDataUser, setOnlyDataUser] = useState(false);
  const [onlyTested, setOnlyTested] = useState(false);
  const [tagFilter, setTagFilter] = useState('all');
  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((e) => e.tags))).sort(), [rows]);
  const [probing, setProbing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setExpanded((s) => ({ ...s, [k]: !s[k] }));

  useEffect(() => { setStore(loadStore()); }, []);

  // ── Wire capture: record every completed apiClient call while mounted ──────
  const wireRef = useRef<Record<string, WireHit>>({});
  const [wireVersion, setWireVersion] = useState(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    wireRef.current = loadWire();
    setWireVersion((v) => v + 1);

    const scheduleFlush = () => {
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        saveWire(wireRef.current);
        setWireVersion((v) => v + 1);
      }, 400);
    };

    const record = (config: WireConfig | undefined, status: number, data: unknown, headers?: unknown) => {
      if (!config || config.__d360T0 == null) return; // in-flight before mount — no honest duration
      const p = pathOfUrl(config.url);
      if (!p || WIRE_SKIP.test(p)) return;
      const method = (config.method || 'GET').toUpperCase();
      const ms = Math.round(performance.now() - config.__d360T0);
      let snippet = '';
      let size: number | null = null;
      const h = headers as Record<string, unknown> | undefined;
      const cl = h?.['content-length'];
      if (cl != null && Number.isFinite(Number(cl))) size = Number(cl);
      try {
        const s = typeof data === 'string' ? data : JSON.stringify(data);
        if (typeof s === 'string') {
          snippet = s.slice(0, 240);
          if (size == null) size = s.length;
        }
      } catch { /* non-serializable body — keep status/ms/size only */ }
      wireRef.current[`${method} ${p}`] = { ms, status, at: new Date().toISOString(), size, snippet };
      scheduleFlush();
    };

    const reqId = apiClient.interceptors.request.use((config) => {
      (config as WireConfig).__d360T0 = performance.now();
      return config;
    });
    const resId = apiClient.interceptors.response.use(
      (resp) => {
        record(resp.config as WireConfig, resp.status ?? 0, resp.data, resp.headers);
        return resp;
      },
      (error: unknown) => {
        const e = error as AxiosError;
        if (e?.config) record(e.config as WireConfig, e.response?.status ?? 0, e.response?.data ?? e.message, e.response?.headers);
        return Promise.reject(error);
      },
    );
    return () => {
      apiClient.interceptors.request.eject(reqId);
      apiClient.interceptors.response.eject(resId);
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      saveWire(wireRef.current);
    };
  }, []);

  // ── Catalog + live server metrics ───────────────────────────────────────────
  const loadMetrics = useCallback(async () => {
    // live response times (best-effort; only endpoints hit recently have metrics)
    try {
      const m = await getServerMetrics();
      const map: Record<string, number> = {};
      for (const e of [...(m.top_endpoints || []), ...(m.slowest_endpoints || [])]) {
        if (e.avg_ms != null) map[keyOf(e.method, e.path)] = Math.round(e.avg_ms);
      }
      setLatency(map);
    } catch { /* metrics optional */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/api-catalog');
      const { meta, catalog } = (await res.json()) as { meta: Meta; catalog: CatalogEntry[] };
      setMeta(meta); setRows(catalog);
    } catch (e) { setErr(toMessage(e, 'Échec du chargement du catalogue.')); }
    finally { setLoading(false); }
    await loadMetrics();
  }, [loadMetrics]);

  useEffect(() => { if (open && !meta) load(); }, [open, meta, load]);

  // ── Latest persisted run (GET /admin/api-health/runs → newest → detail) ─────
  const [runRows, setRunRows] = useState<RunDetailRow[] | null>(null);
  const [runMeta, setRunMeta] = useState<RunMeta | null>(null);
  const [runState, setRunState] = useState<RunLoadState>('idle');
  const [runErr, setRunErr] = useState<string | null>(null);

  const loadLatestRun = useCallback(async () => {
    setRunState('loading'); setRunErr(null);
    try {
      const list = await listApiHealthRuns({ limit: 5 });
      const newest = list.latest ?? list.runs?.[0] ?? null;
      if (!newest) { setRunRows(null); setRunMeta(null); setRunState('empty'); return; }
      const detail = await getApiHealthRunDetail(newest.run_id);
      setRunRows(detail.rows ?? []);
      setRunMeta({ runId: newest.run_id, release: newest.release, at: newest.run_ts, total: newest.total ?? null });
      setRunState('ready');
    } catch (e) {
      if (e instanceof NotDeployedError) { setRunState('unavailable'); return; }
      setRunState('error');
      setRunErr(toMessage(e, 'Chargement du dernier run impossible.'));
    }
  }, []);

  useEffect(() => { if (open && runState === 'idle') void loadLatestRun(); }, [open, runState, loadLatestRun]);

  // Sweep finished (true → false): refresh the join sources automatically.
  const prevSweep = useRef(false);
  useEffect(() => {
    if (prevSweep.current && !sweepRunning) {
      if (flushTimer.current) { clearTimeout(flushTimer.current); flushTimer.current = null; }
      saveWire(wireRef.current);
      setWireVersion((v) => v + 1);
      void loadLatestRun();
      void loadMetrics();
    }
    prevSweep.current = !!sweepRunning;
  }, [sweepRunning, loadLatestRun, loadMetrics]);

  // ── Literal-path → catalog-template matcher ─────────────────────────────────
  // Wire/run rows carry LITERAL paths (real ids, fake probe ids); catalog paths
  // carry {param} templates. Match on method + segment count, template segment
  // equals literal or is {}; most static segments wins (most specific route).
  const matcher = useMemo(() => {
    const exact = new Map<string, string>();
    const templ = new Map<string, { segs: string[]; key: string; statics: number }[]>();
    for (const e of rows) {
      const key = keyOf(e.method, e.path);
      const clean = norm(e.path);
      if (!clean.includes('{}')) { exact.set(`${e.method} ${clean}`, key); continue; }
      const segs = clean.split('/');
      const mk = `${e.method}:${segs.length}`;
      const arr = templ.get(mk) ?? [];
      arr.push({ segs, key, statics: segs.filter((s) => s !== '{}').length });
      templ.set(mk, arr);
    }
    return { exact, templ };
  }, [rows]);

  const matchCatalog = useCallback((method: string, literalPath: string): string | null => {
    const m = method.toUpperCase();
    const p = literalPath.length > 1 && literalPath.endsWith('/') ? literalPath.slice(0, -1) : literalPath;
    const ex = matcher.exact.get(`${m} ${p}`);
    if (ex) return ex;
    const segs = p.split('/');
    const cands = matcher.templ.get(`${m}:${segs.length}`);
    if (!cands) return null;
    let best: { key: string; statics: number } | null = null;
    for (const c of cands) {
      let ok = true;
      for (let i = 0; i < segs.length; i += 1) {
        if (c.segs[i] !== '{}' && c.segs[i] !== segs[i]) { ok = false; break; }
      }
      if (ok && (best == null || c.statics > best.statics)) best = { key: c.key, statics: c.statics };
    }
    return best ? best.key : null;
  }, [matcher]);

  // Joined maps: catalog key → newest wire hit / persisted-run row.
  const wireJoin = useMemo(() => {
    const m = new Map<string, WireHit>();
    for (const [lit, hit] of Object.entries(wireRef.current)) {
      const sp = lit.indexOf(' ');
      if (sp < 0) continue;
      const catKey = matchCatalog(lit.slice(0, sp), lit.slice(sp + 1));
      if (!catKey) continue;
      const prev = m.get(catKey);
      if (!prev || new Date(hit.at).getTime() > new Date(prev.at).getTime()) m.set(catKey, hit);
    }
    return m;
    // wireVersion invalidates the memo when the ref content changes.
  }, [matchCatalog, wireVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const runJoin = useMemo(() => {
    const m = new Map<string, RunHit>();
    if (!runRows) return m;
    for (const r of runRows) {
      if (!r.method || !r.path) continue; // no addressable path persisted — honest skip
      const p = pathOfUrl(r.path);
      if (!p) continue;
      const catKey = matchCatalog(r.method, p);
      if (!catKey || m.has(catKey)) continue;
      m.set(catKey, {
        ms: r.time_ms, status: r.http_status, category: r.category,
        statusWord: r.status, error: r.error ? String(r.error).slice(0, 240) : null,
      });
    }
    return m;
  }, [runRows, matchCatalog]);

  const testedCount = useMemo(() => {
    const s = new Set(wireJoin.keys());
    for (const k of runJoin.keys()) s.add(k);
    return s.size;
  }, [wireJoin, runJoin]);

  // ── Rôles: lazy per-module × 7-role simulation (cached; never per row) ──────
  const [roleSim, setRoleSim] = useState<Record<string, Record<string, boolean | null>>>({});
  const [roleSimLoading, setRoleSimLoading] = useState<Record<string, boolean>>({});
  const loadRoleSim = useCallback(async (module: string) => {
    let already = false;
    setRoleSimLoading((s) => {
      already = !!s[module];
      return already ? s : { ...s, [module]: true };
    });
    if (already) return;
    const out: Record<string, boolean | null> = {};
    await Promise.all(
      D360_DATA_ROLES.map(async (role) => {
        try {
          const r = await simulateRoleAccess({ role, module });
          out[role] = r.checks?.module?.allowed ?? null; // null = simulator gave no verdict
        } catch { out[role] = null; }
      }),
    );
    setRoleSim((s) => ({ ...s, [module]: out }));
    setRoleSimLoading((s) => ({ ...s, [module]: false }));
  }, []);

  const probe = useCallback(async (e: CatalogEntry, force = false) => {
    const k = keyOf(e.method, e.path);
    // Cost optimization: a response is fetched (and stored) only the FIRST time.
    // Subsequent views reuse the stored copy — no backend call — unless forced.
    if (isFresh(store[k]) && !force) return;
    setProbing(k);
    const t0 = performance.now();
    try {
      const r = await apiClient.get(e.path);
      const ms = Math.round(performance.now() - t0);
      const snippet = JSON.stringify(r.data).slice(0, 280);
      const next = { ...store, [k]: { ms, status: r.status, at: new Date().toISOString(), snippet } };
      setStore(next); saveStore(next);
    } catch (ex: unknown) {
      const ms = Math.round(performance.now() - t0);
      const status = (ex as AxiosError)?.response?.status ?? 0;
      const next = { ...store, [k]: { ms, status, at: new Date().toISOString(), snippet: toMessage(ex).slice(0, 280) } };
      setStore(next); saveStore(next);
    } finally { setProbing(null); }
  }, [store]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return rows.filter((e) =>
      (group === 'all' || e.group === group) &&
      (!onlyAi || e.aiRole !== 'none') &&
      (!onlyFin || e.finops !== 'none') &&
      (!onlyDoc || e.needsDoc) &&
      (!onlyUnwired || !e.wired) &&
      (!onlyDataUser || e.audience === 'data-user') &&
      (!onlyTested || wireJoin.has(keyOf(e.method, e.path)) || runJoin.has(keyOf(e.method, e.path))) &&
      (tagFilter === 'all' || e.tags.includes(tagFilter)) &&
      (!ql || e.path.toLowerCase().includes(ql) || e.action.toLowerCase().includes(ql) || (e.tags.join(' ').toLowerCase().includes(ql)))
    );
  }, [rows, q, group, onlyAi, onlyFin, onlyDoc, onlyUnwired, onlyDataUser, onlyTested, tagFilter, wireJoin, runJoin]);

  const exportCsv = () => {
    const cols = ['method', 'path', 'group', 'action', 'tags', 'aiRole', 'finops', 'cache', 'audience', 'wired', 'rbac', 'bodyFields', 'returns'] as const;
    const esc = (v: unknown) => `"${String(Array.isArray(v) ? v.join(' ') : v ?? '').replace(/"/g, '""')}"`;
    const lines = [`${cols.join(',')},test_ms,test_status`].concat(
      filtered.map((e) => {
        const k = keyOf(e.method, e.path);
        const w = wireJoin.get(k);
        const rj = runJoin.get(k);
        const ms = w?.ms ?? rj?.ms ?? '';
        const st = w?.status ?? rj?.status ?? '';
        return `${cols.map((c) => esc((e as Record<string, unknown>)[c])).join(',')},${ms},${st}`;
      }),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `api-catalog-${filtered.length}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // "Temps" priority: real test (this session) > persisted run > server avg >
  // stored probe. Every value is a real measurement, labeled with its source.
  const rt = (e: CatalogEntry): { ms: number; src: string } | null => {
    const k = keyOf(e.method, e.path);
    const w = wireJoin.get(k);
    if (w) return { ms: w.ms, src: 'test' };
    const rj = runJoin.get(k);
    if (rj?.ms != null) return { ms: rj.ms, src: 'run' };
    const live = latency[k];
    if (live != null) return { ms: live, src: 'live' };
    const stored = isFresh(store[k]) ? store[k]?.ms : undefined;
    if (stored != null) return { ms: stored, src: 'probe' };
    return null;
  };

  // Data-freshness badge for a row: cache policy + TTL + refresh zone, plus a
  // "data fetched X ago" line when a live probe response is stored locally.
  const freshness = (e: CatalogEntry, k: string) => {
    const ci = CACHE_INFO[k];
    const probeHit = isFresh(store[k]) ? store[k] : undefined;
    const isMutation = e.cache.startsWith('no-cache');
    const cached = (ci?.cached ?? false) || e.cache.startsWith('cacheable');
    const ttlH = humanizeTtl(ci?.ttl);
    const zone = ci?.cacheType ? cacheZone[ci.cacheType] ?? ci.cacheType : null;
    let label: string, bg: string, fg: string, title: string;
    if (isMutation) {
      label = 'écriture'; bg = '#f3f4f6'; fg = '#6b7280';
      title = 'Mutation — écrit des données, pas de cache de lecture';
    } else if (cached) {
      label = ttlH ? `≤ ${ttlH}` : 'mis en cache'; bg = '#ecfdf5'; fg = '#15803d';
      title = `Données mises en cache${ttlH ? `, rafraîchies au plus tard toutes les ${ttlH}` : ''}${zone ? ` · périmètre ${zone}` : ''}`;
    } else {
      label = 'live'; bg = '#eff6ff'; fg = '#1d4ed8';
      title = 'Données en temps réel (no-store) — recalculées à chaque appel';
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span title={title} style={{ background: bg, color: fg, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', width: 'fit-content' }}>
          {label}{zone && !isMutation && <span style={{ fontWeight: 400, opacity: 0.75 }}> · {zone}</span>}
        </span>
        {probeHit && <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>récupéré il y a {relTime(probeHit.at)}</span>}
      </div>
    );
  };

  // Rôles cell — inline chips (7 mini-dots), lazy fetch per module group.
  const rolesCell = (e: CatalogEntry) => {
    const module = GROUP_TO_MODULE[e.group];
    if (!module) {
      return <span style={{ color: '#d1d5db', fontSize: 11 }} title="Groupe technique sans module métier associé — non simulé">—</span>;
    }
    const sim = roleSim[module];
    if (!sim) {
      return (
        <button
          onClick={() => void loadRoleSim(module)}
          disabled={!!roleSimLoading[module]}
          title={`Simuler l'accès des 7 rôles au module ${module} (1 appel par rôle, mis en cache pour tout le groupe)`}
          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: roleSimLoading[module] ? 'wait' : 'pointer' }}
        >
          {roleSimLoading[module] ? '…' : 'voir'}
        </button>
      );
    }
    return (
      <div style={{ display: 'flex', gap: 3 }}>
        {D360_DATA_ROLES.map((role) => {
          const v = sim[role];
          const bg = v === true ? '#16a34a' : v === false ? '#dc2626' : '#9ca3af';
          const verdict = v === true ? 'autorisé' : v === false ? 'refusé (aucun grant configuré ou refus)' : 'indéterminé (simulation en erreur)';
          return (
            <span
              key={role}
              title={`${role} · module ${module} : ${verdict}`}
              style={{
                width: 17, height: 15, borderRadius: 4, background: bg, color: '#fff',
                fontSize: 8.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {ROLE_INITIALS[role] ?? '?'}
            </span>
          );
        })}
      </div>
    );
  };

  // Probe/status cell — honest chip from the freshest real result + probe button.
  const probeCell = (e: CatalogEntry, k: string) => {
    const w = wireJoin.get(k);
    const rj = runJoin.get(k);
    const safeGet = e.method === 'GET' && !e.path.includes('{');
    let statusChip: ReactNode = null;
    if (w) {
      const c = statusColors(w.status);
      statusChip = (
        <span title={`Testé (cette session) il y a ${relTime(w.at)} — HTTP ${w.status || 'réseau'} · ${w.ms} ms`} style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {w.status || 'réseau'}<span style={{ fontWeight: 400, opacity: 0.75 }}> test</span>
        </span>
      );
    } else if (rj) {
      const cat = rj.category ?? rj.statusWord ?? 'inconnu';
      const c = categoryColors[cat] ?? { bg: '#f3f4f6', fg: '#6b7280' };
      statusChip = (
        <span title={`Run persisté${runMeta ? ` «${runMeta.release}»` : ''} — ${cat}${rj.status != null ? ` · HTTP ${rj.status}` : ''}`} style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {cat}{rj.status != null && <span style={{ fontWeight: 400, opacity: 0.75 }}> {rj.status}</span>}
        </span>
      );
    } else {
      statusChip = <span style={{ color: '#9ca3af', fontSize: 11 }} title="Aucun résultat de test pour cet endpoint (ni test de session, ni run persisté) — rien n'est inventé">non testé</span>;
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {statusChip}
        {safeGet && (
          <button onClick={() => probe(e, isFresh(store[k]))} disabled={probing === k} title={isFresh(store[k]) ? `En cache (${store[k].ms}ms, <1h) — cliquer pour rafraîchir` : 'Récupère et stocke la 1ʳᵉ réponse'} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #6d28d9', background: isFresh(store[k]) ? '#ecfdf5' : '#fff', color: isFresh(store[k]) ? '#15803d' : '#6d28d9', cursor: 'pointer' }}>
            {probing === k ? '…' : isFresh(store[k]) ? '✓ cache ⟳' : 'Probe'}
          </button>
        )}
      </div>
    );
  };

  // One-line join status (persisted run + session capture) for the header.
  const joinStatus = (() => {
    const parts: string[] = [];
    if (runState === 'loading') parts.push('chargement du dernier run…');
    else if (runState === 'ready' && runMeta) parts.push(`dernier run «${runMeta.release}»${runMeta.at ? ` · il y a ${relTime(runMeta.at)}` : ''} · ${runJoin.size} endpoints joints`);
    else if (runState === 'empty') parts.push('aucun run persisté (lancez les tests puis sauvegardez un run)');
    else if (runState === 'unavailable') parts.push('historique des runs indisponible sur ce backend');
    else if (runState === 'error') parts.push(runErr ?? 'erreur de chargement du dernier run');
    if (wireJoin.size > 0) parts.push(`${wireJoin.size} endpoints testés dans cette session`);
    return parts.join(' · ');
  })();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        margin: '16px 0', padding: '10px 18px', borderRadius: 8, border: '1px solid #6d28d9',
        background: '#f5f3ff', color: '#6d28d9', fontWeight: 700, cursor: 'pointer', fontSize: 14,
      }}>Ouvrir la vue fonctionnelle des APIs (toutes les routes backend · actions · temps de réponse · résultats de test)</button>
    );
  }

  return (
    <section style={{ margin: '16px 0 28px', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 260 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Vue fonctionnelle des APIs</h2>
          {joinStatus && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{joinStatus}</div>}
          {onRunTests && (
            <button
              onClick={onRunTests}
              disabled={!!sweepRunning}
              title="Relance le balayage de test de la page (les ~500 endpoints sondés) — les résultats réels remplissent les colonnes Temps / Probe au fil de l'eau"
              style={{
                marginTop: 8, padding: '6px 14px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 13,
                cursor: sweepRunning ? 'not-allowed' : 'pointer',
                background: sweepRunning ? '#94a3b8' : '#6d28d9', color: '#fff',
              }}
            >
              {sweepRunning ? `Tests en cours… (${wireJoin.size} réponses observées)` : '▶ Lancer les tests maintenant'}
            </button>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CacheLivePanel />
          <button onClick={() => setOpen(false)} style={{ fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Réduire ▲</button>
        </div>
      </div>

      {loading && <p style={{ color: '#666' }}>Chargement du catalogue…</p>}
      {err && <p style={{ color: '#dc2626' }}>{err}</p>}

      {meta && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            ['Endpoints', meta.totalOps], ['Paths', meta.totalPaths],
            ['Testés (réel)', testedCount],
            ['IA', meta.aiOps], ['FinOps', meta.finopsOps],
            ['Wirés FE', meta.wired], ['Non-wirés (à réintégrer)', meta.unwired],
            ['À clarifier (data-user)', meta.needsDoc], ['Cacheables', meta.cacheable],
          ].map(([l, v]) => (
            <div key={l as string} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 14px', minWidth: 92 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{v as number}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{l as string}</div>
            </div>
          ))}
        </div>
      )}

      {meta && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer action / path / tag…"
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, minWidth: 240 }} />
          <select value={group} onChange={(e) => setGroup(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="all">Tous les modules ({meta.groups.length})</option>
            {meta.groups.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} title="Filtrer par tag fonctionnel (taxonomie backend)" style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, maxWidth: 220 }}>
            <option value="all">Tous les tags ({allTags.length})</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyAi} onChange={(e) => setOnlyAi(e.target.checked)} /> IA</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyFin} onChange={(e) => setOnlyFin(e.target.checked)} /> FinOps</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyDoc} onChange={(e) => setOnlyDoc(e.target.checked)} /> À clarifier</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyUnwired} onChange={(e) => setOnlyUnwired(e.target.checked)} /> Non-wirés</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyDataUser} onChange={(e) => setOnlyDataUser(e.target.checked)} /> data_user</label>
          <label style={{ fontSize: 13 }} title="Ne montrer que les endpoints avec un résultat de test réel (session ou run persisté)"><input type="checkbox" checked={onlyTested} onChange={(e) => setOnlyTested(e.target.checked)} /> testés</label>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#15803d' }} title="Réponses stockées (1ʳᵉ fois) = appels backend évités sur les visites suivantes — optimisation coût">
            ♻ {Object.values(store).filter(isFresh).length} en cache
            {Object.keys(store).length > 0 && (
              <button onClick={() => { setStore({}); saveStore({}); }} style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>vider</button>
            )}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>{filtered.length} / {rows.length}</span>
          <button onClick={exportCsv} title="Exporter la sélection filtrée en CSV (inventaire portable, avec test_ms/test_status réels)" style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' }}>⬇ CSV</button>
        </div>
      )}

      {meta && (
        <div style={{ maxHeight: 560, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
              <tr style={{ textAlign: 'left', color: '#555' }}>
                <th style={{ padding: '8px 10px' }}>Méthode</th>
                <th style={{ padding: '8px 10px' }}>Action · Endpoint</th>
                <th style={{ padding: '8px 10px' }} title="Temps de réponse réel — priorité : test de cette session > dernier run persisté > moyenne serveur > probe stockée. Couleurs : <300ms vert, <1500ms orange, sinon rouge.">Temps</th>
                <th style={{ padding: '8px 10px' }} title="Autorisation par rôle (simulateur d'accès, module du groupe) : AD Admin · DE Data Engineer · DA Data Analyst · DS Data Steward · BU Business User · AI AI Engineer · FM FinOps Manager. Le simulateur lit les GRANTS CONFIGURÉS (pas le bypass admin).">Rôles</th>
                <th style={{ padding: '8px 10px' }}>IA</th>
                <th style={{ padding: '8px 10px' }}>FinOps</th>
                <th style={{ padding: '8px 10px' }} title="Température des données : à quel point la donnée servie est fraîche / mise en cache (TTL · périmètre de rafraîchissement)">Fraîcheur</th>
                <th style={{ padding: '8px 10px' }} title="Statut du dernier test réel (session ou run persisté) — «non testé» quand aucun résultat n'existe">Probe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 600).map((e) => {
                const k = keyOf(e.method, e.path);
                const time = rt(e);
                const isOpen = !!expanded[k];
                const w = wireJoin.get(k);
                const rj = runJoin.get(k);
                const rowModule = GROUP_TO_MODULE[e.group];
                const rowSim = rowModule ? roleSim[rowModule] : undefined;
                return (
                  <Fragment key={k + e.action}>
                  <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 10px' }}><span style={{ color: methodColor[e.method] || '#444', fontWeight: 700 }}>{e.method}</span></td>
                    <td style={{ padding: '6px 10px', cursor: 'pointer' }} onClick={() => toggle(k)} title="Cliquer pour les détails (dont la réponse de test)">
                      <div style={{ fontWeight: 600 }}><span style={{ color: '#9ca3af', fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span> {e.action}{e.audience === 'data-user' && chip('data_user', '#dbeafe', '#1d4ed8')}{e.needsDoc && <span title="data-user sans description claire — doc à améliorer" style={{ color: '#d97706' }}> ⚠</span>}</div>
                      {e.hint && <div style={{ color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>{e.hint}</div>}
                      <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>{e.path}{!e.wired && <span title="Endpoint backend non câblé côté FE — à réintégrer" style={{ marginLeft: 6, color: '#b45309', fontFamily: 'system-ui' }}>· non-wiré</span>}</div>
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {time ? <span style={{ color: msColor(time.ms), fontWeight: 600 }}>{time.ms} ms <span style={{ color: '#aaa', fontSize: 10, fontWeight: 400 }}>{time.src}</span></span> : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{rolesCell(e)}</td>
                    <td style={{ padding: '6px 10px' }}>{aiChip(e.aiRole)}</td>
                    <td style={{ padding: '6px 10px' }}>{finChip(e.finops)}</td>
                    <td style={{ padding: '6px 10px' }}>{freshness(e, k)}</td>
                    <td style={{ padding: '6px 10px' }}>{probeCell(e, k)}</td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: '#fafaff' }}>
                      <td colSpan={8} style={{ padding: '8px 14px 12px 30px', fontSize: 11.5, color: '#555' }}>
                        <div style={{ marginBottom: 6 }}><b>Action :</b> {e.action}</div>
                        {(e.desc || e.hint) && <div style={{ marginBottom: 6, lineHeight: 1.5 }}><b>Description :</b> {renderDesc(e.desc || e.hint)}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                          <span><b>Audience :</b> {e.audience}{e.needsDoc ? ' (doc à clarifier)' : ''}</span>
                          <span><b>RBAC :</b> <code>{e.rbac}</code></span>
                          <span><b>IA :</b> {e.aiRole}</span>
                          <span><b>FinOps :</b> {e.finops}</span>
                          <span><b>Wiré FE :</b> {e.wired ? 'oui' : 'non — à réintégrer'}</span>
                          {e.tags?.length > 0 && <span><b>Tags :</b> {e.tags.join(', ')}</span>}
                        </div>
                        {/* Résultat de test réel — session (avec corps) et/ou run persisté (statut+temps) */}
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #ececff' }}>
                          <b>Résultat de test :</b>{' '}
                          {!w && !rj && <span style={{ color: '#9ca3af' }}>non testé — utilisez «Lancer les tests maintenant» ou le bouton Probe.</span>}
                          {w && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ color: '#374151' }}>
                                observé (cette session) — HTTP {w.status || 'réseau'} · {w.ms} ms{w.size != null ? ` · ${w.size} o` : ''} · il y a {relTime(w.at)}
                              </span>
                              {w.snippet && (
                                <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 11, color: w.status >= 200 && w.status < 300 ? '#15803d' : '#b45309', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f8fafc', borderRadius: 6, padding: '4px 8px' }}>
                                  {w.snippet}{w.size != null && w.size > w.snippet.length ? '…' : ''}
                                </div>
                              )}
                            </div>
                          )}
                          {rj && (
                            <div style={{ marginTop: 4, color: '#374151' }}>
                              run persisté{runMeta ? <> «{runMeta.release}»</> : null} — {rj.category ?? rj.statusWord ?? '—'}
                              {rj.status != null ? ` · HTTP ${rj.status}` : ''}{rj.ms != null ? ` · ${rj.ms} ms` : ''}
                              {rj.error
                                ? <div style={{ marginTop: 3, fontFamily: 'monospace', fontSize: 11, color: '#b45309', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{rj.error}</div>
                                : <span style={{ color: '#9ca3af' }}> · l&apos;historique persisté ne stocke pas les corps de réponse (statut + temps uniquement)</span>}
                            </div>
                          )}
                        </div>
                        {/* Rôles — détail complet quand la simulation du module est chargée */}
                        {rowModule && (
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #ececff' }}>
                            <b>Rôles (module {rowModule}) :</b>{' '}
                            {!rowSim && <span style={{ color: '#9ca3af' }}>non simulé — cliquez «voir» dans la colonne Rôles.</span>}
                            {rowSim && (
                              <>
                                {D360_DATA_ROLES.map((role) => {
                                  const v = rowSim[role];
                                  return (
                                    <span key={role} style={{ display: 'inline-block', marginRight: 10 }}>
                                      {role} : <b style={{ color: v === true ? '#15803d' : v === false ? '#b91c1c' : '#6b7280' }}>{v === true ? 'autorisé' : v === false ? 'refusé' : '—'}</b>
                                    </span>
                                  );
                                })}
                                <div style={{ marginTop: 3, fontSize: 10.5, color: '#9ca3af', fontStyle: 'italic' }}>
                                  Verdict au niveau MODULE (le simulateur ne détaille pas les actions) — il lit les grants configurés du compte ; un compte sans grants répond «refusé» pour tous les rôles.
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {/* Data-freshness ("température des données") — TTL · périmètre · clé de cache */}
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #ececff' }}>
                          <b>Fraîcheur des données :</b>{' '}
                          {(() => {
                            const ci = CACHE_INFO[k];
                            const bits: string[] = [];
                            if (e.cache.startsWith('no-cache')) bits.push('mutation (écrit des données, pas de cache de lecture)');
                            else if ((ci?.cached ?? false) || e.cache.startsWith('cacheable')) {
                              const ttlH = humanizeTtl(ci?.ttl);
                              bits.push(ttlH ? `mis en cache (TTL ${ttlH})` : 'mis en cache (réponse stockée)');
                              if (ci?.cacheType) bits.push(`périmètre ${cacheZone[ci.cacheType] ?? ci.cacheType}`);
                              if (ci?.strategy) bits.push(`clé ${strategyLabel[ci.strategy] ?? ci.strategy}`);
                            } else bits.push('temps réel (no-store) — recalculée à chaque appel');
                            return bits.join(' · ');
                          })()}
                          {isFresh(store[k]) && <span style={{ color: '#15803d' }}> · dernière récupération il y a {relTime(store[k].at)}</span>}
                        </div>
                        {e.params.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <b>Paramètres :</b>{' '}
                            {e.params.map((p, i) => (
                              <span key={p.n + p.in + i} style={{ display: 'inline-block', marginRight: 10 }}>
                                <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '0 4px' }}>{p.n}</code>
                                <span style={{ color: '#9ca3af' }}> · {p.in}</span>
                                {p.req
                                  ? <span style={{ color: '#dc2626', fontWeight: 700 }} title="Paramètre requis"> · requis</span>
                                  : <span style={{ color: '#9ca3af' }} title="Paramètre optionnel"> · opt.</span>}
                              </span>
                            ))}
                          </div>
                        )}
                        {e.bodyFields && e.bodyFields.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <b>Corps (body) :</b>{' '}
                            {e.bodyFields.map((f, i) => (
                              <code key={f + i} style={{ background: '#f3f4f6', borderRadius: 4, padding: '0 4px', marginRight: 6 }}>{f}</code>
                            ))}
                          </div>
                        )}
                        {e.hasBody && (!e.bodyFields || e.bodyFields.length === 0) && (
                          <div style={{ marginTop: 4, color: '#9ca3af' }}><b>Corps (body) :</b> requis — schéma non documenté</div>
                        )}
                        {e.returns && e.returns.length > 0 && (
                          <div style={{ marginTop: 4 }}><b>Retourne :</b> <code>{e.returns[0] === '(payload)' ? 'payload' : `{ ${e.returns.join(', ')} }`}</code></div>
                        )}
                        {store[k] && (
                          <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, color: '#15803d', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            <b style={{ color: '#555' }}>Réponse stockée ({store[k].status}, {store[k].ms}ms) :</b> {store[k].snippet}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 600 && <div style={{ padding: 10, color: '#999', fontSize: 12 }}>Affichage limité à 600 lignes — affinez le filtre.</div>}
        </div>
      )}
    </section>
  );
}
