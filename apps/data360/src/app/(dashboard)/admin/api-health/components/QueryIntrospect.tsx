'use client';

/**
 * QueryIntrospect — resolve ONE warehouse query_id into its Snowflake
 * QUERY_HISTORY record (query_text, execution_status, latency, bytes/rows,
 * warehouse, role, events).
 *
 * Reuses the EXISTING ACCOUNTADMIN-gated GET /admin/api-health/introspect
 * (API.admin.apiHealthIntrospect). Lazy — loaded on demand per row so the
 * board never fan-fires query lookups. Honest states: loading button, inline
 * error, and a quiet "not available yet" when the route is 404/501 (not live).
 *
 * Extracted from DrillPanel so the live drill AND the persistent per-endpoint
 * history view share one introspection block instead of copy-pasting it.
 */
import { useState } from 'react';
import { Button, Text } from 'rizzui';

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

/** Shape of GET /admin/api-health/introspect — every field optional/nullable. */
export type IntrospectEvent = {
  name?: string | null;
  timestamp?: string | null;
  message?: string | null;
  [k: string]: unknown;
};
export type IntrospectResponse = {
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-b border-gray-100 py-1.5 last:border-b-0 dark:border-gray-200">
      <Text className="text-[10px] uppercase tracking-wide text-gray-400">{label}</Text>
      <Text className={`mt-0.5 break-words text-sm text-gray-700 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </Text>
    </div>
  );
}

const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : '—');
const num = (v: number | null | undefined) => (v != null ? String(v) : '—');

type Props = {
  queryId: string;
  /** Optional compact label shown next to the load button. */
  label?: string;
};

export function QueryIntrospect({ queryId, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<IntrospectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = async () => {
    if (!queryId) return;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    setData(null);
    try {
      const resp = await apiClient.get<IntrospectResponse>(API.admin.apiHealthIntrospect(queryId));
      setData((resp.data as any)?.data ?? resp.data ?? null);
    } catch (err: any) {
      const code = err?.response?.status;
      // 404/501 → the introspection route isn't live yet (not a real failure).
      if (code === 404 || code === 501) setUnavailable(true);
      else setError(err?.response?.data?.detail || err?.message || 'Failed to load query');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-1">
      {!data && !unavailable && (
        <Button size="sm" variant="outline" isLoading={loading} onClick={load} className="w-full">
          {label || 'Load query + events'}
        </Button>
      )}
      {error && <Text className="mt-1 text-sm text-red-600">{error}</Text>}
      {unavailable && (
        <Text className="mt-1 text-sm text-gray-400">Query introspection not available yet.</Text>
      )}
      {data && (
        <div className="mt-1.5">
          <Text className="text-[10px] uppercase tracking-wide text-gray-400">SQL</Text>
          {data.query_text ? (
            <pre className="mt-0.5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 font-mono text-[11px] text-gray-700 dark:bg-gray-100">
              {data.query_text}
            </pre>
          ) : (
            <Text className="mt-0.5 text-sm text-gray-400">—</Text>
          )}
          <Row label="Query ID" value={dash(queryId)} mono />
          <Row label="Status" value={dash(data.execution_status)} mono />
          {data.error_message && <Row label="Query error" value={data.error_message} mono />}
          <Row label="Elapsed" value={data.total_elapsed_ms != null ? `${data.total_elapsed_ms} ms` : '—'} mono />
          <Row label="Bytes scanned" value={num(data.bytes_scanned)} mono />
          <Row label="Rows produced" value={num(data.rows_produced)} mono />
          <Row label="Warehouse" value={dash(data.warehouse)} mono />
          <Row label="Role" value={dash(data.role)} mono />
          <div className="py-1.5">
            <Text className="text-[10px] uppercase tracking-wide text-gray-400">
              Events ({data.events?.length ?? 0})
            </Text>
            {data.events && data.events.length > 0 ? (
              <ul className="mt-1 max-h-40 space-y-1 overflow-auto">
                {data.events.map((ev, i) => (
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
  );
}
