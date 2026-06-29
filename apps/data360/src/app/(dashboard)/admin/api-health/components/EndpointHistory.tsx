'use client';

/**
 * EndpointHistory — per-endpoint test-tracing across persisted release runs.
 *
 * The release rollup answers "how healthy was this release?"; this answers the
 * complementary power-user question: "how has THIS one endpoint behaved over
 * time?" — its status, latency and HTTP code across every saved run, with a
 * latency trend sparkline and a Snowflake QUERY_HISTORY drill (query_id →
 * query_text / status / latency) when a run captured a query id.
 *
 * Reuse-only (no new backend route this round):
 *   - listApiHealthRuns()        → the persisted runs (newest-first) + run_ts.
 *   - getApiHealthRunDetail(id)  → the per-run endpoint rows (status/latency/…).
 *   - QueryIntrospect            → GET /admin/api-health/introspect?query_id=.
 * The series is pivoted CLIENT-SIDE from the recent run details. A bounded
 * on-demand fan-out (<= MAX_RUNS calls, cached by run_id) keeps it cheap.
 *
 * saveRun now persists a dedicated `query_id` (extracted from the error body OR
 * the success payload) plus the lossless `error_body` per row, so the trace
 * lights up on history — resolved here as `row.query_id ?? parse(error_body ??
 * error)`. Older saved runs (no query_id column) still trace via the body parse.
 *
 * TODO (backend agent): (1) echo the new `query_id` / `error_body` columns back
 * on GET /admin/api-health/runs/{run_id} so the dedicated id is authoritative
 * (the body-parse fallback covers it until then); (2) a single
 * GET /admin/api-health/runs/endpoint/{module}/{endpoint}?limit=N returning the
 * pivoted series server-side would remove this client-side fan-out.
 *
 * Render rules (CLAUDE.md): loading skeleton · honest "—" for null fields ·
 * inline error + retry · NotDeployedError (404/501) degrades to a quiet notice.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toMessage } from '@/lib/error-messages';

import {
  listApiHealthRuns,
  getApiHealthRunDetail,
  NotDeployedError,
  type RunRow,
  type RunDetailResponse,
} from '@/app/services/admin-api-health';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import { parseErrorBody } from './types';
import { QueryIntrospect } from './QueryIntrospect';

/** Cap the run-detail fan-out — the most recent N saved runs build the trend. */
const MAX_RUNS = 12;

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'not-deployed';

type SeriesPoint = {
  runId: string;
  release: string;
  runTs: string | null;
  status: string | null;
  category: string | null;
  timeMs: number | null;
  httpStatus: number | null;
  error: string | null;
  /** Warehouse query id for this run, resolved at pivot from the persisted row. */
  queryId: string | null;
};

type EndpointSeries = {
  key: string; // `${module}::${endpoint}`
  module: string;
  endpoint: string;
  points: SeriesPoint[]; // newest-first
};

const CATEGORY_COLOR: Record<string, string> = {
  defect: '#a21caf',
  error: '#dc2626',
  slow: '#c2410c',
  warn: '#d97706',
  expected: '#64748b',
  ok: '#16a34a',
};

function catColor(category: string | null, status: string | null): string {
  if (category && CATEGORY_COLOR[category]) return CATEGORY_COLOR[category];
  if (status === 'success') return CATEGORY_COLOR.ok;
  if (status === 'error') return CATEGORY_COLOR.error;
  if (status === 'warn') return CATEGORY_COLOR.warn;
  return '#94a3b8';
}

function catLabel(category: string | null, status: string | null): string {
  if (category) return category;
  return status || '—';
}

function ms(v: number | null): string {
  return v == null ? '—' : `${v} ms`;
}
function num(v: number | null | undefined): string {
  return v == null ? '—' : String(v);
}
function when(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleString();
}
/** Nearest-rank percentile over an ascending-sorted array; null when empty. */
function percentile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil(q * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}

