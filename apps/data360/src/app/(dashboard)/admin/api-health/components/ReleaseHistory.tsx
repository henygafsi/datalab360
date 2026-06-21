'use client';

/**
 * ReleaseHistory — per-release api-health KPI history & trend.
 *
 * Reads the persisted runs from `GET /admin/api-health/runs` (ACCOUNTADMIN-gated)
 * and renders, per release, a KPI rollup (success rate · defects · 4xx · 5xx ·
 * p50/p95) plus a defect trend across runs, and a flat list of recent runs.
 *
 * Render rules (CLAUDE.md): loading skeleton · honest "—" for null KPIs (never a
 * fake 0) · error + retry · a NotDeployedError (404/501) degrades to a quiet
 * "not available on this backend yet" notice. Refreshes when `refreshKey`
 * changes (the page bumps it after a successful save).
 */
import { Fragment, useCallback, useEffect, useState } from 'react';

import {
  listApiHealthRuns,
  getApiHealthRunDetail,
  NotDeployedError,
  type ListRunsResponse,
  type ReleaseRollup,
  type RunRow,
  type RunDetailResponse,
} from '@/app/services/admin-api-health';

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'not-deployed';

function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v * 100)}%`;
}
function ms(v: number | null): string {
  return v == null ? '—' : `${v} ms`;
}
function num(v: number | null | undefined): string {
  return v == null ? '—' : String(v);
}
function ago(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString();
}

/** Defect-trend sparkline-ish: latest vs previous run defect delta per release. */
function defectTrend(runs: RunRow[], release: string): { delta: number | null; latest: number | null } {
  const forRelease = runs.filter((r) => r.release === release); // already newest-first
  if (forRelease.length === 0) return { delta: null, latest: null };
  const latest = forRelease[0].defects;
  if (forRelease.length < 2) return { delta: null, latest };
  return { delta: latest - forRelease[1].defects, latest };
}

export function ReleaseHistory({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<LoadState>('idle');
  const [data, setData] = useState<ListRunsResponse | null>(null);
  // Drill: expand a run row to show its slowest endpoints (run_detail).
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, RunDetailResponse | 'loading' | 'error'>>({});

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await listApiHealthRuns({ limit: 50 });
      setData(res);
      setState('ready');
    } catch (e) {
      if (e instanceof NotDeployedError) {
        setState('not-deployed');
      } else {
        setState('error');
      }
    }
  }, []);

  const fetchDetail = useCallback(async (runId: string) => {
    setDetails((d) => ({ ...d, [runId]: 'loading' }));
    try {
      const detail = await getApiHealthRunDetail(runId);
      setDetails((d) => ({ ...d, [runId]: detail }));
    } catch {
      setDetails((d) => ({ ...d, [runId]: 'error' }));
    }
  }, []);

  const toggleRun = useCallback((runId: string) => {
    if (expanded === runId) { setExpanded(null); return; }
    setExpanded(runId);
    const cur = details[runId];
    if (!cur || cur === 'error') void fetchDetail(runId); // (re)fetch unless cached
  }, [expanded, details, fetchDetail]);

  useEffect(() => {
    void load();
    setExpanded(null);
    setDetails({});
  }, [load, refreshKey]);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Release history</h2>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          Saved probe runs grouped by release — success rate, defects and latency over time.
        </span>
        <button
          onClick={() => void load()}
          disabled={state === 'loading'}
          style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: 6,
            border: '1px solid #d1d5db', cursor: state === 'loading' ? 'not-allowed' : 'pointer',
            background: '#fff', color: '#374151', fontSize: 13,
          }}
        >
          {state === 'loading' ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {state === 'loading' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 44, borderRadius: 8, background: '#f1f5f9' }} />
          ))}
        </div>
      )}

      {state === 'not-deployed' && (
        <div style={{
          padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1',
          color: '#64748b', fontSize: 14, background: '#f8fafc',
        }}>
          Run history is not available on this backend yet. Save a run once the
          <code style={{ margin: '0 4px' }}>/admin/api-health/runs</code> route is live.
        </div>
      )}

      {state === 'error' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 8,
          border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 14,
        }}>
          <span style={{ flex: 1 }}>Couldn’t load the release history.</span>
          <button
            onClick={() => void load()}
            style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid #ef4444',
              cursor: 'pointer', background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: 13,
            }}
          >Retry</button>
        </div>
      )}

      {state === 'ready' && data && (data.releases.length === 0 ? (
        <div style={{
          padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1',
          color: '#94a3b8', fontSize: 14, textAlign: 'center',
        }}>
          {data.note || 'No runs saved yet — run a probe, then “Save as release run”.'}
        </div>
      ) : (
        <>
          {/* Per-release rollup */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Release</th>
                  <th style={{ padding: '6px 8px', width: 60 }}>Runs</th>
                  <th style={{ padding: '6px 8px', width: 90 }}>Success</th>
                  <th style={{ padding: '6px 8px', width: 80 }}>Defects</th>
                  <th style={{ padding: '6px 8px', width: 70 }}>4xx</th>
                  <th style={{ padding: '6px 8px', width: 70 }}>5xx</th>
                  <th style={{ padding: '6px 8px', width: 80 }}>Expected</th>
                  <th style={{ padding: '6px 8px', width: 70 }}>Slow</th>
                  <th style={{ padding: '6px 8px', width: 80 }}>p50</th>
                  <th style={{ padding: '6px 8px', width: 80 }}>p95</th>
                  <th style={{ padding: '6px 8px', width: 90 }}>Trend</th>
                  <th style={{ padding: '6px 8px', width: 160 }}>Last run</th>
                </tr>
              </thead>
              <tbody>
                {data.releases.map((r: ReleaseRollup) => {
                  const t = defectTrend(data.runs, r.release);
                  const trendColor = t.delta == null ? '#94a3b8' : t.delta > 0 ? '#dc2626' : t.delta < 0 ? '#16a34a' : '#64748b';
                  const trendLabel = t.delta == null ? '—' : t.delta > 0 ? `▲ +${t.delta}` : t.delta < 0 ? `▼ ${t.delta}` : '→ 0';
                  return (
                    <tr key={r.release} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{r.release}</td>
                      <td style={{ padding: '5px 8px' }}>{num(r.run_count)}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: r.success_rate != null && r.success_rate >= 0.9 ? '#16a34a' : '#d97706' }}>{pct(r.success_rate)}</td>
                      <td style={{ padding: '5px 8px', color: r.defects > 0 ? '#a21caf' : '#64748b' }}>{num(r.defects)}</td>
                      <td style={{ padding: '5px 8px', color: '#d97706' }}>{num(r.c4xx)}</td>
                      <td style={{ padding: '5px 8px', color: r.c5xx > 0 ? '#dc2626' : '#64748b' }}>{num(r.c5xx)}</td>
                      <td style={{ padding: '5px 8px', color: '#64748b' }}>{num(r.expected)}</td>
                      <td style={{ padding: '5px 8px', color: '#c2410c' }}>{num(r.slow)}</td>
                      <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12 }}>{ms(r.p50_ms)}</td>
                      <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12 }}>{ms(r.p95_ms)}</td>
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: trendColor }} title="Defect change vs the previous run for this release">{trendLabel}</td>
                      <td style={{ padding: '5px 8px', color: '#64748b', fontSize: 12 }}>{ago(r.last_run_ts)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Recent runs — click a row to reveal its slowest endpoints */}
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '18px 0 6px' }}>
            Recent runs ({data.count}) <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>— click a run for its slowest endpoints</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', width: 18 }}></th>
                  <th style={{ padding: '6px 8px' }}>Run</th>
                  <th style={{ padding: '6px 8px', width: 160 }}>Release</th>
                  <th style={{ padding: '6px 8px', width: 60 }}>Total</th>
                  <th style={{ padding: '6px 8px', width: 90 }}>Success</th>
                  <th style={{ padding: '6px 8px', width: 80 }}>Defects</th>
                  <th style={{ padding: '6px 8px', width: 70 }}>4xx</th>
                  <th style={{ padding: '6px 8px', width: 70 }}>5xx</th>
                  <th style={{ padding: '6px 8px', width: 80 }}>p95</th>
                  <th style={{ padding: '6px 8px', width: 160 }}>When</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r) => {
                  const isOpen = expanded === r.run_id;
                  const detail = details[r.run_id];
                  return (
                    <Fragment key={r.run_id}>
                      <tr
                        onClick={() => void toggleRun(r.run_id)}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: isOpen ? '#eef2ff' : 'transparent' }}
                      >
                        <td style={{ padding: '5px 8px', color: '#94a3b8', fontSize: 11 }}>{isOpen ? '▼' : '▶'}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{r.run_id}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12 }}>{r.release}</td>
                        <td style={{ padding: '5px 8px' }}>{num(r.total)}</td>
                        <td style={{ padding: '5px 8px', fontWeight: 600, color: r.success_rate != null && r.success_rate >= 0.9 ? '#16a34a' : '#d97706' }}>{pct(r.success_rate)}</td>
                        <td style={{ padding: '5px 8px', color: r.defects > 0 ? '#a21caf' : '#64748b' }}>{num(r.defects)}</td>
                        <td style={{ padding: '5px 8px', color: '#d97706' }}>{num(r.c4xx)}</td>
                        <td style={{ padding: '5px 8px', color: r.c5xx > 0 ? '#dc2626' : '#64748b' }}>{num(r.c5xx)}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 12 }}>{ms(r.p95_ms)}</td>
                        <td style={{ padding: '5px 8px', color: '#64748b', fontSize: 12 }}>{ago(r.run_ts)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} style={{ padding: '8px 12px 14px 34px', background: '#f8fafc' }}>
                            {detail === 'loading' && (
                              <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading slowest endpoints…</div>
                            )}
                            {detail === 'error' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#b91c1c' }}>
                                <span>Couldn’t load run detail.</span>
                                <button onClick={(e) => { e.stopPropagation(); void fetchDetail(r.run_id); }} style={{ padding: '2px 10px', borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Retry</button>
                              </div>
                            )}
                            {detail && detail !== 'loading' && detail !== 'error' && (
                              detail.slowest.length === 0 ? (
                                <div style={{ color: '#94a3b8', fontSize: 13 }}>{detail.note || 'No reachable timed endpoints in this run.'}</div>
                              ) : (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', marginBottom: 4 }}>Slowest endpoints</div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <tbody>
                                      {detail.slowest.map((s, i) => (
                                        <tr key={`${s.module}-${s.endpoint}-${i}`} style={{ borderBottom: '1px solid #eef2f7' }}>
                                          <td style={{ padding: '3px 8px', color: '#64748b', width: 160 }}>{s.module || '—'}</td>
                                          <td style={{ padding: '3px 8px', fontFamily: 'monospace' }}>{s.endpoint || '—'}</td>
                                          <td style={{ padding: '3px 8px', fontFamily: 'monospace', textAlign: 'right', width: 90, color: '#c2410c', fontWeight: 600 }}>{ms(s.time_ms)}</td>
                                          <td style={{ padding: '3px 8px', fontFamily: 'monospace', textAlign: 'right', width: 50, color: '#64748b' }}>{num(s.http_status)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ))}
    </div>
  );
}
