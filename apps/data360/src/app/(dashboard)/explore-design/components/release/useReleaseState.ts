'use client';

/**
 * useReleaseState — the single source of truth for a project's release
 * lifecycle in the redesigned Release tab.
 *
 * Fetches GET /explore-design/{id}/release-state (new contract) in parallel
 * with the WIRED deployments list. If release-state is not on the backend yet
 * (404/501), the hook degrades honestly: it derives a partial ReleaseState
 * from the latest deployment (`degraded: true`, no axis signals, no fabricated
 * counts) — it never invents numbers.
 *
 * Refresh triggers: SSE cache-invalidation (singleton subscription — NO
 * polling) on deployment/project/version/approval keys + a manual `refresh()`.
 *
 * `deriveDeployButton(state)` implements the spec §3 nine-face mapping of the
 * header Deploy button → { label, enabled, targetStep }.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CACHE_KEYS,
  useOnCacheInvalidation,
} from '@/components/providers/CacheInvalidationProvider';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { listDeployments } from '@/app/services/api/exploreDesignApi';
import type { ExploreDeployment } from '@/app/services/api/types';
import { getReleaseState } from './api';
import type { ReleaseState, ReleaseStatus, ReleaseStepId } from './types';

// ── Deploy button mapping (spec §3) ──────────────────────────────────────────

export interface DeployButtonSpec {
  label: string;
  enabled: boolean;
  /** Release step the button should open/scroll to. */
  targetStep: ReleaseStepId;
}

const DEPLOY_BUTTON_MAP: Record<ReleaseStatus, DeployButtonSpec> = {
  no_changes: { label: 'Deploy', enabled: false, targetStep: 'changes' },
  draft_changes: { label: 'Prepare Release', enabled: true, targetStep: 'changes' },
  checks_not_run: { label: 'Run Validation', enabled: true, targetStep: 'readiness' },
  blocked: { label: 'Fix Blockers', enabled: true, targetStep: 'readiness' },
  ready_for_approval: { label: 'Submit for Approval', enabled: true, targetStep: 'approval' },
  awaiting_approval: { label: 'Awaiting Approval', enabled: false, targetStep: 'approval' },
  approved: { label: 'Deploy', enabled: true, targetStep: 'deploy' },
  deploying: { label: 'Deploying…', enabled: false, targetStep: 'deploy' },
  deployed: { label: 'Verify', enabled: true, targetStep: 'verify' },
  verified: { label: 'Verified', enabled: false, targetStep: 'verify' },
  failed: { label: 'Open Recovery', enabled: true, targetStep: 'recovery' },
  rolled_back: { label: 'Open Recovery', enabled: true, targetStep: 'recovery' },
};

/**
 * Map a release state to the header Deploy button face. `null` (state unknown
 * / endpoint unavailable and nothing derivable) → disabled "Deploy".
 */
export function deriveDeployButton(state: ReleaseState | null): DeployButtonSpec {
  if (!state) return DEPLOY_BUTTON_MAP.no_changes;
  return DEPLOY_BUTTON_MAP[state.status] ?? DEPLOY_BUTTON_MAP.no_changes;
}

// ── Degraded derivation from the WIRED deployments list ─────────────────────

/** Map a backend deployment status string to the release lifecycle. */
function statusFromDeployment(d: ExploreDeployment): ReleaseStatus | null {
  const s = String(d.status ?? '').toLowerCase();
  if (s === 'pending_review' || s === 'pending' || s === 'requested') return 'awaiting_approval';
  if (s === 'approved') return 'approved';
  if (s === 'deploying' || s === 'executing' || s === 'in_progress') return 'deploying';
  if (s === 'deployed' || s === 'executed' || s === 'success' || s === 'completed') return 'deployed';
  if (s === 'verified') return 'verified';
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'rolled_back') return 'rolled_back';
  if (s === 'rejected') return 'draft_changes'; // rejected → back to rework
  return null;
}

function deriveFromDeployments(deployments: ExploreDeployment[]): ReleaseState | null {
  if (!deployments.length) return null;
  // Latest first (requested_at / created_at descending).
  const sorted = [...deployments].sort((a, b) => {
    const ta = Date.parse(a.requested_at ?? a.created_at ?? '') || 0;
    const tb = Date.parse(b.requested_at ?? b.created_at ?? '') || 0;
    return tb - ta;
  });
  for (const d of sorted) {
    const status = statusFromDeployment(d);
    if (status) return { status, label: null, next_action: null, counts: null, axis_signals: null };
  }
  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/** SSE cache keys whose invalidation means the release state may have moved. */
const RELEASE_CACHE_KEYS: ReadonlySet<string> = new Set([
  CACHE_KEYS.DEPLOYMENTS,
  CACHE_KEYS.APPROVALS,
  CACHE_KEYS.PROJECT_EVENTS,
  CACHE_KEYS.PROJECT_VERSIONS,
  CACHE_KEYS.PROJECTS,
]);

export interface UseReleaseStateResult {
  /** The release state (server truth, or deployments-derived when degraded). */
  state: ReleaseState | null;
  /** WIRED deployments list (newest first) — steps reuse it (approval/deploy). */
  deployments: ExploreDeployment[];
  loading: boolean;
  /** Hard error message (network/5xx) — NOT set for a 404/501 degraded state. */
  error: string | null;
  /** True when GET /release-state is 404/501 (state derived from deployments). */
  degraded: boolean;
  refresh: () => void;
}

export function useReleaseState(projectId: string | null): UseReleaseStateResult {
  const [state, setState] = useState<ReleaseState | null>(null);
  const [deployments, setDeployments] = useState<ExploreDeployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  // Guard against out-of-order responses on fast project switches.
  const requestKeyRef = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!projectId) {
      setState(null);
      setDeployments([]);
      setError(null);
      setDegraded(false);
      return;
    }
    const key = `${projectId}:${Date.now()}`;
    requestKeyRef.current = key;
    setLoading(true);
    setError(null);

    const [stateRes, deploymentsRes] = await Promise.allSettled([
      getReleaseState(projectId),
      listDeployments(projectId),
    ]);
    if (requestKeyRef.current !== key) return; // stale response

    const deps =
      deploymentsRes.status === 'fulfilled'
        ? deploymentsRes.value.deployments ?? []
        : [];
    setDeployments(deps);

    if (stateRes.status === 'fulfilled') {
      setState(stateRes.value);
      setDegraded(false);
    } else if (isUnavailable(stateRes.reason)) {
      // Endpoint not live yet → honest degraded derivation (may be null).
      setState(deriveFromDeployments(deps));
      setDegraded(true);
    } else {
      setState(null);
      setDegraded(false);
      setError(getApiErrorMessage(stateRes.reason));
    }

    // Deployments list hard-failing is only a hard error if release-state also
    // failed — otherwise the server state stands on its own.
    if (
      deploymentsRes.status === 'rejected' &&
      stateRes.status === 'rejected' &&
      !isUnavailable(deploymentsRes.reason)
    ) {
      setError((prev) => prev ?? getApiErrorMessage(deploymentsRes.reason));
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // SSE-driven refresh (singleton subscription — no extra stream, no polling).
  useOnCacheInvalidation(RELEASE_CACHE_KEYS, () => {
    if (projectId) void fetchAll();
  });

  return {
    state,
    deployments,
    loading,
    error,
    degraded,
    refresh: fetchAll,
  };
}
