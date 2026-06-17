'use client';

/**
 * Step 4 — AppCodeReview.
 *
 * - Top: compact model selector + Reroll button. The reroll fires the
 *   parent's `onReroll` which re-runs `generateCompletion` with the current
 *   prompt and the freshly-picked model.
 * - Body: read-only `<pre>` of the generated code (kept simple; full syntax
 *   highlighting was deliberately out of scope to avoid pulling a new dep).
 * - "Test in sandbox" → Backend gap card (POST /sandbox/execute is not live
 *   yet), styled to match the WizardPreflightPanel pattern.
 * - Side panel: estimated cost chip + auto-stop toggle (defaulted ON
 *   upstream for the QA persona).
 */
import {
  AlertCircle,
  Beaker,
  Coins,
  Loader2,
  Lock,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { ModelInfo } from '@/components/ui/model-selector';
import type { WizardSnapshot } from './DeployAppWizard';

interface Props {
  snap: WizardSnapshot;
  models: ModelInfo[];
  error: string | null;
  onModelChange: (modelId: string) => void;
  onReroll: () => void;
  onToggleAutoStop: (v: boolean) => void;
  onEstimateCredits: (v: number) => void;
  busy: boolean;
}

const COST_PER_KIND: Record<string, number> = {
  streamlit: 8,
  container: 22,
  chart: 3,
  connector: 4,
};

export default function AppCodeReview({
  snap,
  models,
  error,
  onModelChange,
  onReroll,
  onToggleAutoStop,
  onEstimateCredits,
  busy,
}: Props) {
  // Naive cost estimate: per-kind base × auto-stop discount. Surfaces in the
  // side chip; the real number will come from the deploy form on the
  // Snowpark Services side.
  useEffect(() => {
    const base = COST_PER_KIND[snap.kind || 'chart'] ?? 5;
    const est = snap.autoStop ? Math.round(base * 0.6) : base;
    onEstimateCredits(est);
  }, [snap.kind, snap.autoStop, onEstimateCredits]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Review the generated code
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Reroll with a different model if you don&apos;t like the draft.
              The code ships read-only — edits happen post-deploy.
            </p>
          </div>
        </header>

        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="deploy-app-reroll-model"
              className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
            >
              Model
            </label>
            <select
              id="deploy-app-reroll-model"
              value={snap.modelId}
              onChange={(e) => onModelChange(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onReroll}
              disabled={busy || !snap.prompt.trim()}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                busy || !snap.prompt.trim()
                  ? 'cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md hover:from-purple-700 hover:to-fuchsia-700',
              )}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Reroll
            </button>
          </div>
          {error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Generated code
            </span>
            <span className="text-[10px] text-slate-400">read-only</span>
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100 dark:bg-slate-950">
            {snap.generatedCode || '// nothing generated yet — go back to step 3'}
          </pre>
        </div>

        <SandboxBackendGap />
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <Coins className="h-3.5 w-3.5 text-amber-500" />
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Estimated cost
            </h4>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {snap.estCredits}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            credits / day (rough)
          </p>
          <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
            Refined on the hosted app service form.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Auto-stop
            </h4>
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              QA-safe
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleAutoStop(!snap.autoStop)}
            aria-pressed={snap.autoStop}
            className="mt-2 flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span>{snap.autoStop ? 'On — drop after 1 h idle' : 'Off — keep running'}</span>
            {snap.autoStop ? (
              <ToggleRight className="h-4 w-4 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-slate-400" />
            )}
          </button>
          <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
            Recommended for QA &amp; demo sandboxes.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sandbox-execute Backend Gap (visual style cloned from WizardPreflightPanel).
 * ────────────────────────────────────────────────────────────────────────── */

function SandboxBackendGap() {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-violet-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — UX target
        </p>
      </div>
      <dl className="mt-2 space-y-1.5 text-[11px]">
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">
            Endpoint
          </dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">
            POST /sandbox/execute
          </dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">
            {`{ kind, code, source: { database, schema, table }, auto_stop }`}
          </dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Returns</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">
            {`{ sandbox_id, status, logs_url }`}
          </dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
          <dd className="text-slate-700 dark:text-slate-300">
            Lets the user dry-run the generated app against the live source
            before handing off to the hosted app service.
          </dd>
        </div>
      </dl>
      <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
        <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
        <span className="text-[10px] text-violet-800 dark:text-violet-200">
          Until this lands, ship straight to the hosted app service and use its
          built-in &quot;test run&quot; button.
        </span>
      </div>
    </div>
  );
}
