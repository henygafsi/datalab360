'use client';

/**
 * DeployAppHome — landing route for /deploy-app.
 *
 * Layout:
 *   1. Hero w/ title + subtitle + primary "New app" CTA.
 *   2. Four big tile cards mirroring AppKindPicker — clicking opens the
 *      wizard at step 2 with the kind pre-selected.
 *   3. Recent drafts (last 5) read from `data360.deploy-app.drafts`.
 *   4. Superadmin shortcut chip linking to the running services view.
 *
 * Owns no API state — drafts live entirely in localStorage. The wizard is
 * the only place that produces/clears them.
 */
import {
  ArrowRight,
  BarChart3,
  Container,
  Inbox,
  LayoutDashboard,
  Plug,
  Plus,
  Rocket,
  Server,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LS_KEY_DRAFTS,
  type AppKind,
  type WizardSnapshot,
} from './DeployAppWizard';
import DeploymentApprovals from './DeploymentApprovals';

interface Props {
  onNewApp: () => void;
  onPickKind: (kind: AppKind) => void;
  onResumeDraft: (snap: WizardSnapshot) => void;
}

interface KindTile {
  id: AppKind;
  title: string;
  subtitle: string;
  chip: string;
  Icon: React.ComponentType<{ className?: string }>;
  tint: string;
}

const TILES: KindTile[] = [
  {
    id: 'streamlit',
    title: 'Streamlit Dashboard',
    subtitle: 'Hosted Python dashboard with zero infra.',
    chip: 'Hosted · Streamlit',
    Icon: LayoutDashboard,
    tint: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'container',
    title: 'Container Service',
    subtitle: 'Custom Docker on a managed compute pool.',
    chip: 'Hosted · Container',
    Icon: Container,
    tint: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'chart',
    title: 'Chart Widget',
    subtitle: 'A single visual ready for the BI Dashboard.',
    chip: 'BI Dashboard',
    Icon: BarChart3,
    tint: 'from-amber-500 to-orange-600',
  },
  {
    id: 'connector',
    title: 'Connector',
    subtitle: 'Register a new source for the Connect module.',
    chip: 'Connect',
    Icon: Plug,
    tint: 'from-emerald-500 to-teal-600',
  },
];

export default function DeployAppHome({
  onNewApp,
  onPickKind,
  onResumeDraft,
}: Props) {
  const [drafts, setDrafts] = useState<WizardSnapshot[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(LS_KEY_DRAFTS);
      if (!raw) {
        setDrafts([]);
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        setDrafts((parsed as WizardSnapshot[]).slice(0, 5));
      }
    } catch {
      setDrafts([]);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8">
      {/* Hero ─────────────────────────────────────────────────────── */}
      <section
        aria-label="Deploy App overview"
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-6 dark:border-slate-700 dark:from-cyan-900/20 dark:via-slate-900 dark:to-blue-900/10"
      >
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40">
              <Rocket className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                Deploy App
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Turn data into Streamlit apps, Container services, charts and
                connectors — hosted in your data warehouse.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/intelligent?tab=snowpark-services"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Server className="h-3.5 w-3.5" />
              Manage running services
              <ArrowRight className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={onNewApp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-cyan-700 hover:to-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New app
            </button>
          </div>
        </div>
      </section>

      {/* Kind tiles ────────────────────────────────────────────────── */}
      <section aria-label="App kinds">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pick a starting point
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((tile) => {
            const { Icon } = tile;
            return (
              <li key={tile.id}>
                <button
                  type="button"
                  onClick={() => onPickKind(tile.id)}
                  className="group flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
                      tile.tint,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {tile.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {tile.subtitle}
                    </p>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {tile.chip}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Deployments & approvals ───────────────────────────────────── */}
      <DeploymentApprovals />

      {/* Recent drafts ─────────────────────────────────────────────── */}
      <section aria-label="Recent drafts">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Recent drafts
        </h2>
        {drafts.length === 0 ? (
          <EmptyDrafts onNewApp={onNewApp} />
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
            {drafts.map((d) => (
              <li key={d.draftId}>
                <button
                  type="button"
                  onClick={() => onResumeDraft(d)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                    <Rocket className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {d.appName || `Untitled · ${d.draftId.slice(0, 12)}`}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {(d.kind || 'unset')} · step {d.step} · saved{' '}
                      {formatRelative(d.updatedAt)}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
                    Resume →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EmptyDrafts({ onNewApp }: { onNewApp: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" />
      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        No drafts yet
      </p>
      <p className="mt-1 max-w-xs text-[11px] text-slate-500 dark:text-slate-400">
        Drafts are saved locally as soon as you open the wizard. Start one
        below to see it appear here.
      </p>
      <button
        type="button"
        onClick={onNewApp}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-cyan-700 hover:to-blue-700"
      >
        <Plus className="h-3.5 w-3.5" />
        New app
      </button>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
  return `${Math.floor(diff / 86_400_000)} d ago`;
}
