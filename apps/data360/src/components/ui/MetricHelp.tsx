'use client';

import { Tooltip } from 'rizzui';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricHelpProps {
  /** Short metric name — used for the accessible label. */
  title: string;
  /** Plain-language definition of what the metric measures. */
  definition: string;
  /** Where the value comes from (e.g. "metering history"). */
  source?: string;
  /** Healthy / target range guidance (e.g. "> 95%"). */
  goodRange?: string;
  /** Optional extra classes for the trigger button. */
  className?: string;
}

/**
 * MetricHelp — a small accessible "(?)" affordance shown next to a metric label.
 *
 * On hover/focus it reveals a positioned tooltip containing the definition and,
 * when provided, the data source and a healthy range. It is a thin wrapper over
 * the shared rizzui Tooltip so styling and placement stay consistent with the
 * rest of the app.
 *
 * Brand rule: never put vendor names (data-warehouse/AI-engine internals) in the
 * copy passed here — use neutral terms.
 */
export default function MetricHelp({
  title,
  definition,
  source,
  goodRange,
  className,
}: MetricHelpProps) {
  const content = (
    <div className="max-w-[240px] space-y-1 text-left">
      <p className="text-xs font-semibold text-white">{title}</p>
      <p className="text-[11px] leading-snug text-gray-100">{definition}</p>
      {source && (
        <p className="text-[10px] text-gray-300">
          <span className="font-medium">Source:</span> {source}
        </p>
      )}
      {goodRange && (
        <p className="text-[10px] text-gray-300">
          <span className="font-medium">Healthy:</span> {goodRange}
        </p>
      )}
    </div>
  );

  return (
    <Tooltip content={content} placement="top">
      <button
        type="button"
        aria-label={`What is ${title}? ${definition}`}
        className={cn(
          'inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-gray-500 dark:hover:text-gray-300',
          className
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
