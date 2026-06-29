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

const norm = (p: string) => p.replace(/\{[^}]+\}/g, '{}').replace(/\/$/, '');
const keyOf = (m: string, p: string) => `${m} ${norm(p)}`;

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
    if (store[k] && !force) return;
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
      (!ql || e.path.toLowerCase().includes(ql) || e.action.toLowerCase().includes(ql) || (e.tags.join(' ').toLowerCase().includes(ql)))
    );
  }, [rows, q, group, onlyAi, onlyFin, onlyDoc, onlyUnwired, onlyDataUser]);

  const rt = (e: CatalogEntry) => {
    const k = keyOf(e.method, e.path);
    const live = latency[k];
    const stored = store[k]?.ms;
    if (live != null) return { ms: live, src: 'live' };
    if (stored != null) return { ms: stored, src: 'stored' };
    return null;
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
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyAi} onChange={(e) => setOnlyAi(e.target.checked)} /> IA</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyFin} onChange={(e) => setOnlyFin(e.target.checked)} /> FinOps</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyDoc} onChange={(e) => setOnlyDoc(e.target.checked)} /> À clarifier</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyUnwired} onChange={(e) => setOnlyUnwired(e.target.checked)} /> Non-wirés</label>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={onlyDataUser} onChange={(e) => setOnlyDataUser(e.target.checked)} /> data_user</label>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#15803d' }} title="Réponses stockées (1ʳᵉ fois) = appels backend évités sur les visites suivantes — optimisation coût">
            ♻ {Object.keys(store).length} en cache
            {Object.keys(store).length > 0 && (
              <button onClick={() => { setStore({}); saveStore({}); }} style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>vider</button>
            )}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>{filtered.length} / {rows.length}</span>
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
                <th style={{ padding: '8px 10px' }}>Cache</th>
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
                    <td style={{ padding: '6px 10px', color: e.cache.startsWith('cacheable') ? '#16a34a' : '#999', fontSize: 11 }}>{e.cache.startsWith('cacheable') ? 'store-first' : e.cache.startsWith('live') ? 'live' : 'no-cache'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {safeGet ? (
                        <button onClick={() => probe(e, !!store[k])} disabled={probing === k} title={store[k] ? `En cache (${store[k].ms}ms) — cliquer pour rafraîchir` : 'Récupère et stocke la 1ʳᵉ réponse'} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid #6d28d9', background: store[k] ? '#ecfdf5' : '#fff', color: store[k] ? '#15803d' : '#6d28d9', cursor: 'pointer' }}>
                          {probing === k ? '…' : store[k] ? `✓ cache ⟳` : 'Probe'}
                        </button>
                      ) : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: '#fafaff' }}>
                      <td colSpan={7} style={{ padding: '8px 14px 12px 30px', fontSize: 11.5, color: '#555' }}>
                        {(e.desc || e.hint) && <div style={{ marginBottom: 6 }}><b>Description :</b> {e.desc || e.hint}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                          <span><b>Audience :</b> {e.audience}{e.needsDoc ? ' (doc à clarifier)' : ''}</span>
                          <span><b>RBAC :</b> <code>{e.rbac}</code></span>
                          <span><b>Cache :</b> {e.cache}</span>
                          <span><b>IA :</b> {e.aiRole}</span>
                          <span><b>FinOps :</b> {e.finops}</span>
                          <span><b>Wiré FE :</b> {e.wired ? 'oui' : 'non — à réintégrer'}</span>
                          {e.tags?.length > 0 && <span><b>Tags :</b> {e.tags.join(', ')}</span>}
                        </div>
                        {e.params.length > 0 && (
                          <div style={{ marginTop: 6 }}><b>Paramètres :</b> {e.params.map((p) => `${p.n}${p.req ? '*' : ''} (${p.in})`).join(' · ')}</div>
                        )}
                        {e.bodyFields && e.bodyFields.length > 0 && (
                          <div style={{ marginTop: 4 }}><b>Body :</b> <code>{`{ ${e.bodyFields.join(', ')} }`}</code></div>
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
