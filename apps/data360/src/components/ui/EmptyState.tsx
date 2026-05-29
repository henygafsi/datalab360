'use client';

import { ReactNode, ElementType } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  /** Lucide (or any) icon component. Defaults to Inbox. */
  icon?: ElementType;
  /** Short headline, e.g. "No policies yet". */
  title: string;
  /** Optional supporting line explaining the empty state or next step. */
  description?: string;
  /** Optional CTA (button/link) rendered under the text. */
  action?: ReactNode;
  /** Tighter vertical padding for use inside cards/tabs. */
  compact?: boolean;
  className?: string;
}

/**
 * Shared empty-state primitive — the "empty" leg of the
 * idle → running → completed → error → empty state machine.
 * Replaces the ~46 hand-rolled empties across the app.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4' : 'py-12 px-6'
      } ${className}`}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <Icon className="h-6 w-6 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
