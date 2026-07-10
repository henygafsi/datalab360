'use client';

/**
 * Projects cockpit — the page's axis right-rail (shared <AxisCockpit>
 * primitive, same pattern as /governance and account-overview).
 *
 * Data honesty: ONE unified-projects snapshot feeds Overview + Deployments
 * (`deployment_version` / `current_version_num` come straight from the list
 * endpoint — no fan-out); Activity reads the real USER_ACTIVITY feed filtered
 * to the projects module. Every number is fetched, never assumed; while a
 * fetch is in flight the axis reports severity 'idle' and the body shows a
 * skeleton (data-first, no components-before-data).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, History, Rocket } from 'lucide-react';
import AxisCockpit, {
  type AxisDef,
  type AxisSeverity,
} from '@/app/shared/cockpit/AxisCockpit';
import { getUnifiedProjects, type UnifiedProject } from '@/app/services/api/projectsApi';
import { getActivityFeed } from '@/app/services/command-center';
import type { ActivityEvent } from '@/app/services/command-center/types';

function Skeleton() {
  return (
    <div className="space-y-2 p-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
      <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{label}</span>
      <span className="ml-3 font-semibold tabular-nums text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}

export default function ProjectsCockpit() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [activeAxis, setActiveAxis] = useState<string | null>('overview');
  const [projects, setProjects] = useState<UnifiedProject[] | null>(null);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [eventsFailed, setEventsFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    getUnifiedProjects({ mine_only: true, limit: 100, offset: 0 })
      .then((res) => {
        if (ignore) return;
        setProjects((res?.projects ?? []).filter((p: UnifiedProject) => p.status !== 'deleted'));
      })
      .catch(() => {
        if (!ignore) setProjectsFailed(true);
      });
    getActivityFeed(15, { days: 7, module_name: 'projects' })
      .then((res) => {
        if (ignore) return;
        setEvents(res?.events ?? []);
      })
      .catch(() => {
        if (!ignore) setEventsFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const openAxis = useCallback((id: string) => {
    setActiveAxis(id);
    setOpen(true);
  }, []);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    (projects ?? []).forEach((p) => m.set(p.type || 'other', (m.get(p.type || 'other') ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [projects]);

  const deployStats = useMemo(() => {
    const list = projects ?? [];
    const deployed = list.filter((p) => p.deployment_version != null);
    const drifted = deployed.filter(
      (p) => p.current_version_num != null && p.current_version_num > (p.deployment_version ?? 0),
    );
    const never = list.filter((p) => p.deployment_version == null && p.current_version_num != null);
    return { deployed, drifted, never };
  }, [projects]);

  const overviewSeverity: AxisSeverity = projects === null ? 'idle' : 'ok';
  const deploySeverity: AxisSeverity =
    projects === null ? 'idle' : deployStats.drifted.length > 0 ? 'warn' : 'ok';
  const activitySeverity: AxisSeverity = events === null ? 'idle' : 'ok';

  const axes: AxisDef[] = useMemo(
    () => [
      {
        id: 'overview',
        label: 'Portfolio',
        railLabel: 'Overview',
        icon: Boxes,
        severity: overviewSeverity,
        badge: projects !== null ? `${projects.length} projects` : undefined,
        render: () =>
          projectsFailed ? (
            <p className="p-2 text-sm text-slate-500">Project list unavailable — retry from the board below.</p>
          ) : projects === null ? (
            <Skeleton />
          ) : (
            <div className="space-y-1">
              {byType.map(([type, count]) => (
                <Row key={type} label={type} value={count} />
              ))}
              <Row label="Contributors (max/project)" value={Math.max(0, ...projects.map((p) => p.contributors_count ?? 0))} />
            </div>
          ),
        primaryCta: {
          label: 'New model',
          onClick: () => router.push('/explore-design'),
          tone: 'primary',
        },
      },
      {
        id: 'deployments',
        label: 'Deployments',
        railLabel: 'Deploy',
        icon: Rocket,
        severity: deploySeverity,
        badge:
          projects !== null
            ? deployStats.drifted.length > 0
              ? `${deployStats.drifted.length} behind`
              : `${deployStats.deployed.length} live`
            : undefined,
        render: () =>
          projects === null ? (
            <Skeleton />
          ) : (
            <div className="space-y-1">
              <Row label="Deployed" value={deployStats.deployed.length} />
              <Row label="Version drift (model ahead of deploy)" value={deployStats.drifted.length} />
              <Row label="Versioned, never deployed" value={deployStats.never.length} />
              {deployStats.drifted.slice(0, 5).map((p) => (
                <Row
                  key={p.project_id}
                  label={p.name}
                  value={`v${p.current_version_num} > v${p.deployment_version}`}
                />
              ))}
            </div>
          ),
        primaryCta: {
          label: 'Deployment board',
          onClick: () =>
            document.getElementById('deployment-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          tone: 'neutral',
        },
      },
      {
        id: 'history',
        label: 'Activity (7d)',
        railLabel: 'History',
        icon: History,
        severity: activitySeverity,
        badge: events !== null ? `${events.length} events` : undefined,
        render: () =>
          eventsFailed ? (
            <p className="p-2 text-sm text-slate-500">Activity feed unavailable.</p>
          ) : events === null ? (
            <Skeleton />
          ) : events.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">No project events in the last 7 days.</p>
          ) : (
            <div className="space-y-1">
              {events.slice(0, 10).map((e, i) => (
                <div key={i} className="rounded-lg px-2 py-1.5 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{e.event_type}</span>
                  <span className="text-slate-400"> · {e.username}</span>
                  {e.timestamp && (
                    <span className="block text-[10px] text-slate-400">{e.timestamp}</span>
                  )}
                </div>
              ))}
            </div>
          ),
      },
    ],
    [projects, projectsFailed, events, eventsFailed, byType, deployStats, overviewSeverity, deploySeverity, activitySeverity, router],
  );

  return (
    <aside
      aria-label="Projects cockpit"
      className="sticky top-20 ml-5 hidden h-[calc(100vh-6.5rem)] shrink-0 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex"
    >
      <AxisCockpit
        axes={axes}
        open={open}
        activeAxis={activeAxis}
        onOpenAxis={openAxis}
        onClose={() => setOpen(false)}
        className="h-full"
      />
    </aside>
  );
}
