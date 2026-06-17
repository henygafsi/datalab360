'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { getStatusBadge } from '@core/components/table-utils/get-status-badge';
import { replaceUnderscoreDash } from '@core/utils/replace-underscore-dash';
import type { UnifiedProject } from '@/app/services/api/projectsApi';

/** Injected via the table's `meta` so the (module-level) cell renderers can
 *  read the current selection and trigger one. Keeps selection state in the
 *  shared useProjectContext atom, not in column closures. */
export interface ProjectSummaryMeta {
  selectedId: string | null;
  onSelectProject: (project: UnifiedProject) => void;
}

const columnHelper = createColumnHelper<UnifiedProject>();

/** Relative timestamp — same compact form used across the command center. */
function relativeTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export const defaultColumns = [
  // Project name — the selection control. A button (not a row onClick) so the
  // interaction is explicit and keyboard-reachable.
  columnHelper.display({
    id: 'project',
    size: 240,
    header: 'Project',
    cell: ({ row: { original }, table }) => {
      const meta = table.options.meta as unknown as
        | ProjectSummaryMeta
        | undefined;
      const isSelected = meta?.selectedId === original.project_id;
      return (
        <button
          type="button"
          onClick={() => meta?.onSelectProject(original)}
          aria-pressed={isSelected}
          className={
            'text-left font-medium transition-colors hover:underline ' +
            (isSelected
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-900 dark:text-gray-100')
          }
        >
          {original.name || '—'}
        </button>
      );
    },
  }),
  columnHelper.display({
    id: 'type',
    size: 150,
    header: 'Type',
    cell: ({ row: { original } }) =>
      original.type ? (
        <span className="capitalize text-gray-600 dark:text-gray-300">
          {replaceUnderscoreDash(original.type)}
        </span>
      ) : (
        '—'
      ),
  }),
  columnHelper.display({
    id: 'createdBy',
    size: 160,
    header: 'Created by',
    cell: ({ row: { original } }) => original.created_by || '—',
  }),
  columnHelper.display({
    id: 'status',
    size: 140,
    header: 'Status',
    cell: ({ row: { original } }) =>
      original.status ? getStatusBadge(original.status) : '—',
  }),
  columnHelper.display({
    id: 'contributors',
    size: 120,
    header: 'Contributors',
    // A real API count — 0 is an honest value here, not a placeholder.
    cell: ({ row: { original } }) => original.contributors_count ?? '—',
  }),
  columnHelper.display({
    id: 'version',
    size: 100,
    header: 'Version',
    cell: ({ row: { original } }) =>
      original.current_version_num != null
        ? `v${original.current_version_num}`
        : '—',
  }),
  columnHelper.display({
    id: 'updated',
    size: 130,
    header: 'Updated',
    cell: ({ row: { original } }) => (
      <span title={original.updated_at ?? undefined}>
        {relativeTime(original.updated_at)}
      </span>
    ),
  }),
];
