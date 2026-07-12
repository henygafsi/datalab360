'use client';

/**
 * COCO Drafts — the "Drafts" mode of the global chat surface (ChatSidebar).
 * AI not as a tab: describe an intent, COCO returns a JSON proposal draft
 * TESTED on real data (POST /cortex/coco/draft). The card shows the honest
 * test outcome (columns + sample rows / per-step status), the grounding,
 * and deep-links into the target module — NO auto-create here; validation
 * happens in the module itself.
 */

import { useState } from 'react';
import {
  ArrowLeft,
  FileJson,
  Loader2,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Table2,
} from 'lucide-react';
import {
  cocoDraft,
  type CocoDraftResult,
  type DraftModule,
} from '@/app/services/cortex';

const MODULES: { id: DraftModule; label: string }[] = [
  { id: 'sql', label: 'SQL' },
  { id: 'chart', label: 'Chart' },
  { id: 'etl', label: 'ETL pipeline' },
];

const DEEP_LINKS: Record<DraftModule, { label: string; href: string }> = {
  sql: { label: 'Open SQL runner', href: '/workflow/dev-tools?tab=sql' },
  chart: { label: 'Open BI builder', href: '/bi-dashboard' },
  etl: { label: 'Open Workflow builder', href: '/workflow' },
};

