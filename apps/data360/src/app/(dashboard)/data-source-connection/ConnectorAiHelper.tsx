'use client';

/**
 * AI connector-helper — a docked (non-blocking) right-side panel for the Connect
 * module. The assistant builds the connector configuration inline and applies it
 * straight to the connection form (no centered-modal step wizard).
 *
 * Journey: paste a connection string / config blob / free-text description →
 *   1. runs matchConnectorFromText() — instant, deterministic, offline.
 *   2. if /cortex/complete is reachable, asks Cortex to refine the match,
 *      extract field values, or — when nothing matches a known connector —
 *      propose a brand-new connector definition in the catalog shape.
 *
 * Two result paths:
 *   - Match found       → pre-filled field preview + validateConnectorConfig()
 *                         gate → "Use this connector" routes into the form.
 *   - No match          → read-only proposed-connector card + a Backend Gap
 *                         note (registering a new connector type needs a
 *                         backend endpoint that does not exist yet).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Sparkles, X, Lock, Beaker, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import {
  CONNECTOR_BY_ID,
  buildConnectorPromptSection,
  matchConnectorFromText,
  validateConnectorConfig,
  coerceMatchToConfig,
  type ConnectorDef,
  type ConnectorParam,
} from './connector-catalog-grounding';

/** A connector definition the LLM proposed because nothing existing matched. */
export interface ProposedConnector {
  id: string;
  label: string;
  category: string;
  params: Array<{ name: string; type: string; required: boolean; description?: string }>;
}

interface CortexHelperResult {
  connector_id: string | null;
  fields: Record<string, unknown>;
  proposed_connector: ProposedConnector | null;
}

export interface ConnectorAiHelperProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user accepts a matched connector with a pre-filled config. */
  onUseConnector: (connectorId: string, config: Record<string, unknown>) => void;
}

function buildHelperPrompt(text: string): string {
  const catalog = buildConnectorPromptSection();
  const input = text.slice(0, 600);
  return `You map a data-source connection string or config to a connector. Output ONLY valid JSON (no markdown, all braces closed):
{"connector_id":"<id from catalog or null>","fields":{},"proposed_connector":null}

CONNECTOR CATALOG (one line per connector):
${catalog}

RULES:
- If the input matches a catalog connector, set "connector_id" to its id and put extracted field values in "fields" (keyed by the connector's required field names). Never invent a password — leave secrets out of "fields".
- If NOTHING in the catalog fits, set "connector_id" to null and fill "proposed_connector" with {"id":"","label":"","category":"cloud_storage|warehouse|database|lakehouse","params":[{"name":"","type":"string|number|boolean|secret|enum","required":true}]}.
- Keep it terse. Output JSON only.

Input: ${input}`;
}

/** Best-effort parse of a possibly-fenced / truncated JSON response. */
function parseCortexJson(raw: string): CortexHelperResult | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  if (start > 0) s = s.slice(start);
  try {
    const obj = JSON.parse(s) as Record<string, unknown>;
    return {
      connector_id: typeof obj.connector_id === 'string' ? obj.connector_id : null,
      fields: (obj.fields && typeof obj.fields === 'object') ? (obj.fields as Record<string, unknown>) : {},
      proposed_connector: (obj.proposed_connector && typeof obj.proposed_connector === 'object')
        ? (obj.proposed_connector as ProposedConnector)
        : null,
    };
  } catch {
    return null;
  }
}

type AnalysisState =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'match'; connector: ConnectorDef; config: Record<string, unknown>; source: 'offline' | 'cortex'; reason: string }
  | { kind: 'proposed'; proposed: ProposedConnector; source: 'cortex' }
  | { kind: 'nothing' };

