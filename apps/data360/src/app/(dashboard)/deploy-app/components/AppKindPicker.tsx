'use client';

/**
 * Step 1 — AppKindPicker.
 *
 * Four cards: Streamlit Dashboard / Container Service / Chart Widget /
 * Connector. Each surfaces the downstream target chip so the user knows
 * exactly where the wizard will hand off in step 5.
 *
 * Pure presentational — owns no state beyond the controlled `value` prop.
 */
import {
  BarChart3,
  Boxes,
  Check,
  Container,
  LayoutDashboard,
  Plug,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppKind } from './DeployAppWizard';

interface KindOption {
  id: AppKind;
  title: string;
  subtitle: string;
  chip: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Persona blurb to set expectations without overloading the card. */
  best: string;
}

const OPTIONS: KindOption[] = [
  {
    id: 'streamlit',
    title: 'Streamlit Dashboard',
    subtitle: 'Snowflake-hosted Python dashboard, no infra to manage.',
    chip: '→ Snowpark Streamlit Apps',
    Icon: LayoutDashboard,
    best: 'Best for analyst self-service & one-page reports.',
  },
  {
    id: 'container',
    title: 'Container Service',
    subtitle: 'Custom Docker image running on a Snowpark compute pool.',
    chip: '→ Snowpark Container Services',
    Icon: Container,
    best: 'Best for custom UIs, model-serving and APIs.',
  },
  {
    id: 'chart',
    title: 'Chart Widget',
    subtitle: 'A single visual that drops into the BI Dashboard module.',
    chip: '→ BI Dashboard',
    Icon: BarChart3,
    best: 'Best for embedding KPIs inside an existing report.',
  },
  {
    id: 'connector',
    title: 'Connector',
    subtitle: 'Register a new data source for the Connect module.',
    chip: '→ Connect module',
    Icon: Plug,
    best: 'Best for plugging in a new feed or external API.',
  },
];

interface Props {
  value: AppKind | null;
  appName: string;
  onAppNameChange: (v: string) => void;
  onChange: (kind: AppKind) => void;
}

export default function AppKindPicker({
  value,
  appName,
  onAppNameChange,
  onChange,
}: Props) {
  return (
    <div className="space-y-5">
      <header>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          What kind of app are you deploying?
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Pick the artefact type. The wizard will hand off to the matching
          Data360 module for the actual deployment.
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <label
          htmlFor="deploy-app-name"
          className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          App name
        </label>
        <input
          id="deploy-app-name"
          type="text"
          value={appName}
          onChange={(e) => onAppNameChange(e.target.value)}
          placeholder="sales-overview"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-cyan-900/40"
        />
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Optional. Used as the pre-fill on the Snowpark Services form.
        </p>
      </div>

      <ul
        role="radiogroup"
        aria-label="App kind"
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          const { Icon } = opt;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(opt.id)}
                className={cn(
                  'group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-cyan-500 bg-cyan-50/60 ring-2 ring-cyan-200 dark:border-cyan-500 dark:bg-cyan-900/20 dark:ring-cyan-900/40'
                    : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-cyan-700 dark:hover:bg-cyan-900/10',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    active
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-cyan-100 group-hover:text-cyan-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-cyan-900/40 dark:group-hover:text-cyan-300',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {opt.title}
                    </span>
                    {active && (
                      <Check className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">
                    {opt.subtitle}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        active
                          ? 'border-cyan-300 bg-cyan-100 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-900/40 dark:text-cyan-200'
                          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      )}
                    >
                      <Boxes className="h-3 w-3" />
                      {opt.chip}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {opt.best}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
