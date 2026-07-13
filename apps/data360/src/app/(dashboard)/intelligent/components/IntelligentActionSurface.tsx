'use client';

/**
 * IntelligentActionSurface — the agentic command surface for Intelligent
 * Analytics: EVERY AI capability rendered as a governed, verifiable action,
 * sourced live from the registry-in-tables catalog (GET /cortex/actions), not
 * from a hardcoded wall of tabs. This is the "all capabilities as actions" view.
 *
 * Per action:
 *   - why-sentence (the UX-intelligence line) + method chip + required-capability
 *     gate chip (enforced server-side; shown honestly) + verified-✓ (from
 *     POST /cortex/actions/verify contract stamps).
 *   - Read-only actions (probe='get', GET) → "Run" executes inline and shows the
 *     result. Mutating actions → "Open workbench" deep-links to the editor tab
 *     where the change is made with human approval (nothing mutating runs here).
 *
 * A single search box turns the whole catalog into a command palette.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import {
  PiCircleNotch,
  PiPlay,
  PiArrowRight,
  PiShieldCheck,
  PiCheckCircle,
  PiSparkle,
  PiMagnifyingGlass,
  PiLightning,
} from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';

import apiClient from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import {
  getCortexActions,
  verifyCortexActions,
  isActionVerified,
  type AiAction,
  type AiActionCatalog,
} from '@/app/services/cortex';

// Human labels + ordering for the areas (matches the backend catalog areas).
const AREA_META: Record<string, { label: string; hint: string }> = {
  ask: { label: 'Ask your data', hint: 'Conversational analysis — NL → SQL, drafts, completions' },
  agentic: { label: 'Agentic', hint: 'Propose next actions, generate code, synthesize data' },
  model: { label: 'Semantic models', hint: 'Business context that makes NL analytics accurate' },
  ml: { label: 'Machine learning', hint: 'Sentiment, classification, fine-tuning, document AI' },
  search: { label: 'Vector search', hint: 'Embeddings & similarity search' },
  container: { label: 'Container apps', hint: 'Snowpark services, compute pools & Streamlit apps' },
  analyze: { label: 'Analyze', hint: 'Query analytics, exploration & zero-cost local queries' },
  govern: { label: 'Usage & registry', hint: 'AI usage KPIs and the model registry' },
};
const AREA_ORDER = ['ask', 'agentic', 'model', 'ml', 'search', 'container', 'analyze', 'govern'];

// Where a mutating action is actually performed (deep-link to the workbench tab).
const AREA_TAB: Record<string, string> = {
  ask: 'ai-console',
  agentic: 'home',
  model: 'semantic-models',
  ml: 'ml-features',
  search: 'vector-search',
  container: 'snowpark-services',
  analyze: 'query-analytics',
  govern: 'ai-advisor',
};

const METHOD_TINT: Record<string, string> = {
  GET: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  POST: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  PATCH: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

/** "action:cortex/generate" → "generate"; "module:intelligence" → "view". */
function gateLabel(rbac: string): string {
  if (!rbac) return 'view';
  if (rbac.startsWith('module:')) return 'view';
  const slash = rbac.indexOf('/');
  return slash >= 0 ? rbac.slice(slash + 1) : rbac;
}

interface RunState {
  running: boolean;
  result?: unknown;
  error?: string;
}

function ActionCard({
  action,
  onRun,
  run,
  onOpenWorkbench,
}: {
  action: AiAction;
  onRun: (a: AiAction) => void;
  run?: RunState;
  onOpenWorkbench: (a: AiAction) => void;
}) {
  const runnable = action.probe === 'get' && action.method === 'GET';
  const verified = isActionVerified(action.verified_status);
  return (
    <li className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', METHOD_TINT[action.method] ?? METHOD_TINT.GET)}>
          {action.method}
        </span>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{action.label}</span>
        {verified && (
          <span
            title={`Contract verified · ${action.verified_status}`}
            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
          >
            <PiCheckCircle className="h-3 w-3" aria-hidden /> verified
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <PiShieldCheck className="h-3 w-3" aria-hidden />
          cortex·{gateLabel(action.rbac)}
        </span>
        <button
          type="button"
          onClick={() => (runnable ? onRun(action) : onOpenWorkbench(action))}
          disabled={run?.running}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50',
            runnable
              ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800'
              : 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
          )}
        >
          {run?.running ? (
            <PiCircleNotch className="h-3 w-3 animate-spin" />
          ) : runnable ? (
            <PiPlay className="h-3 w-3" />
          ) : (
            <PiArrowRight className="h-3 w-3" />
          )}
          {runnable ? 'Run' : 'Open'}
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{action.why}</p>
      <code className="mt-1 block truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">{action.path}</code>
      {run?.error && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{run.error}</p>
      )}
      {run?.result != null && (
        <pre className="mt-1.5 max-h-44 overflow-auto rounded-md bg-gray-50 p-2 text-[10px] leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          {JSON.stringify(run.result, null, 1).slice(0, 2000)}
        </pre>
      )}
    </li>
  );
}

