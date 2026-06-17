'use client';

/**
 * ProjectsMonitoringPanel — the admin "Projects" section of the Admin command
 * center.
 *
 * A read-only, account-wide oversight roster of every real project, from
 * GET /projects/unified?mine_only=false (the same live feed the project-summary
 * surface uses). Distinct from Governance → Projects (collaboration): this is
 * monitoring, not membership management — no mutations, nothing gated.
 *
 * Only fields the unified feed actually returns are shown (name, type, status,
 * owner, members, version). The design's per-project DQ/perf/cost + pending-
 * deployment rollups live behind per-project fan-out (getProjectRollup, which is
 * unavailable when unprovisioned) — they are deliberately omitted here rather
 * than fabricated. AuditTable renders an honest "—" for any null cell.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import AuditTable, { type Row } from '@/app/shared/command-center/AuditTable';
import { getUnifiedProjects, type UnifiedProject } from '@/app/services/api/projectsApi';
import { Spinner, ErrBox, Chip } from './shared';

type Phase = 'loading' | 'ready' | 'error';

const TYPE_LABEL: Record<string, string> = {
  explore_design: 'Explore & Design',
  workflow: 'Workflow',
  bi_dashboard: 'BI Dashboard',
};

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type.replace(/_/g, ' ');
}

export default function ProjectsMonitoringPanel() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<UnifiedProject[]>([]);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const res = await getUnifiedProjects({ mine_only: false, limit: 200, offset: 0 });
      // Hide soft-deleted projects; everything else is shown as-is.
      const live = (res?.projects ?? []).filter((p) => p.status !== 'deleted');
      setProjects(live);
      setPhase('ready');
    } catch (e) {
      setError(getApiErrorMessage(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows: Row[] = useMemo(
    () =>
      projects.map((p) => ({
        Project: p.name,
        Type: typeLabel(p.type),
        Status: p.status,
        Owner: p.created_by || null,
        Members: p.contributors_count ?? null,
        Version: p.current_version_num ?? null,
        Updated: p.updated_at ?? null,
      })),
    [projects],
  );

  if (phase === 'loading') return <Spinner label="Loading projects…" />;
  if (phase === 'error') return <ErrBox message={error ?? 'Failed to load projects'} onRetry={() => void load()} />;

  const byType = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <FolderKanban className="h-4 w-4 self-center text-[hsl(var(--primary))]" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Projects oversight</h3>
        <span className="text-[11px] text-slate-400">{projects.length} projects</span>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Read-only, account-wide roster of every project. Monitoring — distinct from collaborative
        project access management.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.entries(byType).map(([type, count]) => (
          <Chip key={type} tone="slate">
            {count} {typeLabel(type)}
          </Chip>
        ))}
      </div>
      {rows.length > 0 ? (
        <AuditTable
          rows={rows}
          columns={['Project', 'Type', 'Status', 'Owner', 'Members', 'Version', 'Updated']}
          pageSize={15}
        />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
          No projects found — —
        </p>
      )}
    </div>
  );
}
