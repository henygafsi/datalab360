/**
 * application-lifecycle — ONE user-facing state per application.
 *
 * The convergence rule replaces the visible publish/activation split with a
 * single lifecycle the whole workspace shows and links to the same
 * Activation panel: draft → ready → active, degraded when something the
 * application depends on is failing. `paused` needs a backend signal
 * (schedules stopped on a previously-active app) — until the lifecycle
 * contract lands server-side this derivation is FRONT-SIDE and says so
 * (`derived: true`); every consumer must treat `reasons` as the truth to
 * show, never collapse states into one green badge.
 */

import type { ConsistencyIssue } from '@/app/services/studio/studio-api';

export type LifecycleState = 'draft' | 'ready' | 'active' | 'paused' | 'degraded';

export interface Lifecycle {
  state: LifecycleState;
  reasons: string[];
  /** true while the state is derived client-side from publish/activation/
   *  consistency — replaced by the backend lifecycle contract when it lands */
  derived: boolean;
}

export const LIFECYCLE_WORDS: Record<LifecycleState, string> = {
  draft: 'Draft',
  ready: 'Ready to activate',
  active: 'Active',
  paused: 'Paused',
  degraded: 'Degraded',
};

export const LIFECYCLE_CLS: Record<LifecycleState, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ready: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  paused: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  degraded: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export function deriveLifecycle(input: {
  /** published version of the application, if any */
  version?: { version_number?: number; is_draft?: boolean } | null;
  /** GET /studio/activation/{id} payload (status/checks/funding, loose) */
  activation?: Record<string, unknown> | null;
  /** consistency issues (null = not read — never treated as « no issue ») */
  issues?: ConsistencyIssue[] | null;
  /** true when at least one workflow schedule is really active */
  anyScheduleActive?: boolean;
}): Lifecycle {
  const { version, activation, issues, anyScheduleActive } = input;
  const reasons: string[] = [];

  const published = version != null && version.version_number != null && !version.is_draft;
  const activationStatus = String((activation as { status?: unknown } | null)?.status ?? '');
  const activated = ['approved', 'active', 'granted', 'funded'].includes(activationStatus);
  const blocking = (issues ?? []).filter((i) => i.severity === 'blocking');

  if ((published || activated) && blocking.length > 0) {
    reasons.push(
      `${blocking.length} blocking consistency issue(s) — what is published no longer matches the model`,
    );
    return { state: 'degraded', reasons, derived: true };
  }

  if (activated || (published && anyScheduleActive)) {
    reasons.push(published ? `version ${version?.version_number} published` : 'activation granted');
    if (anyScheduleActive) reasons.push('at least one schedule is running');
    return { state: 'active', reasons, derived: true };
  }

  if (published) {
    reasons.push(
      `version ${version?.version_number} published — schedules and paid runs still need activation`,
    );
    return { state: 'ready', reasons, derived: true };
  }

  if (blocking.length > 0) {
    reasons.push(`${blocking.length} blocking consistency issue(s) to resolve before publishing`);
  } else if (issues == null) {
    reasons.push('consistency not checked yet');
  } else {
    reasons.push('not published yet — publish snapshots the contract, activation turns it on');
  }
  return { state: 'draft', reasons, derived: true };
}
