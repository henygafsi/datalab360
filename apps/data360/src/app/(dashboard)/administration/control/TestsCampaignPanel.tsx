'use client';

/**
 * TestsCampaignPanel — last recorded test-campaign artefact for the
 * administration control page (accountadmin only).
 *
 * Reads exclusively through the shared administration control service.
 * Silent refresh at mount only — no polling, no run-from-UI affordance
 * (campaigns are produced by scripts/test_matrix.py, never from here).
 *
 * Honesty rules: when the backend answers `{state: 'unavailable'}` the
 * panel shows the backend's own reason verbatim; when a real artefact
 * exists it renders only the fields that are actually present — nothing
 * is inferred, defaulted or invented, and unknown values render '—'.
 */

import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

import PreparingState from '@/app/shared/command-center/lib/PreparingState';
import EmptyState from '@/components/ui/EmptyState';
import {
  getLastTestCampaign,
  isAdminEnvelope,
  type AdminEnvelope,
} from '@/app/services/administration/control';

/* ------------------------------------------------------------------ */
/* Tolerant readers — the artefact shape is owned by the backend       */
/* ------------------------------------------------------------------ */

type Artefact = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function formatCount(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('en-US');
}

function formatTimestamp(value: string | null): string | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return value; // show verbatim rather than hide it
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ModuleRow {
  label: string;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  total: number | null;
}

/** Accepts `modules: [...]`, `by_module: {...}` or `per_module: {...}`. */
function extractModuleRows(data: Artefact): ModuleRow[] {
  const raw = data.modules ?? data.by_module ?? data.per_module;
  let entries: Array<[string, Artefact]> = [];

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Artefact;
      const label = str(rec.module) ?? str(rec.name);
      if (label) entries.push([label, rec]);
    }
  } else if (raw !== null && typeof raw === 'object') {
    entries = Object.entries(raw as Record<string, unknown>).filter(
      (entry): entry is [string, Artefact] =>
        typeof entry[1] === 'object' && entry[1] !== null,
    );
  }

  return entries.map(([label, rec]) => ({
    label,
    passed: num(rec.passed),
    failed: num(rec.failed),
    skipped: num(rec.skipped),
    total: num(rec.total),
  }));
}

/** Totals live either at the top level or under a `totals` object. */
function extractTotals(data: Artefact): {
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  total: number | null;
} {
  const scope =
    typeof data.totals === 'object' && data.totals !== null
      ? (data.totals as Artefact)
      : data;
  return {
    passed: num(scope.passed),
    failed: num(scope.failed),
    skipped: num(scope.skipped),
    total: num(scope.total),
  };
}

const HANDLED_KEYS = new Set([
  'state',
  'meta',
  'execution_time_ms',
  'modules',
  'by_module',
  'per_module',
  'totals',
  'passed',
  'failed',
  'skipped',
  'total',
  'source',
  'generated_at',
  'ran_at',
  'finished_at',
  'timestamp',
]);

/** Remaining top-level scalars, shown as-is so nothing real is hidden. */
function extractExtraScalars(data: Artefact): Array<[string, string]> {
  return Object.entries(data)
    .filter(
      ([key, value]) =>
        !HANDLED_KEYS.has(key) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'),
    )
    .map(([key, value]) => [key.replace(/_/g, ' '), String(value)]);
}

type PanelPhase =
  | { phase: 'loading' }
  | { phase: 'preparing'; envelope: AdminEnvelope }
  | { phase: 'unavailable'; envelope: AdminEnvelope }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: Artefact };

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function TestsCampaignPanel() {
  const [state, setState] = useState<PanelPhase>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = (await getLastTestCampaign()) as unknown;
        if (cancelled) return;
        if (isAdminEnvelope(body)) {
          setState({
            phase: body.state === 'preparing' ? 'preparing' : 'unavailable',
            envelope: body,
          });
          return;
        }
        setState({ phase: 'ready', data: body as Artefact });
      } catch (error) {
        if (cancelled) return;
        setState({
          phase: 'error',
          message:
            error instanceof Error ? error.message : 'request failed',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      role="region"
      aria-label="Test campaign"
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    >
      <header className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Last test campaign
        </h2>
      </header>

      <div className="p-4">
        {state.phase === 'loading' && (
          <div className="space-y-2 py-2" aria-hidden="true">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        )}

        {state.phase === 'preparing' && (
          <PreparingState domainLabel="test campaign results" />
        )}

        {state.phase === 'unavailable' && (
          <div title={state.envelope.source ?? undefined}>
            <EmptyState
              compact
              icon={FlaskConical}
              title="No test campaign recorded yet"
              description={state.envelope.reason}
            />
          </div>
        )}

        {state.phase === 'error' && (
          <p className="py-4 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load the last test campaign — {state.message}
          </p>
        )}

        {state.phase === 'ready' && <CampaignBody data={state.data} />}
      </div>
    </section>
  );
}

function CampaignBody({ data }: { data: Artefact }) {
  const totals = extractTotals(data);
  const moduleRows = extractModuleRows(data);
  const extras = extractExtraScalars(data);
  const source = str(data.source);
  const when = formatTimestamp(
    str(data.generated_at) ??
      str(data.ran_at) ??
      str(data.finished_at) ??
      str(data.timestamp),
  );

  const hasTotals =
    totals.passed != null || totals.failed != null || totals.total != null;

  return (
    <div className="space-y-4" title={source ?? undefined}>
      {when != null && (
        <p className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
          Recorded {when}
        </p>
      )}

      {hasTotals && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Passed
            </p>
            <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCount(totals.passed)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Failed
            </p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                totals.failed != null && totals.failed > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {formatCount(totals.failed)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Total
            </p>
            <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCount(totals.total)}
            </p>
          </div>
        </div>
      )}

      {moduleRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Module
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Passed
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Failed
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {moduleRows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">
                    {row.label}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-800 dark:text-slate-200">
                    {formatCount(row.passed)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums ${
                      row.failed != null && row.failed > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {formatCount(row.failed)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                    {formatCount(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {extras.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {extras.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-2">
              <dt className="text-slate-500 dark:text-slate-400">{key}</dt>
              <dd className="truncate tabular-nums text-slate-800 dark:text-slate-200">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {!hasTotals && moduleRows.length === 0 && extras.length === 0 && (
        <EmptyState
          compact
          icon={FlaskConical}
          title="Campaign artefact has no readable fields"
          description="The recorded artefact contains no totals, module results or scalar fields this panel can display."
        />
      )}
    </div>
  );
}
