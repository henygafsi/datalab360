'use client';

import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadReportCsv, type ReportInput } from '@/lib/export-report';

/**
 * ExportButton — a consistent "Export report" affordance for admin pages.
 * Pass `buildReport` that snapshots the CURRENT view (title + context + KPIs +
 * tables) the moment it's clicked, so the CSV matches what's on screen. The
 * download is purely client-side (no backend round-trip).
 */
export default function ExportButton({
  buildReport,
  label = 'Export',
  className,
  disabled,
}: {
  buildReport: () => ReportInput;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => downloadReportCsv(buildReport(), new Date().toISOString())}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors',
        'hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        className,
      )}
      title="Download this view as a CSV report"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