/** Dependency-free latency sparkline (oldest -> newest, bars tinted by category). */
function Sparkline({ points }: { points: SeriesPoint[] }) {
  // Oldest on the left so the trend reads left-to-right.
  const ordered = [...points].reverse();
  const timed = ordered.filter((p) => p.timeMs != null);
  if (timed.length === 0) {
    return <span style={{ fontSize: 12, color: '#94a3b8' }}>no timed runs</span>;
  }
  const max = Math.max(...timed.map((p) => p.timeMs as number), 1);
  const W = 4;
  const GAP = 2;
  const H = 28;
  return (
    <svg width={ordered.length * (W + GAP)} height={H} role="img" aria-label="latency trend">
      {ordered.map((p, i) => {
        const v = p.timeMs ?? 0;
        const h = p.timeMs == null ? 2 : Math.max(2, Math.round((v / max) * H));
        return (
          <rect
            key={p.runId}
            x={i * (W + GAP)}
            y={H - h}
            width={W}
            height={h}
            fill={p.timeMs == null ? '#e2e8f0' : catColor(p.category, p.status)}
          >
            <title>{`${p.release} · ${ms(p.timeMs)} · ${catLabel(p.category, p.status)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function EndpointHistory({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<LoadState>('idle');
  const [runs, setRuns] = useState<RunRow[]>([]);
  // Per-run detail cache (by run_id) so re-selection never refetches.
  const [detailByRun, setDetailByRun] = useState<Record<string, RunDetailResponse>>({});
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tracedRun, setTracedRun] = useState<string | null>(null);
  // AI trend diagnosis for the selected endpoint (reuses generateCompletion).
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Load the persisted runs, then fan out the bounded run-detail fetch and pivot.
  const load = useCallback(async () => {
    setState('loading');
    setSelectedKey(null);
    setTracedRun(null);
    try {
      const res = await listApiHealthRuns({ limit: 50 });
      const recent = res.runs.slice(0, MAX_RUNS);
      setRuns(recent);
      const details = await Promise.all(
        recent.map(async (r) => {
          try {
            const d = await getApiHealthRunDetail(r.run_id);
            return [r.run_id, d] as const;
          } catch {
            return [r.run_id, null] as const;
          }
        }),
      );
      const map: Record<string, RunDetailResponse> = {};
      for (const [id, d] of details) if (d) map[id] = d;
      setDetailByRun(map);
      setState('ready');
    } catch (e) {
      if (e instanceof NotDeployedError) setState('not-deployed');
      else setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Pivot the cached run details into a per-endpoint series (newest-first).
  const seriesByKey = useMemo<Map<string, EndpointSeries>>(() => {
    const tsByRun = new Map(runs.map((r) => [r.run_id, r.run_ts] as const));
    const relByRun = new Map(runs.map((r) => [r.run_id, r.release] as const));
    const out = new Map<string, EndpointSeries>();
    // runs are newest-first; iterate in that order so each series stays sorted.
    for (const r of runs) {
      const detail = detailByRun[r.run_id];
      if (!detail) continue;
      for (const row of detail.rows) {
        const mod = row.module || '—';
        const ep = row.endpoint || '—';
        const key = `${mod}::${ep}`;
        let entry = out.get(key);
        if (!entry) {
          entry = { key, module: mod, endpoint: ep, points: [] };
          out.set(key, entry);
        }
        // Prefer the dedicated query_id column; fall back to parsing the lossless
        // body (or the human error) so traces light up even on older saved runs.
        const queryId =
          row.query_id ?? parseErrorBody(row.error_body ?? row.error).queryId;
        entry.points.push({
          runId: r.run_id,
          release: relByRun.get(r.run_id) || r.release,
          runTs: tsByRun.get(r.run_id) ?? r.run_ts,
          status: row.status,
          category: row.category,
          timeMs: row.time_ms,
          httpStatus: row.http_status,
          error: row.error,
          queryId,
        });
      }
    }
    return out;
  }, [runs, detailByRun]);

  const endpointList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = Array.from(seriesByKey.values());
    const filtered = q ? all.filter((s) => s.key.toLowerCase().includes(q)) : all;
    return filtered.sort((a, b) => a.key.localeCompare(b.key));
  }, [seriesByKey, search]);

  const selected = selectedKey ? seriesByKey.get(selectedKey) || null : null;

  // Defect/regression trend for the selected endpoint: latency delta latest vs prev.
  const latencyDelta = useMemo(() => {
    if (!selected) return null;
    const timed = selected.points.filter((p) => p.timeMs != null);
    if (timed.length < 2) return null;
    return (timed[0].timeMs as number) - (timed[1].timeMs as number);
  }, [selected]);

  // Latency distribution across saved runs + an honest regression verdict.
  const stats = useMemo<{
    min: number | null; avg: number | null; p95: number | null; max: number | null;
    regression: 'latency' | 'broke' | null;
  } | null>(() => {
    if (!selected) return null;
    const timed = selected.points.filter((p) => p.timeMs != null) as (SeriesPoint & { timeMs: number })[];
    const vals = timed.map((p) => p.timeMs).sort((a, b) => a - b);
    const min = vals.length ? vals[0] : null;
    const max = vals.length ? vals[vals.length - 1] : null;
    const avg = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    const p95 = percentile(vals, 0.95);
    // Regression A: newly broken — latest is a defect/error but an earlier run was ok.
    const latest = selected.points[0];
    const isBad = (p?: SeriesPoint) => p?.category === 'defect' || p?.category === 'error' || p?.status === 'error';
    const wasOkBefore = selected.points.slice(1).some((p) => p.status === 'success' || p.category === 'ok' || p.category === 'expected');
    let regression: 'latency' | 'broke' | null = null;
    if (latest && isBad(latest) && wasOkBefore) regression = 'broke';
    else if (timed.length >= 3) {
      // Regression B: latest timed run is >50% slower than the median of the rest.
      const rest = timed.slice(1).map((p) => p.timeMs).sort((a, b) => a - b);
      const med = rest[Math.floor(rest.length / 2)];
      if (med > 0 && timed[0].timeMs > med * 1.5) regression = 'latency';
    }
    return { min, avg, p95, max, regression };
  }, [selected]);

  // The newest run carrying a query id — used by the header "Trace latest query".
  const latestQueryRun = useMemo(
    () => selected?.points.find((p) => p.queryId) ?? null,
    [selected],
  );

  // Reset the AI verdict whenever the selected endpoint changes.
  useEffect(() => {
    setAiResult(null);
    setAiError(null);
    setAiLoading(false);
  }, [selectedKey]);

  const diagnoseTrend = useCallback(async () => {
    if (!selected) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    // Compact, oldest->newest series so the model reads the trend in order.
    const lines = [...selected.points].reverse().map((p) =>
      `${p.release}: ${catLabel(p.category, p.status)} · ${ms(p.timeMs)} · HTTP ${num(p.httpStatus)}`,
    );
    const prompt =
      'You are a senior backend SRE. Below is the per-release health history of ONE API endpoint ' +
      '(oldest first): outcome, latency and HTTP code across saved probe runs.\n\n' +
      `Endpoint: ${selected.module} / ${selected.endpoint}\n` +
      (stats ? `Latency min/avg/p95/max: ${ms(stats.min)} / ${ms(stats.avg)} / ${ms(stats.p95)} / ${ms(stats.max)}\n` : '') +
      `History:\n${lines.join('\n')}\n\n` +
      'In 2-3 terse sentences: is this endpoint stable, regressing (slower or newly failing), or recovering? ' +
      'If regressing, name the most likely cause and one concrete next check. Do not name any specific data-warehouse vendor.';
    try {
      const res = await generateCompletion({ prompt, model: 'claude-3-7-sonnet' } as any);
      setAiResult((res?.response || '').trim() || 'No diagnosis returned.');
    } catch (err: any) {
      setAiError(toMessage(err, 'Diagnosis failed. Try again.'));
    } finally {
      setAiLoading(false);
    }
  }, [selected, stats]);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Per-endpoint history</h2>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          Status, latency and HTTP for a single endpoint across the last {MAX_RUNS} saved runs — with a query trace.
        </span>
        <button
          onClick={() => void load()}
          disabled={state === 'loading'}
          style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db',
            cursor: state === 'loading' ? 'not-allowed' : 'pointer', background: '#fff', color: '#374151', fontSize: 13,
          }}
        >
          {state === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {state === 'loading' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 40, borderRadius: 8, background: '#f1f5f9' }} />
          ))}
        </div>
      )}

      {state === 'not-deployed' && (
        <div style={{ padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 14, background: '#f8fafc' }}>
          Per-endpoint history needs saved runs from the
          <code style={{ margin: '0 4px' }}>/admin/api-health/runs</code> route, which is not live on this backend yet.
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 14 }}>
          <span style={{ flex: 1 }}>Couldn&apos;t load the endpoint history.</span>
          <button onClick={() => void load()} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ef4444', cursor: 'pointer', background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      )}

      {state === 'ready' && (seriesByKey.size === 0 ? (
        <div style={{ padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
          No persisted runs yet — run a probe, then &quot;Save as release run&quot;, to build per-endpoint history.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Endpoint picker */}
          <div style={{ width: 320, flexShrink: 0 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter endpoint (module::function)…"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, color: '#374151', marginBottom: 6 }}
            />
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
              {endpointList.length} of {seriesByKey.size} endpoints
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 8 }}>
              {endpointList.map((s) => {
                const latest = s.points[0];
                const active = s.key === selectedKey;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setSelectedKey(s.key); setTracedRun(null); }}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 8, textAlign: 'left',
                      padding: '6px 10px', border: 'none', borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer', background: active ? '#eef2ff' : '#fff',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0, background: catColor(latest?.category ?? null, latest?.status ?? null) }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>
                      <span style={{ color: '#94a3b8' }}>{s.module} · </span>{s.endpoint}
                    </span>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{s.points.length}x</span>
                  </button>
                );
              })}
              {endpointList.length === 0 && (
                <div style={{ padding: 16, fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No endpoint matches.</div>
              )}
            </div>
          </div>

          {/* Selected endpoint series */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!selected ? (
              <div style={{ padding: 32, textAlign: 'center', borderRadius: 8, border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 14 }}>
                Pick an endpoint to see its status, latency and query trace across saved runs.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                    <span style={{ color: '#94a3b8' }}>{selected.module} · </span>{selected.endpoint}
                  </div>
                  <Sparkline points={selected.points} />
                  {latencyDelta != null && (
                    <span
                      title="Latency change latest vs previous timed run"
                      style={{ fontSize: 12, fontWeight: 600, color: latencyDelta > 0 ? '#dc2626' : latencyDelta < 0 ? '#16a34a' : '#64748b' }}
                    >
                      {latencyDelta > 0 ? `▲ +${latencyDelta} ms` : latencyDelta < 0 ? `▼ ${latencyDelta} ms` : '→ 0 ms'}
                    </span>
                  )}
                  {stats?.regression === 'broke' && (
                    <span title="Latest run failed where an earlier run passed" style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 7px' }}>
                      REGRESSED — newly failing
                    </span>
                  )}
                  {stats?.regression === 'latency' && (
                    <span title="Latest run >50% slower than the median of prior runs" style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: '1px 7px' }}>
                      REGRESSED — latency
                    </span>
                  )}
                </div>

                {/* Latency distribution + a one-click trace of the latest captured query. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  {([['min', stats?.min ?? null], ['avg', stats?.avg ?? null], ['p95', stats?.p95 ?? null], ['max', stats?.max ?? null]] as const).map(([label, v]) => (
                    <span key={label} style={{ fontSize: 12, color: '#64748b' }}>
                      <span style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.4, color: '#94a3b8' }}>{label} </span>
                      <span style={{ fontFamily: 'monospace', color: '#374151', fontWeight: 600 }}>{ms(v)}</span>
                    </span>
                  ))}
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>· {selected.points.length} runs</span>
                  {latestQueryRun && (
                    <button
                      onClick={() => setTracedRun(tracedRun === latestQueryRun.runId ? null : latestQueryRun.runId)}
                      title="Open QUERY_HISTORY for the most recent run that captured a query id"
                      style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 4, border: '1px solid #c7d2fe', cursor: 'pointer', background: tracedRun === latestQueryRun.runId ? '#eef2ff' : '#fff', color: '#4338ca', fontSize: 11, fontWeight: 600 }}
                    >
                      {tracedRun === latestQueryRun.runId ? 'Hide latest query' : 'Trace latest query'}
                    </button>
                  )}
                </div>

                {/* AI trend diagnosis — reuses the existing completion endpoint. */}
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => void diagnoseTrend()}
                    disabled={aiLoading}
                    style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #10b981', cursor: aiLoading ? 'not-allowed' : 'pointer', background: '#fff', color: '#047857', fontSize: 12, fontWeight: 600 }}
                  >
                    {aiLoading ? 'Diagnosing…' : 'Diagnose trend (AI)'}
                  </button>
                  {aiError && <span style={{ marginLeft: 10, fontSize: 12, color: '#dc2626' }}>{aiError}</span>}
                  {aiResult && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#374151', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {aiResult}
                    </div>
                  )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px', width: 150 }}>Release</th>
                        <th style={{ padding: '6px 8px', width: 90 }}>Outcome</th>
                        <th style={{ padding: '6px 8px', width: 80 }}>Latency</th>
                        <th style={{ padding: '6px 8px', width: 50 }}>HTTP</th>
                        <th style={{ padding: '6px 8px', width: 170 }}>When</th>
                        <th style={{ padding: '6px 8px' }}>Trace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.points.map((p) => {
                        // query_id is resolved at pivot from the persisted row's
                        // dedicated column (or the lossless body fallback). Render the
                        // trace affordance ONLY when present, never an inert button.
                        const queryId = p.queryId;
                        const traced = tracedRun === p.runId;
                        return (
                          <tr key={p.runId} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12 }}>{p.release}</td>
                            <td style={{ padding: '5px 8px' }}>
                              <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: catColor(p.category, p.status), background: `${catColor(p.category, p.status)}1a` }}>
                                {catLabel(p.category, p.status)}
                              </span>
                            </td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>{ms(p.timeMs)}</td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12, color: p.httpStatus != null && p.httpStatus >= 500 ? '#dc2626' : p.httpStatus != null && p.httpStatus >= 400 ? '#d97706' : '#374151' }}>{num(p.httpStatus)}</td>
                            <td style={{ padding: '5px 8px', color: '#64748b', fontSize: 12 }}>{when(p.runTs)}</td>
                            <td style={{ padding: '5px 8px', fontSize: 12 }}>
                              {queryId ? (
                                <>
                                  <button
                                    onClick={() => setTracedRun(traced ? null : p.runId)}
                                    style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #c7d2fe', cursor: 'pointer', background: traced ? '#eef2ff' : '#fff', color: '#4338ca', fontSize: 11, fontWeight: 600 }}
                                  >
                                    {traced ? 'Hide query' : 'Trace query'}
                                  </button>
                                  {traced && (
                                    <div style={{ marginTop: 6, maxWidth: 520 }}>
                                      <QueryIntrospect queryId={queryId} label="Load QUERY_HISTORY" />
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: '#cbd5e1' }} title="No warehouse query id persisted for this run">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