/** Honest truncation for verbatim backend errors. */
function truncate(msg: string, max = 300): string {
  return msg.length > max ? `${msg.slice(0, max)}…` : msg;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface CocoDraftsPanelProps {
  onBack: () => void;
  /** Optional seed for the intent textarea (e.g. a question typed in the
   *  Explore & Design Cortex assistant before hand-off to this flow). */
  initialIntent?: string;
  /** Optional seed for the table-FQN input (comma-separated, max 5). */
  initialTables?: string;
}

export default function CocoDraftsPanel({ onBack, initialIntent, initialTables }: CocoDraftsPanelProps) {
  const [module, setModule] = useState<DraftModule>('sql');
  const [intent, setIntent] = useState(initialIntent ?? '');
  const [tablesInput, setTablesInput] = useState(initialTables ?? '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CocoDraftResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!intent.trim() || running) return;
    setRunning(true);
    setResult(null);
    setRequestError(null);
    setShowJson(false);
    setCopied(false);
    try {
      const tables = tablesInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 5);
      const res = await cocoDraft({
        module,
        intent: intent.trim(),
        ...(tables.length > 0 ? { tables } : {}),
      });
      setResult(res);
    } catch (err) {
      setRequestError(truncate(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const copyJson = async () => {
    if (!result?.draft) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.draft, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable (permissions) — button simply stays as Copy */
    }
  };

  const tested = result?.tested;
  const sampleRows = Array.isArray(tested?.sample) ? tested.sample : [];
  const sampleCols =
    tested?.columns && tested.columns.length > 0
      ? tested.columns
      : sampleRows.length > 0
        ? Object.keys(sampleRows[0])
        : [];
  const steps = Array.isArray(tested?.steps) ? tested.steps : [];
  const groundingEntries = result ? Object.entries(result.grounding || {}) : [];
  const deepLink = result ? DEEP_LINKS[result.module] ?? DEEP_LINKS[module] : DEEP_LINKS[module];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="coco-drafts-panel">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <button
          aria-label="Back to conversations"
          onClick={onBack}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 text-white">
          <FileJson className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">Drafts</h3>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            JSON proposals tested on real data — validate in the module
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* ── Form ── */}
        <div className="space-y-2.5">
          {/* Module selector */}
          <div className="flex gap-1.5" role="radiogroup" aria-label="Draft module">
            {MODULES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={module === m.id}
                onClick={() => setModule(m.id)}
                disabled={running}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  module === m.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Intent */}
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            disabled={running}
            rows={3}
            placeholder="What should COCO draft? e.g. Total order amount by channel name"
            aria-label="Draft intent"
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
          />

          {/* Optional tables */}
          <div>
            <input
              value={tablesInput}
              onChange={(e) => setTablesInput(e.target.value)}
              disabled={running}
              placeholder="Tables (optional): DB.SCHEMA.TABLE, DB.SCHEMA.TABLE"
              aria-label="Table FQNs, comma-separated"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
            />
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
              Comma-separated fully-qualified names (max 5). COCO grounds the draft on their real
              columns.
            </p>
          </div>

          {/* Generate */}
          <button
            onClick={generate}
            disabled={!intent.trim() || running}
            data-testid="coco-draft-generate"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Drafting… testing on real data…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate draft
              </>
            )}
          </button>
          {running && (
            <p className="text-center text-[10px] text-gray-400 dark:text-gray-500">
              LLM draft + live test execution — usually 5-30s
            </p>
          )}
        </div>

        {/* ── Request-level failure (HTTP error) ── */}
        {requestError && (
          <div
            className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
            data-testid="coco-draft-error"
          >
            {requestError}
          </div>
        )}

        {/* ── Proposal card ── */}
        {result && (
          <div
            className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
            data-testid="coco-draft-card"
          >
            {/* Badge header */}
            <div
              className={`flex items-center gap-2 px-3 py-2 ${
                result.ready_to_validate
                  ? 'bg-emerald-50 dark:bg-emerald-900/30'
                  : 'bg-red-50 dark:bg-red-900/30'
              }`}
            >
              {result.ready_to_validate ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span
                data-testid="coco-draft-badge"
                className={`text-xs font-semibold ${
                  result.ready_to_validate
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-red-700 dark:text-red-300'
                }`}
              >
                {result.ready_to_validate ? 'Tested on real data' : 'Failed validation'}
              </span>
              <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400">
                {result.module} · {result.model}
              </span>
            </div>

            <div className="space-y-3 p-3">
              {/* Test error — verbatim, truncated */}
              {tested?.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                  {truncate(tested.error)}
                </div>
              )}

              {/* sql/chart: tested columns + sample rows */}
              {result.module !== 'etl' && sampleRows.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    <Table2 className="h-3 w-3" />
                    Live test result · {sampleRows.length} sample row{sampleRows.length > 1 ? 's' : ''}
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-800">
                    <table className="w-full text-[11px]" data-testid="coco-draft-sample-table">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50">
                          {sampleCols.map((c) => (
                            <th
                              key={c}
                              className="whitespace-nowrap px-2 py-1 text-left font-semibold text-gray-600 dark:text-gray-300"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sampleRows.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                            {sampleCols.map((c) => (
                              <td
                                key={c}
                                className="whitespace-nowrap px-2 py-1 text-gray-700 dark:text-gray-300"
                              >
                                {formatCell(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* etl: per-step status */}
              {result.module === 'etl' && steps.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Pipeline steps
                  </p>
                  <ul className="space-y-1" data-testid="coco-draft-steps">
                    {steps.map((s) => {
                      const ok = s.status !== 'failed';
                      return (
                        <li
                          key={s.step}
                          className="flex items-start gap-1.5 rounded-lg border border-gray-100 px-2 py-1.5 text-[11px] dark:border-gray-800"
                        >
                          {ok ? (
                            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                          ) : (
                            <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {s.step}. {s.action_type}
                            </span>
                            <span
                              className={`ml-1.5 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                            >
                              {s.status}
                            </span>
                            {s.error && (
                              <p className="mt-0.5 break-words text-red-600 dark:text-red-400">
                                {truncate(s.error)}
                              </p>
                            )}
                            {s.missing && s.missing.length > 0 && (
                              <p className="mt-0.5 text-amber-600 dark:text-amber-400">
                                missing: {s.missing.join(', ')}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Grounding chips: table → column count */}
              {groundingEntries.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    Grounded on
                  </p>
                  <div className="flex flex-wrap gap-1" data-testid="coco-draft-grounding">
                    {groundingEntries.map(([fqn, cols]) => (
                      <span
                        key={fqn}
                        title={(cols || []).join(', ')}
                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      >
                        <span className="truncate">{fqn}</span>
                        <span className="shrink-0 rounded-full bg-white px-1 font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                          {(cols || []).length} col{(cols || []).length > 1 ? 's' : ''}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Draft JSON — collapsible */}
              {result.draft ? (
                <div className="rounded-lg border border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => setShowJson(!showJson)}
                    aria-expanded={showJson}
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {showJson ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Draft JSON
                  </button>
                  {showJson && (
                    <pre className="max-h-56 overflow-auto border-t border-gray-100 bg-gray-50 p-2 text-[10px] leading-relaxed text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                      {JSON.stringify(result.draft, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  No draft was produced for this intent.
                </p>
              )}

              {/* Actions — copy + module deep-link (validation happens there) */}
              <div className="flex items-center gap-2">
                <button
                  onClick={copyJson}
                  disabled={!result.draft}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
                <a
                  href={deepLink.href}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {deepLink.label}
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
