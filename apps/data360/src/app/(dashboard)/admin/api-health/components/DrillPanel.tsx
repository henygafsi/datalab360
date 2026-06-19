'use client';

import { Button, Text, Title } from 'rizzui';
import { isDefect, parseErrorBody, type ProbeDetail } from './types';

type DrillPanelProps = {
  detail: ProbeDetail | null;
  onClose: () => void;
  onReprobe: (detail: ProbeDetail) => void;
  reprobing: boolean;
};

function statusLabel(detail: ProbeDetail): { text: string; color: string } {
  const r = detail.result;
  const s = r?.status;
  // A defect is surfaced ahead of the plain status so a SQL_COMPILATION_ERROR
  // riding on a 4xx never reads as "Reachable (4xx)".
  if (isDefect(r)) return { text: 'Defect', color: '#a21caf' };
  if (s === 'error') return { text: 'Failing', color: '#dc2626' };
  if (detail.isSlow) return { text: 'Slow', color: '#d97706' };
  if (s === 'warn') return { text: 'Reachable (4xx)', color: '#d97706' };
  if (s === 'success') return { text: 'Healthy', color: '#16a34a' };
  if (s === 'running') return { text: 'Running', color: '#2563eb' };
  return { text: 'Not probed', color: '#94a3b8' };
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
  if (!detail) return null;
  const r = detail.result;
  const status = statusLabel(detail);
  const method = (r?.method || 'GET').toUpperCase();
  const route = r?.method || r?.url ? `${method} ${r?.url || '—'}` : '—';

  // Structured breakdown of the error body (lossless flat/nested shapes).
  const parsed = parseErrorBody(r?.errorBody ?? r?.error);
  const hasStructured =
    !!parsed.code || !!parsed.queryId || !!parsed.snowflakeCode || !!parsed.hint;
  const dash = (v: string | null) => (v && v.trim() ? v : '—');

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

        {/* Raw fallback — the full response body when present, else the message. */}
        <Row label="Raw error" value={r?.errorBody || r?.error || '—'} mono />
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
