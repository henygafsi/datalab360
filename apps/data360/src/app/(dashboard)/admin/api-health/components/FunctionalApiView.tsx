'use client';
/**
 * Functional API View — a functional catalogue of ALL backend endpoints
 * (generated from the backend OpenAPI snapshot, ~1020 ops). For each endpoint
 * it shows: the ACTION (what it does), live RESPONSE TIME, the AI role, the
 * FinOps type, a cache/stored-response hint, and the data-user clarity flag.
 *
 * "Stored responses (first time, to optimize cost)": the Probe button fetches a
 * safe GET once, measures latency, and CACHES the response in localStorage —
 * subsequent views read the stored copy instead of re-hitting the backend.
 */
import { useEffect, useMemo, useState, useCallback, Fragment } from 'react';
import apiClient from '@/lib/api-client';
import { getServerMetrics } from '@/app/services/admin-visibility';
import { toMessage } from '@/lib/error-messages';
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
const finChip = (f: string) => f === 'none' ? null : chip(f.replace('finops-', '💲'), '#dcfce7', '#15803d');
const methodColor: Record<string, string> = { GET: '#2563eb', POST: '#16a34a', PUT: '#d97706', PATCH: '#d97706', DELETE: '#dc2626' };

export default function FunctionalApiView() {
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
  const [tagFilter, setTagFilter] = useState('all');
  const allTags = useMemo(() => Array.from(new Set(rows.flatMap((e) => e.tags))).sort(), [rows]);
  const [probing, setProbing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setExpanded((s) => ({ ...s, [k]: !s[k] }));

  useEffect(() => { setStore(loadStore()); }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/api-catalog');
      const { meta, catalog } = (await res.json()) as { meta: Meta; catalog: CatalogEntry[] };
      setMeta(meta); setRows(catalog);
    } catch (e) { setErr(toMessage(e, 'Échec du chargement du catalogue.')); }
    finally { setLoading(false); }
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

  useEffect(() => { if (open && !meta) load(); }, [open, meta, load]);

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
    } catch (ex: any) {
      const ms = Math.round(performance.now() - t0);
      const status = ex?.response?.status ?? 0;
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
      (tagFilter === 'all' || e.tags.includes(tagFilter)) &&
      (!ql || e.path.toLowerCase().includes(ql) || e.action.toLowerCase().includes(ql) || (e.tags.join(' ').toLowerCase().includes(ql)))
    );
  }, [rows, q, group, onlyAi, onlyFin, onlyDoc, onlyUnwired, onlyDataUser, tagFilter]);

  const exportCsv = () => {
    const cols = ['method', 'path', 'group', 'action', 'tags', 'aiRole', 'finops', 'cache', 'audience', 'wired', 'rbac', 'bodyFields', 'returns'] as const;
    const esc = (v: unknown) => `"${String(Array.isArray(v) ? v.join(' ') : v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(
      filtered.map((e) => cols.map((c) => esc((e as Record<string, unknown>)[c])).join(',')),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `api-catalog-${filtered.length}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const rt = (e: CatalogEntry) => {
    const k = keyOf(e.method, e.path);
    const live = latency[k];
    const stored = isFresh(store[k]) ? store[k]?.ms : undefined;
    if (live != null) return { ms: live, src: 'live' };
    if (stored != null) return { ms: stored, src: 'stored' };
    return null;
  };

  // Data-freshness badge for a row: cache policy + TTL + refresh zone, plus a
  // "data fetched X ago" line when a live probe response is stored locally.
  const freshness = (e: CatalogEntry, k: string) => {
    const ci = CACHE_INFO[k];
    const probe = isFresh(store[k]) ? store[k] : undefined;
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
          🕒 {label}{zone && !isMutation && <span style={{ fontWeight: 400, opacity: 0.75 }}> · {zone}</span>}
        </span>
        {probe && <span style={{ fontSize: 10, color: '#9ca3af', whiteSpace: 'nowrap' }}>récupéré il y a {relTime(probe.at)}</span>}
      </div>
    );
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        margin: '16px 0', padding: '10px 18px', borderRadius: 8, border: '1px solid #6d28d9',
        background: '#f5f3ff', color: '#6d28d9', fontWeight: 700, cursor: 'pointer', fontSize: 14,
      }}>🧭 Ouvrir la vue fonctionnelle des APIs (toutes les routes backend · actions · temps de réponse)</button>
    );
  }

  return (
    <section style={{ margin: '16px 0 28px', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🧭 Vue fonctionnelle des APIs</h2>
        <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', fontSize: 12, color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}>Réduire ▲</button>
      </div>

      {loading && <p style={{ color: '#666' }}>Chargement du catalogue…</p>}
      {err && <p style={{ color: '#dc2626' }}>{err}</p>}

      {meta && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            ['Endpoints', meta.totalOps], ['Paths', meta.totalPaths],
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
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#15803d' }} title="Réponses stockées (1ʳᵉ fois) = appels backend évités sur les visites suivantes — optimisation coût">
            ♻ {Object.values(store).filter(isFresh).length} en cache
            {Object.keys(store).length > 0 && (
              <button onClick={() => { setStore({}); saveStore({}); }} style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>vider</button>
            )}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>{filtered.length} / {rows.length}</span>
          <button onClick={exportCsv} title="Exporter la sélection filtrée en CSV (inventaire portable)" style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' }}>⬇ CSV</button>
        </div>
      )}

      {meta && (
        <div style={{ maxHeight: 560, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
              <tr style={{ textAlign: 'left', color: '#555' }}>
                <th style={{ padding: '8px 10px' }}>Méthode</th>
                <th style={{ padding: '8px 10px' }}>Action · Endpoint</th>
                <th style={{ padding: '8px 10px' }}>Temps</th>
                <th style={{ padding: '8px 10px' }}>IA</th>
                <th style={{ padding: '8px 10px' }}>FinOps</th>
                <th style={{ padding: '8px 10px' }} title="Température des données : à quel point la donnée servie est fraîche / mise en cache (TTL · périmètre de rafraîchissement)">Fraîcheur</th>
                <th style={{ padding: '8px 10px' }}>Probe</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 600).map((e) => {
                const k = keyOf(e.method, e.path);
                const time = rt(e);
                const safeGet = e.method === 'GET' && !e.path.includes('{');
                const isOpen = !!expanded[k];
                return (
                  <Fragment key={k + e.action}>
                  <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '6px 10px' }}><span style={{ color: methodColor[e.method] || '#444', fontWeight: 700 }}>{e.method}</span></td>
                    <td style={{ padding: '6px 10px', cursor: 'pointer' }} onClick={() => toggle(k)} title="Cliquer pour les détails">
                      <div style={{ fontWeight: 600 }}><span style={{ color: '#9ca3af', fontSize: 10 }}>{isOpen ? '▾' : '▸'}</span> {e.action}{e.audience === 'data-user' && chip('data_user', '#dbeafe', '#1d4ed8')}{e.needsDoc && <span title="data-user sans description claire — doc à améliorer" style={{ color: '#d97706' }}> ⚠</span>}</div>
                      {e.hint && <div style={{ color: '#9ca3af', fontSize: 11, fontStyle: 'italic' }}>{e.hint}</div>}
                      <div style={{ color: '#888', fontFamily: 'monospace', fontSize: 11 }}>{e.path}{!e.wired && <span title="Endpoint backend non câblé côté FE — à réintégrer" style={{ marginLeft: 6, color: '#b45309', fontFamily: 'system-ui' }}>· non-wiré</span>}</div>
                    </td>
                    <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {time ? <span style={{ color: time.ms > 1000 ? '#dc2626' : time.ms > 300 ? '#d97706' : '#16a34a' }}>{time.ms} ms <span style={{ color: '#aaa', fontSize: 10 }}>{time.src}</span></span> : <span style={{ color: '#ccc' }}>—</span>}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{aiChip(e.aiRole)}</td>
                    <td style={{ padding: '6px 10px' }}>{finChip(e.finops)}</td>
                    <td style={{ padding: '6px 10px' }}>{freshness(e, k)}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {safeGet ? (
                        <button onClick={() => probe(e, isFresh(store[k]))} disabled={probing === k} title={isFresh(store[k]) ? `En cache (${store[k].ms}ms, <1h) — cliquer pour rafraîchir` : 'Récupère et stocke la 1ʳᵉ réponse'} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #6d28d9', background: isFresh(store[k]) ? '#ecfdf5' : '#fff', color: isFresh(store[k]) ? '#15803d' : '#6d28d9', cursor: 'pointer' }}>
                          {probing === k ? '…' : isFresh(store[k]) ? `✓ cache ⟳` : 'Probe'}
                        </button>
                      ) : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: '#fafaff' }}>
                      <td colSpan={7} style={{ padding: '8px 14px 12px 30px', fontSize: 11.5, color: '#555' }}>
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
