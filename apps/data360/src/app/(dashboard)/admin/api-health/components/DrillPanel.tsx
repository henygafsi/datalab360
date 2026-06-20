'use client';

import { useState } from 'react';
import { Button, Text, Title } from 'rizzui';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import { isDefect, isExpected, parseErrorBody, SLOW_THRESHOLD_MS, type ProbeDetail } from './types';

type DrillPanelProps = {
  detail: ProbeDetail | null;
  onClose: () => void;
  onReprobe: (detail: ProbeDetail) => void;
  reprobing: boolean;
};

/** Shape of GET /admin/api-health/introspect — every field optional/nullable. */
type IntrospectEvent = {
  name?: string | null;
  timestamp?: string | null;
  message?: string | null;
  [k: string]: unknown;
};
type IntrospectResponse = {
  query_text?: string | null;
  execution_status?: string | null;
  error_message?: string | null;
  total_elapsed_ms?: number | null;
  bytes_scanned?: number | null;
  rows_produced?: number | null;
  warehouse?: string | null;
  role?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  events?: IntrospectEvent[] | null;
};

function statusLabel(detail: ProbeDetail): { text: string; color: string } {
  const r = detail.result;
  const s = r?.status;
  // Category priority: defect > error > slow > expected > residual-warn > success.
  // A defect is surfaced ahead of the plain status so a SQL_COMPILATION_ERROR
  // riding on a 4xx never reads as "Reachable (4xx)".
  if (isDefect(r)) return { text: 'Defect', color: '#a21caf' };
  if (s === 'error') return { text: 'Failing', color: '#dc2626' };
  if (detail.isSlow) return { text: 'Slow', color: '#d97706' };
  // Expected = the API correctly rejecting fake/empty probe input — neutral grey.
  if (isExpected(r)) return { text: 'Expected', color: '#64748b' };
  if (s === 'warn') return { text: 'Reachable (4xx)', color: '#d97706' };
  if (s === 'success') return { text: 'Healthy', color: '#16a34a' };
  if (s === 'running') return { text: 'Running', color: '#2563eb' };
  return { text: 'Not probed', color: '#94a3b8' };
}

