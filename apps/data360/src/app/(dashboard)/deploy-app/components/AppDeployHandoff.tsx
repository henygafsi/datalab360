'use client';

/**
 * Step 5 — AppDeployHandoff.
 *
 * Big card that explains where the app will land and surfaces ONE primary
 * CTA (kind-dependent) plus a "back to overview" secondary action. Clicking
 * the primary CTA records `ARTEFACT_PUBLISHED` via the parent's
 * `onHandoff` callback, then navigates.
 *
 * Renders the wizard's in-session audit trail at the bottom via the
 * reusable EventTimeline component so superadmins get a clean log of what
 * was done before the redirect.
 */
import {
  ArrowUpRight,
  BarChart3,
  Container,
  LayoutDashboard,
  Plug,
  Rocket,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import EventTimeline, {
  type AuditEvent,
} from '@/components/ui/event-timeline';
import type {
  AppKind,
  AuditEntry,
  WizardSnapshot,
} from './DeployAppWizard';

interface Props {
  snap: WizardSnapshot;
  audit: AuditEntry[];
  buildUrl: () => string;
  onHandoff: () => void;
}

interface HandoffSpec {
  label: string;
  blurb: string;
  Icon: React.ComponentType<{ className?: string }>;
  target: string;
}

const SPEC_BY_KIND: Record<AppKind, HandoffSpec> = {
  streamlit: {
    label: 'Open in Streamlit Apps',
    blurb:
      'You will land on the Streamlit Apps tab with the name, database, schema and main file prefilled.',
    Icon: LayoutDashboard,
    target: 'Hosted App Service · Streamlit',
  },
  container: {
    label: 'Open in Container Services',
    blurb:
      'Container Services will open with the Docker image + compute pool form prefilled.',
    Icon: Container,
    target: 'Hosted App Service · Container',
  },
  chart: {
    label: 'Open in BI Dashboard',
    blurb:
      'The BI Dashboard module will receive the chart spec ready to drop on a report.',
    Icon: BarChart3,
    target: 'BI Dashboard',
  },
  connector: {
    label: 'Open in Connect',
    blurb:
      'The Connect module will open with the connector draft attached.',
    Icon: Plug,
    target: 'Connect',
  },
};

export default function AppDeployHandoff({
  snap,
  audit,
  buildUrl,
  onHandoff,
}: Props) {
  const router = useRouter();
  const kind = snap.kind || 'streamlit';
  const spec = SPEC_BY_KIND[kind];
  const { Icon } = spec;

  const timelineEvents = useMemo<AuditEvent[]>(() => {
    return audit.map((a, idx) => ({
      event_id: `${a.ts}-${idx}`,
      event_type:
        a.kind === 'generate' || a.kind === 'reroll'
          ? 'AI_CODE_GENERATED'
          : a.kind === 'handoff'
            ? 'ARTEFACT_PUBLISHED'
            : 'CONFIG_UPDATED',
      event_details: { message: a.message, kind: a.kind },
      severity: 'info',
      timestamp: new Date(a.ts).toISOString(),
    }));
  }, [audit]);

  const goToHandoff = () => {
    onHandoff();
    const url = buildUrl();
    router.push(url);
  };

  return (
    <div className="space-y-5">
      <header>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Hand off to {spec.target}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          The Deploy App wizard is done. Continue in the destination module
          where the actual provisioning happens.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-6 dark:border-cyan-900/40 dark:from-cyan-900/20 dark:via-slate-900 dark:to-blue-900/20">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40">
              <Rocket className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {snap.appName || `app-${snap.draftId}`}
              </h4>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {spec.blurb}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Chip>kind: {kind}</Chip>
                {snap.source.database && (
                  <Chip>
                    src: {snap.source.database}.{snap.source.schema}.{snap.source.table}
                  </Chip>
                )}
                <Chip>auto-stop: {snap.autoStop ? 'on' : 'off'}</Chip>
                <Chip>est. credits/day: {snap.estCredits}</Chip>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2">
            <button
              type="button"
              onClick={goToHandoff}
              className={cn(
                'group flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all',
                'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 hover:shadow-lg',
              )}
            >
              <Icon className="h-4 w-4" />
              {spec.label}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => router.push('/deploy-app')}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to Deploy App home
            </button>
          </div>
        </div>
      </div>

      {timelineEvents.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Session audit trail
          </h4>
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
            <EventTimeline events={timelineEvents} showFilters={false} maxHeight={280} />
          </div>
        </section>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {children}
    </span>
  );
}
