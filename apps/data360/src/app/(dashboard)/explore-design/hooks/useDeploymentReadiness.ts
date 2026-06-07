'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import type { LineageImpact, CostEstimate } from '../stores/event-store';

export interface DeploymentReadiness {
  project_id: string;
  current_version_id: string | null;
  last_deployed_version_id: string | null;
  change_diff: Record<string, unknown>;
  lineage_impact: LineageImpact;
  cost_estimate: CostEstimate;
  approval_payload_template: {
    project_id: string;
    from_version_id: string | null;
    to_version_id: string | null;
    changes: unknown[];
    impact_summary: LineageImpact['impact_summary'] | null;
    cost_estimate: CostEstimate;
    requested_by: string | null;
    notes: string | null;
  };
}

interface UseDeploymentReadinessResult {
  data: DeploymentReadiness | null;
  loading: boolean;
  error: Error | null;
  unavailable: boolean;
}

export function useDeploymentReadiness(projectId: string | null): UseDeploymentReadinessResult {
  const [data, setData] = useState<DeploymentReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);

    apiClient
      .get<DeploymentReadiness>(API.exploreDesign.deploymentReadiness(projectId))
      .then(({ data: result }) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const axiosErr = err as { response?: { status?: number } };
        const status = axiosErr?.response?.status;
        // 404/501 = endpoint not yet deployed — degrade silently (InsightActionButton pattern)
        if (status === 404 || status === 501) {
          setUnavailable(true);
        } else {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  return { data, loading, error, unavailable };
}
