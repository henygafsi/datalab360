'use client';

/**
 * WorkflowOutputPanel — the workflow builder's bottom output drawer.
 *
 * Reads a block's OUTPUT without leaving the canvas: a **Data** tab (the shared
 * `TableDataPreview` of the node's db/schema/table) and an **Ingestion SQL** tab
 * (the node's compiled ingestion SQL). Auto-opens when the parent passes a new
 * `target` (e.g. on node click); collapses on demand.
 *
 * See Obsidian `_workflow-ux-rebuild` (bottom output panel) + `_design-system-2026`.
 */
import { FileCode2, Table2 } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { BottomPanel } from '@/app/shared/bottom-panel';
import { TableDataPreview, type TableTarget } from '@/app/shared/data-preview';

export type OutputTarget = TableTarget;

export interface WorkflowOutputPanelProps {
  projectId: string | null;
  /** The selected block's output table (or null). */
  target: OutputTarget | null;
  /** The selected block's compiled ingestion SQL, if any. */
  ingestionSql?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

function IngestionTab({ sql }: { sql?: string | null }) {
  if (!sql) {
    return <EmptyState icon={FileCode2} compact title="No ingestion SQL for this block" />;
  }
  return (
    <pre className="scrollbar-thin h-full overflow-auto rounded-lg border border-slate-200 bg-slate-900/90 p-3 font-mono text-[11px] leading-relaxed text-slate-100 dark:border-slate-700">
      {sql}
    </pre>
  );
}

export default function WorkflowOutputPanel({
  projectId,
  target,
  ingestionSql,
  open,
  onOpenChange,
  className,
}: WorkflowOutputPanelProps) {
  return (
    <BottomPanel
      className={className}
      open={open}
      onOpenChange={onOpenChange}
      title="Output"
      tabs={[
        {
          key: 'data',
          label: 'Data',
          icon: Table2,
          content: (
            <TableDataPreview
              projectId={projectId}
              target={target}
              emptyHint="Select a block with an output table"
            />
          ),
        },
        {
          key: 'ingestion',
          label: 'Ingestion SQL',
          icon: FileCode2,
          content: <IngestionTab sql={ingestionSql} />,
        },
      ]}
    />
  );
}
