'use client';

/**
 * ProbeVsProd — cross-reference the SYNTHETIC probe sweep against REAL
 * production traffic for the same endpoint.
 *
 * The probe board answers "does endpoint X respond right now?"; the persisted
 * runs answer "how has X behaved across releases". This answers the
 * complementary power-user question a Snowflake data-role admin actually asks:
 *
 *   "My probe says X is slow / failing — is it slow / failing in PRODUCTION
 *    too, and how often is it even hit?"
 *
 * Reuse-only (NO new backend route this round):
 *   - getPerfByEndpoint(account)  → GET /administration/performance/{account}/by-endpoint
 *     i.e. per-endpoint telemetry mined from the platform USER_ACTIVITY events
 *     table (requests / error_rate / avg / p95 / cache-hit, server-side).
 *   - The live `results` probe map (passed in as probeRows) is joined CLIENT-SIDE
 *     on (method + normalized path).
 *
 * Join honesty: probes use placeholder ids (e.g. /projects/__test__/...), so
 * only STATIC-path endpoints join; templated/real-id paths legitimately show "—"
 * for the production columns. A "matched N / total" counter + a "matched only"
 * toggle make that explicit instead of letting it read as a dead feature.
 *
 * Latency label honesty: the probe `ms` is full client round-trip; production
 * avg/p95 is SERVER-SIDE duration. The prod column is labelled "server-side" so
 * the comparison is not a lie.
 *
 * Render rules (CLAUDE.md): loading skeleton, honest "—" for null fields, inline
 * error + retry, NotDeployedError (404/501) degrades to a quiet notice. No
 * fabricated numbers — every prod cell is real or "—".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toMessage } from '@/lib/error-messages';
import { useSession } from 'next-auth/react';

import {
  getPerfByEndpoint,
  NotDeployedError,
  type EndpointRow,
} from '@/app/services/admin-performance';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import { SLOW_THRESHOLD_MS } from './types';

/** One flattened probe outcome handed down from the page's `results` map. */
export type ProbeRow = {
  module: string;
  name: string;
  method?: string;
  url?: string;
  status: string;
  ms: number | null;
  httpStatus: number | null;
  category: string; // defect | slow | expected | warn | ok | error
};