export default function IntelligentActionSurface() {
  const router = useRouter();
  const { trackFeatureClick } = useTrackEvent();
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [verifying, setVerifying] = useState(false);

  const { data, loading, error, unavailable, refetch } = useCacheAwareQuery<AiActionCatalog>(
    getCortexActions,
    { cacheKeys: [CACHE_KEYS.CORTEX] },
  );

  const runAction = useCallback(async (a: AiAction) => {
    setRuns((r) => ({ ...r, [a.action_id]: { running: true } }));
    trackFeatureClick(`intelligent_action_run_${a.action_id}`);
    try {
      const res = await apiClient.get(a.path);
      setRuns((r) => ({ ...r, [a.action_id]: { running: false, result: res.data?.data ?? res.data } }));
    } catch (err) {
      setRuns((r) => ({
        ...r,
        [a.action_id]: { running: false, error: err instanceof Error ? err.message : 'Request failed' },
      }));
    }
  }, [trackFeatureClick]);

  const openWorkbench = useCallback((a: AiAction) => {
    const tab = AREA_TAB[a.area] ?? 'home';
    trackFeatureClick(`intelligent_action_open_${a.action_id}`);
    router.push(tab === 'home' ? '/intelligent' : `/intelligent?tab=${tab}`, { scroll: false });
    toast(`Opening the ${AREA_META[a.area]?.label ?? 'workbench'} — complete "${a.label}" there.`, { icon: '→' });
  }, [router, trackFeatureClick]);

  const runVerify = useCallback(async () => {
    setVerifying(true);
    trackFeatureClick('intelligent_actions_verify');
    try {
      const res = await verifyCortexActions();
      toast.success(`Verified ${res.healthy_contracts}/${res.probed} contracts healthy`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifying(false);
    }
  }, [refetch, trackFeatureClick]);

  const filtered = useMemo(() => {
    const all = data?.actions ?? [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? all.filter((a) => a.label.toLowerCase().includes(q) || a.why.toLowerCase().includes(q) || a.area.includes(q))
      : all;
    const byArea: Record<string, AiAction[]> = {};
    for (const a of rows) (byArea[a.area] ??= []).push(a);
    return byArea;
  }, [data, query]);

  const areas = useMemo(
    () => AREA_ORDER.filter((a) => (filtered[a]?.length ?? 0) > 0),
    [filtered],
  );
  const total = data?.actions?.length ?? 0;
  const shown = Object.values(filtered).reduce((s, r) => s + r.length, 0);

  return (
    <div className="space-y-4">
      {/* Header + command box + verify */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
            <PiSparkle className="h-4 w-4 text-purple" aria-hidden />
            All AI capabilities as actions
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {total} governed actions · read-only ones run inline, changes open their workbench for approval
          </p>
        </div>
        <button
          type="button"
          onClick={runVerify}
          disabled={verifying}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          title="Replay every read-only action and stamp verified contracts"
        >
          <HiOutlineRefresh className={cn('h-3.5 w-3.5', verifying && 'animate-spin')} />
          Verify contracts
        </button>
      </div>

      <div className="relative">
        <PiMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search capabilities — e.g. suspend, classify, embed, forecast, summarize…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          aria-label="Search AI capabilities"
        />
      </div>

      {unavailable && !loading && (
        <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          The AI action catalog isn&apos;t available on this account yet.
        </p>
      )}
      {error && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
          <PiLightning className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-xs text-amber-700 dark:text-amber-300">{error.message}</p>
          <button type="button" onClick={() => void refetch()} className="text-xs font-semibold text-amber-700 underline dark:text-amber-300">Retry</button>
        </div>
      )}
      {loading && !data && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      )}

      {query && data && (
        <p className="text-[11px] text-gray-400">{shown} of {total} capabilities match &ldquo;{query}&rdquo;</p>
      )}

      {areas.map((area) => {
        const meta = AREA_META[area] ?? { label: area, hint: '' };
        const rows = filtered[area] ?? [];
        return (
          <details key={area} open className="group rounded-xl border border-muted bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{meta.label}</span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">{rows.length}</span>
              <span className="truncate text-[11px] text-gray-400 dark:text-gray-500">{meta.hint}</span>
            </summary>
            <ul className="mt-2 space-y-2">
              {rows.map((a) => (
                <ActionCard
                  key={a.action_id}
                  action={a}
                  run={runs[a.action_id]}
                  onRun={runAction}
                  onOpenWorkbench={openWorkbench}
                />
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
