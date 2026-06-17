'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';
import { Loader } from 'rizzui';
import cn from '@core/utils/class-names';
import Table from '@core/components/table';
import WidgetCard from '@core/components/cards/widget-card';
import TablePagination from '@core/components/table/pagination';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import type { TableMeta } from '@tanstack/react-table';
import {
  getUnifiedProjects,
  type UnifiedProject,
} from '@/app/services/api/projectsApi';
import { useProjectContext } from '@/hooks/useProjectContext';
import { defaultColumns, type ProjectSummaryMeta } from './column';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * Project Summary — the real account-wide project list from
 * GET /projects/unified (mine_only=false → includes seeded samples owned by
 * other identities). Replaces the old fabricated table (Android app dev, Rachel
 * Green, Jul-2024 due dates, made-up progress rings).
 *
 * Selecting a project (the name button) sets the shared active project via
 * useProjectContext, which RecentActivities reads to show that project's real
 * event log. No popup selector — the table itself is the in-page picker.
 */
export default function ProjectSummary({ className }: { className?: string }) {
  const [projects, setProjects] = useState<UnifiedProject[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setState('loading');
    getUnifiedProjects({ mine_only: false, limit: 100, offset: 0 })
      .then((res) => {
        if (ignore) return;
        // Hide soft-deleted projects; everything else is shown as-is.
        const live = (res?.projects ?? []).filter((p) => p.status !== 'deleted');
        setProjects(live);
        setState('ready');
      })
      .catch(() => {
        if (!ignore) setState('error');
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  return (
    <WidgetCard
      title="Project Summary"
      headerClassName="mb-4 px-5 pt-5 lg:px-7 lg:pt-7"
      className={cn(
        'space-y-4 p-0 @container dark:bg-gray-100/50 lg:p-0',
        className
      )}
    >
      {state === 'loading' && (
        <div className="flex min-h-[220px] items-center justify-center">
          <Loader variant="spinner" size="xl" />
        </div>
      )}

      {state === 'error' && (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Couldn’t load projects.
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && projects.length === 0 && (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center">
          <FolderOpen className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No projects yet.
          </p>
        </div>
      )}

      {/* Mount the table only once real data is in hand — useTanStackTable
          seeds its row state from `tableData` on first render only. */}
      {state === 'ready' && projects.length > 0 && (
        <ProjectSummaryTable projects={projects} />
      )}
    </WidgetCard>
  );
}

function ProjectSummaryTable({ projects }: { projects: UnifiedProject[] }) {
  const { activeProject, selectProject } = useProjectContext('projects');

  const handleSelect = useCallback(
    (project: UnifiedProject) => {
      selectProject(project.project_id, project.name, project.type);
    },
    [selectProject]
  );

  const meta: ProjectSummaryMeta = {
    selectedId: activeProject?.id ?? null,
    onSelectProject: handleSelect,
  };

  const { table } = useTanStackTable<UnifiedProject>({
    tableData: projects,
    columnConfig: defaultColumns,
    options: {
      // `meta` is rebuilt each render (selection changes); useReactTable
      // re-reads options every render, so the selected highlight stays current.
      // The project's TableMeta augmentation only declares delete handlers, so
      // bridge our table-local selection payload through it (read back in the
      // Project column with the matching cast).
      meta: meta as unknown as TableMeta<UnifiedProject>,
      // UnifiedProject keys on project_id (no `id` field) — give react-table a
      // stable row id so keys survive pagination/sort.
      getRowId: (row) => row.project_id,
      initialState: {
        pagination: { pageIndex: 0, pageSize: 5 },
      },
      enableColumnResizing: false,
    },
  });

  return (
    <>
      <Table
        table={table}
        variant="modern"
        classNames={{
          headerCellClassName: 'first:ps-6',
          cellClassName: 'first:ps-6',
        }}
      />
      <TablePagination table={table} className="p-4 pt-0" />
    </>
  );
}