type Props = {
  probeRows: ProbeRow[];
  /** Bumps when a run is saved / re-probed so the prod telemetry re-fetches. */
  refreshKey: number;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error' | 'not-deployed' | 'no-account';

const HOURS_OPTIONS = [24, 72, 168] as const;

const CATEGORY_COLOR: Record<string, string> = {
  defect: '#a21caf',
  error: '#dc2626',
  slow: '#c2410c',
  warn: '#d97706',
  expected: '#64748b',
  ok: '#16a34a',
};

function catColor(category: string): string {
  return CATEGORY_COLOR[category] ?? '#94a3b8';
}

const ms = (v: number | null | undefined): string => (v == null ? '—' : `${Math.round(v)} ms`);
const int = (v: number | null | undefined): string => (v == null ? '—' : String(v));
// error_rate / cache_hit_rate come back ALREADY as a percent (see performance
// page's fmtPct), so render directly with one decimal.
const pct = (v: number | null | undefined): string => (v == null ? '—' : `${v.toFixed(1)}%`);

/** Strip query/hash, force one leading slash, drop a trailing slash. */
function normPath(p?: string | null): string {
  if (!p) return '';
  let s = String(p).split('?')[0].split('#')[0].trim();
  if (!s) return '';
  if (!s.startsWith('/')) s = `/${s}`;
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}
function joinKey(method?: string | null, path?: string | null): string {
  return `${(method || 'GET').toUpperCase()} ${normPath(path)}`;
}

/** A divergence verdict comparing the probe outcome to live production stats. */
type Verdict = { text: string; color: string; bg: string; rank: number } | null;

function verdictFor(p: ProbeRow, prod: EndpointRow | undefined): Verdict {
  if (!prod) return null;
  const probeBad = p.category === 'defect' || p.category === 'error';
  const probeSlow = p.category === 'slow' || (p.ms != null && p.ms >= SLOW_THRESHOLD_MS);
  const prodErr = prod.error_rate != null && prod.error_rate > 0;
  const prodSlow = prod.p95_ms != null && prod.p95_ms >= SLOW_THRESHOLD_MS;

  // Highest-signal first: real users are erroring on a route, regardless of probe.
  if (prodErr && !probeBad) {
    return { text: 'Fails in prod', color: '#b91c1c', bg: '#fef2f2', rank: 5 };
  }
  if (probeBad && !prodErr) {
    return { text: 'Probe-only failure', color: '#a21caf', bg: '#fdf4ff', rank: 4 };
  }
  if (prodSlow && !probeSlow) {
    return { text: 'Slow in prod only', color: '#c2410c', bg: '#fff7ed', rank: 3 };
  }
  if (prodSlow && probeSlow) {
    return { text: 'Slow both', color: '#c2410c', bg: '#fff7ed', rank: 3 };
  }
  if (probeSlow && !prodSlow) {
    return { text: 'Probe-slow only', color: '#92400e', bg: '#fffbeb', rank: 2 };
  }
  return { text: 'Agrees', color: '#16a34a', bg: '#f0fdf4', rank: 1 };
}

type JoinedRow = {
  probe: ProbeRow;
  prod: EndpointRow | undefined;
  verdict: Verdict;
};

export function ProbeVsProd({ probeRows, refreshKey }: Props) {
  const { data: session } = useSession();
  const account = (session?.user as { account_name?: string } | undefined)?.account_name ?? null;

  const [state, setState] = useState<LoadState>('idle');
  const [hours, setHours] = useState<number>(24);
  const [prodRows, setProdRows] = useState<EndpointRow[]>([]);
  const [matchedOnly, setMatchedOnly] = useState(true);
  const [search, setSearch] = useState('');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) {
      setState('no-account');
      return;
    }
    setState('loading');
    setAiResult(null);
    setAiError(null);
    try {
      const res = await getPerfByEndpoint(account, { hours, limit: 500 });
      setProdRows(Array.isArray(res?.rows) ? res.rows : []);
      setState('ready');
    } catch (e) {
      if (e instanceof NotDeployedError) setState('not-deployed');
      else setState('error');
    }
  }, [account, hours]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Index production telemetry by (method + normalized path) for the join.
  const prodByKey = useMemo(() => {
    const m = new Map<string, EndpointRow>();
    for (const r of prodRows) {
      const k = joinKey(r.method, r.path);
      // Keep the busiest row when a path collapses to the same key.
      const prev = m.get(k);
      if (!prev || (r.requests ?? 0) > (prev.requests ?? 0)) m.set(k, r);
    }
    return m;
  }, [prodRows]);

  const joined = useMemo<JoinedRow[]>(() => {
    const q = search.trim().toLowerCase();
    const rows: JoinedRow[] = probeRows
      .filter((p) => !!p.url)
      .map((p) => {
        const prod = prodByKey.get(joinKey(p.method, p.url));
        return { probe: p, prod, verdict: verdictFor(p, prod) };
      })
      .filter((r) => (matchedOnly ? !!r.prod : true))
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.probe.module} ${r.probe.name} ${r.probe.url || ''}`.toLowerCase();
        return hay.includes(q);
      });
    // Sort by divergence severity desc, then prod p95 desc.
    rows.sort((a, b) => {
      const ra = a.verdict?.rank ?? 0;
      const rb = b.verdict?.rank ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.prod?.p95_ms ?? -1) - (a.prod?.p95_ms ?? -1);
    });
    return rows;
  }, [probeRows, prodByKey, matchedOnly, search]);

  const matchedCount = useMemo(
    () => probeRows.filter((p) => p.url && prodByKey.has(joinKey(p.method, p.url))).length,
    [probeRows, prodByKey],
  );
  const probedTotal = useMemo(() => probeRows.filter((p) => !!p.url).length, [probeRows]);

  const diagnose = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    // Only the matched, diverging rows are worth a model's attention.
    const diverging = joined.filter((r) => r.prod && r.verdict && r.verdict.rank >= 3).slice(0, 25);
    if (diverging.length === 0) {
      setAiResult('No probe/production divergences in the matched set — probe verdicts agree with live traffic.');
      setAiLoading(false);
      return;
    }
    const lines = diverging.map(
      (r) =>
        `${r.probe.method || 'GET'} ${normPath(r.probe.url)} — probe: ${r.probe.category} ${ms(r.probe.ms)} ; ` +
        `prod ${hours}h: ${int(r.prod?.requests)} req, ${pct(r.prod?.error_rate)} err, p95 ${ms(r.prod?.p95_ms)}, avg ${ms(r.prod?.avg_ms)}`,
    );
    const prompt =
      'You are a senior backend SRE. Below are API endpoints where a synthetic health probe DISAGREES with live production telemetry ' +
      '(probe = full client round-trip on placeholder input; prod = server-side stats from the activity log).\n\n' +
      `${lines.join('\n')}\n\n` +
      'In 3-5 terse bullet points: which endpoints need attention first and why (fails-in-prod and slow-in-prod outrank probe-only noise), ' +
      'and one concrete next check for the top one. Do not name any specific data-warehouse vendor.';
    try {
      const res = await generateCompletion({ prompt, model: 'claude-3-7-sonnet' } as any);
      setAiResult((res?.response || '').trim() || 'No analysis returned.');
    } catch (err: any) {
      setAiError(toMessage(err, 'Analysis failed. Try again.'));
    } finally {
      setAiLoading(false);
    }
  }, [joined, hours]);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Probe vs production</h2>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          Cross-references this sweep against real traffic from the platform activity log — does a probe verdict hold in production?
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {HOURS_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer',
                background: hours === h ? '#eef2ff' : '#fff', color: hours === h ? '#4338ca' : '#374151',
                fontSize: 12, fontWeight: hours === h ? 700 : 500,
              }}
            >
              {h === 168 ? '7d' : `${h}h`}
            </button>
          ))}
          <button
            onClick={() => void load()}
            disabled={state === 'loading'}
            style={{
              padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db',
              cursor: state === 'loading' ? 'not-allowed' : 'pointer', background: '#fff', color: '#374151', fontSize: 13,
            }}
          >
            {state === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {state === 'loading' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 38, borderRadius: 8, background: '#f1f5f9' }} />
          ))}
        </div>
      )}

      {state === 'no-account' && (
        <div style={{ padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 14, background: '#f8fafc' }}>
          Sign-in account is unknown, so production telemetry can&apos;t be scoped. Re-login to enable the production cross-reference.
        </div>
      )}

      {state === 'not-deployed' && (
        <div style={{ padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 14, background: '#f8fafc' }}>
          Production endpoint telemetry (<code style={{ margin: '0 4px' }}>/administration/performance/{'{account}'}/by-endpoint</code>)
          is not live on this backend yet.
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: 14 }}>
          <span style={{ flex: 1 }}>Couldn&apos;t load production telemetry.</span>
          <button onClick={() => void load()} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ef4444', cursor: 'pointer', background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      )}

      {state === 'ready' && (probedTotal === 0 ? (
        <div style={{ padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
          Run a probe sweep first — there are no probed endpoints to cross-reference yet.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter endpoint (module / function / path)…"
              style={{ flex: '1 1 260px', minWidth: 200, padding: '7px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, color: '#374151' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <input type="checkbox" checked={matchedOnly} onChange={(e) => setMatchedOnly(e.target.checked)} />
              Matched only
            </label>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              {matchedCount} of {probedTotal} probed endpoints matched production traffic ({hours === 168 ? '7d' : `${hours}h`})
            </span>
            <button
              onClick={() => void diagnose()}
              disabled={aiLoading}
              style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 6, border: '1px solid #10b981', cursor: aiLoading ? 'not-allowed' : 'pointer', background: '#fff', color: '#047857', fontSize: 12, fontWeight: 600 }}
            >
              {aiLoading ? 'Analyzing…' : 'Triage divergences (AI)'}
            </button>
          </div>

          {aiError && <div style={{ marginBottom: 10, fontSize: 12, color: '#dc2626' }}>{aiError}</div>}
          {aiResult && (
            <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#374151', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {aiResult}
            </div>
          )}

          {matchedCount === 0 && (
            <div style={{ marginBottom: 10, padding: 12, borderRadius: 8, border: '1px dashed #cbd5e1', color: '#94a3b8', fontSize: 13 }}>
              No probed endpoint matched production traffic in the last {hours === 168 ? '7 days' : `${hours}h`}. Probes use placeholder
              ids, so only static-path GETs join; uncheck &quot;Matched only&quot; to see the full probe set with empty prod columns.
            </div>
          )}

          {joined.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Endpoint</th>
                    <th style={{ padding: '6px 8px', width: 130 }}>Probe</th>
                    <th style={{ padding: '6px 8px', width: 80, textAlign: 'right' }}>Prod req</th>
                    <th style={{ padding: '6px 8px', width: 70, textAlign: 'right' }}>Err %</th>
                    <th style={{ padding: '6px 8px', width: 110, textAlign: 'right' }} title="Server-side p95 from the activity log">Prod p95 (svc)</th>
                    <th style={{ padding: '6px 8px', width: 110, textAlign: 'right' }} title="Server-side average from the activity log">Prod avg (svc)</th>
                    <th style={{ padding: '6px 8px', width: 150 }}>Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {joined.map((r) => {
                    const v = r.verdict;
                    const errColor = r.prod?.error_rate != null && r.prod.error_rate > 0 ? '#dc2626' : '#374151';
                    const p95Color = r.prod?.p95_ms != null && r.prod.p95_ms >= SLOW_THRESHOLD_MS ? '#c2410c' : '#374151';
                    return (
                      <tr key={`${r.probe.module}::${r.probe.name}`} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                        <td style={{ padding: '5px 8px' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                            <span style={{ color: '#94a3b8' }}>{r.probe.module} · </span>{r.probe.name}
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                            {(r.probe.method || 'GET').toUpperCase()} {normPath(r.probe.url) || '—'}
                          </div>
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: catColor(r.probe.category), background: `${catColor(r.probe.category)}1a` }}>
                            {r.probe.category}
                          </span>
                          <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{ms(r.probe.ms)}</span>
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>{int(r.prod?.requests)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: errColor }}>{pct(r.prod?.error_rate)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: p95Color }}>{ms(r.prod?.p95_ms)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>{ms(r.prod?.avg_ms)}</td>
                        <td style={{ padding: '5px 8px' }}>
                          {v ? (
                            <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: v.color, background: v.bg }}>
                              {v.text}
                            </span>
                          ) : (
                            <span style={{ color: '#cbd5e1' }} title="No matching production traffic in this window">no prod traffic</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ))}
    </div>
  );
}
