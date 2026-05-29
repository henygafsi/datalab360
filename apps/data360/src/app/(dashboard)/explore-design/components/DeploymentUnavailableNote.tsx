'use client';

import React from 'react';
import { Lock, Beaker, RefreshCw } from 'lucide-react';

/**
 * One backend endpoint spec line for the gap card.
 */
export interface EndpointGap {
  /** e.g. "GET /explore-design/{projectId}/versions" */
  endpoint: string;
  /** Current observed failure, e.g. "currently 400" */
  status: string;
}

interface DeploymentUnavailableNoteProps {
  /** Short headline, e.g. "Version history is unavailable". */
  title: string;
  /** Plain explanation for the user (QA distinguishes this from genuine-empty). */
  description: string;
  /** Endpoint specs surfaced for the backend team. */
  endpoints: EndpointGap[];
  /** Raw upstream error message, if available. */
  error?: string;
  /** Retry handler — re-fires the failed query. */
  onRetry?: () => void;
  /** Disable Retry while a fetch is in-flight. */
  retrying?: boolean;
}

/**
 * Honest "endpoint unavailable" panel for explore-design post-deployment tabs.
 *
 * Replicates the violet `BackendGapNote` visual pattern from
 * `workflow/components/WizardPreflightPanel.tsx`. Use this when a backend
 * endpoint returns 4xx/5xx — it must look DIFFERENT from a genuine empty
 * state ("nothing deployed yet") so QA / users can tell the two apart.
 */
export function DeploymentUnavailableNote({
  title,
  description,
  endpoints,
  error,
  onRetry,
  retrying,
}: DeploymentUnavailableNoteProps) {
  return (
    <div className="m-3 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3.5 w-3.5 text-violet-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — endpoint unavailable
        </p>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
        {title}
      </p>
      <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">
        {description}
      </p>

      <dl className="mt-2.5 space-y-1.5 text-[11px]">
        {endpoints.map((ep) => (
          <div key={ep.endpoint} className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <dt className="font-mono text-slate-800 dark:text-slate-200 truncate">
              {ep.endpoint}
            </dt>
            <dd className="font-mono font-semibold text-violet-700 dark:text-violet-300">
              {ep.status}
            </dd>
          </div>
        ))}
      </dl>

      {error && (
        <div className="mt-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
          <span className="text-[10px] font-mono text-violet-800 dark:text-violet-200 break-words">
            {error}
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
        <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300 shrink-0" />
        <span className="text-[10px] text-violet-800 dark:text-violet-200">
          Your deployment may still have succeeded — this only means the
          read-back endpoint failed. Check the History tab.
        </span>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-2.5 py-1 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:bg-slate-800 dark:text-violet-300 dark:hover:bg-slate-700"
        >
          <RefreshCw className={retrying ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

export default DeploymentUnavailableNote;
