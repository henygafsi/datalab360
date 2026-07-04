'use client';

/**
 * AiBuildLaunchRail — the landing page's single docked AI entry point.
 *
 * Replaces BOTH modal AI flows (AiDashboardWizard's 3-step popup and
 * AutoCreateModal's portal drawer) with one non-blocking ActionRail:
 *
 *   Describe   — free-text prompt → POST /bi-dashboard (create shell) → hand
 *                off to the editor's docked AI Build section
 *                (/bi-dashboard/{id}?ai=build&prompt=…), where the charts are
 *                generated DIRECTLY onto the grid with an Undo/Refine review.
 *   From source — schema/table pickers → POST /bi-dashboard/auto-create
 *                (the existing service; dashboard + widgets built server-side)
 *                → straight into the editor.
 *
 * The old components stay exported but unmounted.
 */
import { useState } from 'react';
import { Loader2, Sparkles, Table2, LayoutDashboard, Wand2, PencilLine, DatabaseZap } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { createDashboard, autoCreateDashboard } from '@/app/services/api/biDashboardApi';
import { useDataSourcePicker } from '../hooks/useDataSourcePicker';
import ActionRail from '@/app/shared/action-rail/ActionRail';

type Mode = 'describe' | 'source';
type SourceScope = 'schema' | 'table';

const EXAMPLE_PROMPTS = [
  'Revenue by region for the last quarter, plus the month-over-month trend',
  'Customer segments breakdown and average spend per loyalty tier',
  'Compare ad spend against conversions to find efficient campaigns',
];

interface AiBuildLaunchRailProps {
  isOpen: boolean;
  onClose: () => void;
  /** Hand the destination back to the page (it tracks + navigates). */
  onLaunch: (href: string, meta: { projectId: string; mode: Mode }) => void;
}

export default function AiBuildLaunchRail({ isOpen, onClose, onLaunch }: AiBuildLaunchRailProps) {
  // Action-RBAC gate (System 2): both paths create a dashboard
  // (require_action 'bi_reporting','create'). Fail-open while loading.
  const createPerm = useCanPerform('bi_reporting', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;

  const [mode, setMode] = useState<Mode>('describe');
  const [scope, setScope] = useState<SourceScope>('schema');
  const [prompt, setPrompt] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const {
    source, dbOptions, schemaOptions, tableOptions,
    setDatabase, setSchema, setTable,
  } = useDataSourcePicker();

  const canSubmit =
    !submitting &&
    canCreate &&
    (mode === 'describe'
      ? prompt.trim().length > 0
      : !!source.database && !!source.schema && (scope === 'schema' || !!source.table));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'describe') {
        const q = prompt.trim();
        const finalName =
          name.trim() || `[AI] ${q.slice(0, 40)}${q.length > 40 ? '…' : ''}`;
        const dash = await createDashboard({
          project_name: finalName,
          description: `AI build from: "${q}"`,
          tags: ['ai-generated'],
        });
        onLaunch(
          `/bi-dashboard/${dash.project_id}?ai=build&prompt=${encodeURIComponent(q)}`,
          { projectId: dash.project_id, mode },
        );
      } else {
        const res =
          scope === 'schema'
            ? await autoCreateDashboard({
                mode: 'schema',
                database: source.database,
                schema: source.schema,
                name: name.trim() || undefined,
              })
            : await autoCreateDashboard({
                mode: 'table',
                table_fqn: `${source.database}.${source.schema}.${source.table}`,
                name: name.trim() || undefined,
              });
        const projectId = (res.project_id || res.dashboard_id || '') as string;
        if (!projectId) {
          toast.error('Auto-create did not return a project id');
          return;
        }
        const widgetCount = Array.isArray(res.widgets_created) ? res.widgets_created.length : 0;
        toast.success(
          `Dashboard created — ${widgetCount} widget${widgetCount !== 1 ? 's' : ''} generated from your data.`,
        );
        onLaunch(`/bi-dashboard/${projectId}`, { projectId, mode });
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ActionRail
      isOpen={isOpen}
      onClose={onClose}
      title="AI Build"
      description="Generate a dashboard — charts land directly on the grid, reviewable in the editor's docked panel."
      accentClassName="bg-purple-500"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            title={!canCreate ? 'Requires the "create" permission on Business Reporting.' : undefined}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-purple-700 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : mode === 'describe' ? (
              <><Wand2 className="h-4 w-4" /> Create &amp; generate</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Create dashboard</>
            )}
          </button>
        </>
      }
    >
      {/* Mode toggle */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {([
          { id: 'describe', label: 'Describe', icon: PencilLine },
          { id: 'source', label: 'From source', icon: DatabaseZap },
        ] as const).map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                mode === m.id
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {mode === 'describe' ? (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="ai-build-launch-prompt"
              className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              Describe the dashboard you want
            </label>
            <textarea
              id="ai-build-launch-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              autoFocus
              placeholder="e.g. Revenue by region for the last quarter, plus the month-over-month trend"
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">Try an example</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-left text-[11px] text-slate-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-purple-700 dark:hover:bg-purple-900/30"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            A dashboard shell is created, then the editor&apos;s docked AI Build section generates each
            chart straight onto the grid — with per-chart Undo and a Refine loop.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Scope toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setScope('schema')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                scope === 'schema'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> Whole schema
            </button>
            <button
              type="button"
              onClick={() => setScope('table')}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                scope === 'table'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
              )}
            >
              <Table2 className="h-3.5 w-3.5" /> Single table
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {scope === 'schema'
              ? 'Each table is classified into a business domain (Sales, Marketing, Operations, Finance, HR, Customer, Other) — one page per domain.'
              : "A single table's columns are analyzed to build a one-page dashboard with KPIs and charts."}
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Database</label>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={source.database}
              onChange={(e) => setDatabase(e.target.value)}
              disabled={submitting}
            >
              <option value="">Select database…</option>
              {dbOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Schema</label>
            <select
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={source.schema}
              onChange={(e) => setSchema(e.target.value)}
              disabled={!source.database || submitting}
            >
              <option value="">Select schema…</option>
              {schemaOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {scope === 'table' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Table</label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                value={source.table}
                onChange={(e) => setTable(e.target.value)}
                disabled={!source.schema || submitting}
              >
                <option value="">Select table…</option>
                {tableOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Shared: optional name */}
      <div className="mt-4">
        <label
          htmlFor="ai-build-launch-name"
          className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
        >
          Dashboard name (optional)
        </label>
        <input
          id="ai-build-launch-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={mode === 'describe' ? 'Defaults to your prompt' : `e.g. ${source.schema || 'RETAIL'} Overview`}
          disabled={submitting}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>
    </ActionRail>
  );
}