/** Per-action verdict shown in the drill panel so each row reads as monitorable. */
function assessment(detail: ProbeDetail): { text: string; color: string } | null {
  const r = detail.result;
  if (!r) return null;
  if (isDefect(r)) {
    return {
      text: 'Real bug — needs a backend fix. See the parsed error code / engine code / query ID below.',
      color: '#a21caf',
    };
  }
  if (detail.isSlow) {
    return {
      text: `Succeeds but exceeds ${(SLOW_THRESHOLD_MS / 1000).toFixed(1)}s — optimization candidate.`,
      color: '#c2410c',
    };
  }
  if (isExpected(r)) {
    return {
      text: 'Correct API behavior for the probe’s test input (fake id / empty body) — no action.',
      color: '#475569',
    };
  }
  if (r.status === 'warn') {
    return {
      text: 'Reachable but returned an unrecognised 4xx — worth a glance.',
      color: '#92400e',
    };
  }
  if (r.status === 'success') {
    return { text: 'Healthy — responded successfully within the latency budget.', color: '#16a34a' };
  }
  return null;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-200">
      <Text className="text-[11px] uppercase tracking-wide text-gray-400">{label}</Text>
      <Text
        className={`mt-0.5 break-words text-sm text-gray-700 ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </Text>
    </div>
  );
}

/** Docked (non-blocking) detail panel for a probed endpoint. */
export function DrillPanel({ detail, onClose, onReprobe, reprobing }: DrillPanelProps) {
  // Response data is expanded BY DEFAULT for success rows so the exact payload
  // is visible without a click; the toggle only collapses it.
  const [showData, setShowData] = useState(true);

  // Snowflake query introspection state (lazy — loaded on demand per row).
  const [introLoading, setIntroLoading] = useState(false);
  const [introData, setIntroData] = useState<IntrospectResponse | null>(null);
  const [introError, setIntroError] = useState<string | null>(null);
  const [introUnavailable, setIntroUnavailable] = useState(false);

  // "Ask coco" AI analysis state.
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!detail) return null;
  const r = detail.result;
  const status = statusLabel(detail);
  const verdict = assessment(detail);
  const method = (r?.method || 'GET').toUpperCase();
  const route = r?.method || r?.url ? `${method} ${r?.url || '—'}` : '—';

  // Structured breakdown of the error body (lossless flat/nested shapes).
  const parsed = parseErrorBody(r?.errorBody ?? r?.error);
  const hasStructured =
    !!parsed.code || !!parsed.queryId || !!parsed.snowflakeCode || !!parsed.hint;
  const dash = (v: string | null) => (v && v.trim() ? v : '—');
  // No-fake-0: a real numeric 0 must render as "0", only null/undefined → "—".
  const num = (v: number | null | undefined) => (v != null ? String(v) : '—');

  // A query_id can ride on either a failing error body OR a successful payload
  // (some success responses echo the warehouse query id). Try both.
  const queryId = parsed.queryId || parseErrorBody(r?.data).queryId;

  const loadIntrospect = async () => {
    if (!queryId) return;
    setIntroLoading(true);
    setIntroError(null);
    setIntroUnavailable(false);
    setIntroData(null);
    try {
      const resp = await apiClient.get<IntrospectResponse>(API.admin.apiHealthIntrospect(queryId));
      setIntroData((resp.data as any)?.data ?? resp.data ?? null);
    } catch (err: any) {
      const code = err?.response?.status;
      // 404/501 → the parallel backend route isn't live yet (not a real failure).
      if (code === 404 || code === 501) setIntroUnavailable(true);
      else setIntroError(err?.response?.data?.detail || err?.message || 'Failed to load query');
    } finally {
      setIntroLoading(false);
    }
  };

  const askCoco = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    const errText = parsed.message || r?.error || r?.errorBody || 'none';
    const prompt =
      'You are a senior backend diagnostician. A health probe hit an API endpoint and we need a concise root-cause analysis and recommended fix.\n\n' +
      `Module: ${detail.module}\n` +
      `Function: ${detail.name}\n` +
      `Method: ${method}\n` +
      `Route: ${r?.url || 'unknown'}\n` +
      `Probe status: ${r?.status || 'unknown'}\n` +
      `HTTP status: ${r?.httpStatus != null ? r.httpStatus : 'n/a'}\n` +
      `Latency: ${r?.ms != null ? `${r.ms} ms` : 'n/a'}\n` +
      `Error: ${errText}\n` +
      (parsed.code ? `Error code: ${parsed.code}\n` : '') +
      (parsed.snowflakeCode ? `Engine code: ${parsed.snowflakeCode}\n` : '') +
      (parsed.hint ? `Hint: ${parsed.hint}\n` : '') +
      `Response data snapshot: ${(r?.data || '—').slice(0, 1200)}\n\n` +
      'Give: (1) the most likely root cause in 1-2 sentences, (2) a concrete recommended fix. Be terse and technical. Do not name any specific data-warehouse vendor.';
    try {
      const res = await generateCompletion({ prompt, model: 'claude-3-7-sonnet' } as any);
      setAiResult((res?.response || '').trim() || 'No recommendation returned.');
    } catch (err: any) {
      setAiError(err?.message || 'Analysis failed. Try again.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <aside className="sticky top-4 w-full rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-50 lg:w-[340px]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-200">
        <Title as="h3" className="text-sm font-semibold">
          Endpoint detail
        </Title>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      <div className="px-4 py-2">
        <Row label="Module" value={detail.module} />
        <Row label="Function" value={detail.name} mono />
        <div className="border-b border-gray-100 py-2 dark:border-gray-200">
          <Text className="text-[11px] uppercase tracking-wide text-gray-400">Status</Text>
          <span
            className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold"
            style={{ color: status.color, background: `${status.color}1a` }}
          >
            {status.text}
          </span>
        </div>

        {/* Assessment — the per-action verdict so each row is self-explanatory. */}
        {verdict && (
          <div className="border-b border-gray-100 py-2 dark:border-gray-200">
            <Text className="text-[11px] uppercase tracking-wide text-gray-400">Assessment</Text>
            <Text className="mt-0.5 text-sm leading-snug" style={{ color: verdict.color }}>
              {verdict.text}
            </Text>
          </div>
        )}

        <Row label="Method" value={method} mono />
        <Row label="Route" value={route} mono />
        <Row label="Latency" value={r?.ms != null ? `${r.ms} ms` : '—'} mono />
        <Row label="HTTP" value={r?.httpStatus != null ? String(r.httpStatus) : '—'} mono />

        {hasStructured && (
          <>
            <div className="pt-2">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
                Structured error
              </Text>
            </div>
            <Row label="Error code" value={dash(parsed.code)} mono />
            <Row label="Snowflake code" value={dash(parsed.snowflakeCode)} mono />
            <Row label="Query ID" value={dash(parsed.queryId)} mono />
            <Row label="Hint" value={dash(parsed.hint)} />
            <Row label="Message" value={dash(parsed.message)} />
          </>
        )}

        {/* Response data — the EXACT (capped) payload returned on a success probe.
            Expanded by default so the user always sees the output without a click. */}
        {r?.status === 'success' && (
          <div className="border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-200">
            <button
              onClick={() => setShowData((v) => !v)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={showData}
            >
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                Response data
              </Text>
              <span className="text-xs text-gray-400">{showData ? '▾ Hide' : '▸ Show'}</span>
            </button>
            {showData &&
              (r.data ? (
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-700 dark:bg-gray-100">
                  {r.data}
                </pre>
              ) : (
                <Text className="mt-1 text-sm text-gray-400">—</Text>
              ))}
          </div>
        )}

        {/* Raw fallback — the full response body when present, else the message.
            Only meaningful for warn/error rows (success rows carry `data` above). */}
        {r?.status !== 'success' && (
          <Row label="Raw error" value={r?.errorBody || r?.error || '—'} mono />
        )}

        {/* Snowflake query — resolve the underlying warehouse query + events. */}
        {queryId && (
          <div className="border-b border-gray-100 py-2 last:border-b-0 dark:border-gray-200">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
              Snowflake query
            </Text>
            {!introData && !introUnavailable && (
              <Button
                size="sm"
                variant="outline"
                isLoading={introLoading}
                onClick={loadIntrospect}
                className="mt-1.5 w-full"
              >
                Load query + events
              </Button>
            )}
            {introError && <Text className="mt-1 text-sm text-red-600">{introError}</Text>}
            {introUnavailable && (
              <Text className="mt-1 text-sm text-gray-400">
                Query introspection not available yet.
              </Text>
            )}
            {introData && (
              <div className="mt-1.5">
                <Text className="text-[10px] uppercase tracking-wide text-gray-400">SQL</Text>
                {introData.query_text ? (
                  <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-700 dark:bg-gray-100">
                    {introData.query_text}
                  </pre>
                ) : (
                  <Text className="mt-0.5 text-sm text-gray-400">—</Text>
                )}
                <Row label="Status" value={dash(introData.execution_status ?? null)} mono />
                {introData.error_message && (
                  <Row label="Query error" value={introData.error_message} mono />
                )}
                <Row label="Elapsed" value={introData.total_elapsed_ms != null ? `${introData.total_elapsed_ms} ms` : '—'} mono />
                <Row label="Bytes scanned" value={num(introData.bytes_scanned)} mono />
                <Row label="Rows produced" value={num(introData.rows_produced)} mono />
                <Row label="Warehouse" value={dash(introData.warehouse ?? null)} mono />
                <Row label="Role" value={dash(introData.role ?? null)} mono />
                <div className="py-2">
                  <Text className="text-[10px] uppercase tracking-wide text-gray-400">
                    Events ({introData.events?.length ?? 0})
                  </Text>
                  {introData.events && introData.events.length > 0 ? (
                    <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
                      {introData.events.map((ev, i) => (
                        <li
                          key={i}
                          className="rounded bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-600 dark:bg-gray-100"
                        >
                          <span className="font-semibold">{ev.name || ev.message || `event ${i + 1}`}</span>
                          {ev.timestamp ? <span className="text-gray-400"> · {ev.timestamp}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Text className="mt-1 text-sm text-gray-400">—</Text>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ask coco — AI root-cause + recommended fix for this call. */}
        <div className="py-2">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
            AI analysis
          </Text>
          <Button
            size="sm"
            variant="outline"
            isLoading={aiLoading}
            onClick={askCoco}
            className="mt-1.5 w-full"
          >
            Ask coco
          </Button>
          {aiError && <Text className="mt-1 text-sm text-red-600">{aiError}</Text>}
          {aiResult && (
            <div className="mt-1.5 whitespace-pre-wrap break-words rounded bg-emerald-50 p-2 text-[12px] leading-relaxed text-gray-700 dark:bg-gray-100">
              {aiResult}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-200">
        <Button
          size="sm"
          variant="outline"
          isLoading={reprobing}
          onClick={() => onReprobe(detail)}
          className="w-full"
        >
          Re-probe
        </Button>
      </div>
    </aside>
  );
}