export default function ConnectorAiHelper({ open, onClose, onUseConnector }: ConnectorAiHelperProps) {
  const [text, setText] = useState('');
  const [state, setState] = useState<AnalysisState>({ kind: 'idle' });
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setText('');
      setState({ kind: 'idle' });
    }
  }, [open]);

  // Focus the textarea on open.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Escape to close. This is a non-blocking docked panel — no focus trap /
  // aria-modal (those belong only to a blocking modal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const analyze = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setState({ kind: 'analyzing' });

    // Step 1 — deterministic, instant, always available.
    const offline = matchConnectorFromText(trimmed);

    // Step 2 — try Cortex to refine; fall back to the offline result.
    let cortex: CortexHelperResult | null = null;
    try {
      const completion = await generateCompletion({ prompt: buildHelperPrompt(trimmed), model: 'mistral-7b' });
      cortex = parseCortexJson(completion.response);
    } catch {
      cortex = null;
    }

    // New-connector proposal — only Cortex can produce this.
    if (cortex?.proposed_connector && !cortex.connector_id && !offline.id) {
      const p = cortex.proposed_connector;
      if (p.id && p.label && Array.isArray(p.params)) {
        setState({ kind: 'proposed', proposed: p, source: 'cortex' });
        return;
      }
    }

    // Pick the connector id — prefer a known-catalog Cortex pick, else offline.
    const cortexId = cortex?.connector_id && CONNECTOR_BY_ID.has(cortex.connector_id)
      ? cortex.connector_id
      : null;
    const chosenId = cortexId ?? offline.id;

    if (chosenId && CONNECTOR_BY_ID.has(chosenId)) {
      const def = CONNECTOR_BY_ID.get(chosenId)!;
      // Merge offline-extracted fields with Cortex-extracted fields (Cortex wins).
      const mergedFields: Record<string, unknown> = { ...offline.fields };
      if (cortexId && cortex?.fields) {
        for (const [k, v] of Object.entries(cortex.fields)) {
          if (v !== undefined && v !== null && v !== '') mergedFields[k] = v;
        }
      }
      const config = coerceMatchToConfig(chosenId, mergedFields);
      setState({
        kind: 'match',
        connector: def,
        config,
        source: cortexId ? 'cortex' : 'offline',
        reason: cortexId ? 'matched by AI' : offline.reason,
      });
      return;
    }

    setState({ kind: 'nothing' });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex bg-slate-900/40"
      onClick={onClose}
      aria-hidden="true"
    >
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => e.stopPropagation()}
      className="ml-auto flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800"
    >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-4">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5" />
            <h2 id={titleId} className="text-base font-semibold">AI Connector Helper</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI connector helper"
            className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <label htmlFor={`${titleId}-input`} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Describe your data source, or paste a connection string / config file. The
            assistant identifies the connector and builds its configuration — then applies it to the form.
          </label>
          <textarea
            ref={textareaRef}
            id={`${titleId}-input`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={'postgres://user:pass@db.internal:5432/appdb\n\n— or —\n\nhost = adb-123.azuredatabricks.net\nhttp_path = /sql/1.0/warehouses/abc'}
            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          />

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={analyze}
              disabled={!text.trim() || state.kind === 'analyzing'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-purple-500/40 transition-shadow hover:shadow-md hover:shadow-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {state.kind === 'analyzing' ? 'Analyzing…' : 'Analyze'}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Runs an instant offline match, then refines with AI if available.
            </p>
          </div>

          {/* ── Result: match found ───────────────────────────────────── */}
          {state.kind === 'match' && (
            <MatchResult
              connector={state.connector}
              config={state.config}
              source={state.source}
              reason={state.reason}
              onUse={() => {
                onUseConnector(state.connector.id, state.config);
                onClose();
              }}
            />
          )}

          {/* ── Result: new connector proposed ────────────────────────── */}
          {state.kind === 'proposed' && <ProposedResult proposed={state.proposed} />}

          {/* ── Result: nothing ───────────────────────────────────────── */}
          {state.kind === 'nothing' && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Could not identify a connector.
              </div>
              <p className="mt-1 text-xs">
                The text did not match a known connector and the AI did not propose a new one. Try pasting a fuller
                connection string (with a scheme like <code className="font-mono">postgres://</code>) or pick a
                connector card manually.
              </p>
            </div>
          )}
        </div>
    </div>
    </div>
  );
}

function MatchResult({
  connector,
  config,
  source,
  reason,
  onUse,
}: {
  connector: ConnectorDef;
  config: Record<string, unknown>;
  source: 'offline' | 'cortex';
  reason: string;
  onUse: () => void;
}) {
  const validation = validateConnectorConfig(connector.id, config);

  const renderValue = (param: ConnectorParam): string => {
    const v = config[param.name];
    if (v === undefined || v === null || v === '') return '—';
    if (param.type === 'secret') return '••••••••';
    return String(v);
  };

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">{connector.label}</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {connector.category}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          {source === 'cortex' ? 'AI match' : 'offline match'}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{reason}</p>

      {/* Pre-filled field preview */}
      <dl className="mt-3 space-y-1.5">
        {connector.params.map((p) => {
          const missing = validation.missing.includes(p.name);
          const invalid = validation.invalid.find((i) => i.field === p.name);
          return (
            <div key={p.name} className="grid grid-cols-[130px_1fr] items-start gap-2 text-xs">
              <dt className="font-medium text-slate-600 dark:text-slate-300">
                {p.name}
                {p.required && <span className="text-rose-500"> *</span>}
              </dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {renderValue(p)}
                {missing && (
                  <span className="ml-2 font-sans text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    missing — fill in the form
                  </span>
                )}
                {invalid && (
                  <span className="ml-2 font-sans text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    {invalid.reason}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {!validation.ok && (
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          {validation.missing.length > 0 && (
            <span>{validation.missing.length} required field(s) still need values. </span>
          )}
          {validation.invalid.length > 0 && <span>{validation.invalid.length} field(s) need fixing. </span>}
          You can still continue — the form will block submit until everything is valid.
        </div>
      )}

      <button
        type="button"
        onClick={onUse}
        className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
      >
        Apply to connection form
      </button>
      <p className="mt-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500">
        Populates the fields directly — edit the intent above and re-analyze to adjust.
      </p>
    </div>
  );
}

function ProposedResult({ proposed }: { proposed: ProposedConnector }) {
  const json = JSON.stringify(proposed, null, 2);
  const copy = () => {
    void navigator.clipboard?.writeText(json);
  };
  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-500" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              New connector proposed: {proposed.label}
            </span>
          </div>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Copy className="h-3 w-3" />
            Copy JSON
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          id: <code className="font-mono">{proposed.id}</code> · category: {proposed.category}
        </p>
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-100 p-2 text-[11px] leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          {json}
        </pre>
      </div>

      {/* Backend Gap note — registering a brand-new connector type. */}
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
        <div className="flex items-center gap-2">
          <Lock className="h-3 w-3 text-violet-500" />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
            Backend gap — UX target
          </p>
        </div>
        <dl className="mt-2 space-y-1.5 text-[11px]">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">POST /connect/connectors</dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">{'{ id, label, category, params[] }'}</dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Returns</dt>
            <dd className="font-mono text-slate-800 dark:text-slate-200">{'{ connector_id, status }'}</dd>
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              Registering a brand-new connector type needs a backend register endpoint. The audit found
              <code className="mx-1 font-mono">GET /connect/connectors</code> exists but no write/register endpoint
              does — so this proposal cannot be committed yet.
            </dd>
          </div>
        </dl>
        <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
          <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
          <span className="text-[10px] text-violet-800 dark:text-violet-200">
            Until this lands, copy the JSON above and hand it to the platform team to add to the connector catalog.
          </span>
        </div>
      </div>
    </div>
  );
}
