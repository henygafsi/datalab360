/**
 * React hooks for Gouvernance APIs
 * Fetches once and uses Next.js cache
 * Waits for session to be ready before making API calls
 */

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import * as GouvernanceService from '../app/services/governance';
import type {
  ClientDashboardInfo,
  UserActivityWithQuery,
  StageSize,
  DwhStorageSummary,
  DwhHealthInfo,
  ConnectorsResponse,
  ActivityFilterParams,
} from '../app/services/governance/types';

interface UseGouvernanceOptions {
  enabled?: boolean;
}

function useGouvernanceQuery<T>(
  fetchFn: () => Promise<T>,
  deps: any[] = [],
  options: UseGouvernanceOptions = {}
) {
  const { enabled = true } = options;
  const { data: session, status } = useSession();

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Create stable key from dependencies
  const depsKey = useMemo(() => JSON.stringify(deps), [deps]);

  // Only fetch when session is authenticated and has access token
  const isReady = status === 'authenticated' && !!session?.user?.access_token;

  useEffect(() => {
    // Don't fetch if disabled
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Wait for session to load
    if (status === 'loading') {
      return;
    }

    // If unauthenticated, stop loading but don't fetch
    if (status === 'unauthenticated') {
      setLoading(false);
      return;
    }

    // If authenticated but no token yet, keep waiting
    if (!isReady) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchData = async () => {
      try {
        const result = await fetchFn();
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(err?.message || 'Failed to fetch data'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [enabled, depsKey, isReady, status]); // Depend on session readiness

  const refetch = async () => {
    if (!enabled || !isReady) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(err?.message || 'Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refetch };
}

/**
 * Hook for client dashboard summary (main KPIs)
 * Fetches once on mount
 */
export function useClientDashboard(options?: UseGouvernanceOptions) {
  return useGouvernanceQuery<ClientDashboardInfo>(
    () => GouvernanceService.getClientDashboardInfo(),
    [],
    options
  );
}

/**
 * Hook for all users activity with queries (with optional filters)
 */
export function useAllUsersActivity(
  filters: ActivityFilterParams = {},
  options?: UseGouvernanceOptions
) {
  return useGouvernanceQuery<UserActivityWithQuery[]>(
    () => GouvernanceService.getAllUsersActivity(filters),
    [filters],
    options
  );
}

/**
 * Hook for filtered dashboard activity
 * @deprecated Use useAllUsersActivity instead
 */
export function useClientDashboardAll(
  filters: ActivityFilterParams = {},
  options?: UseGouvernanceOptions
) {
  return useAllUsersActivity(filters, options);
}

/**
 * Hook for stage storage info
 */
export function useStageStorageInfo(options?: UseGouvernanceOptions) {
  return useGouvernanceQuery<StageSize[]>(
    () => GouvernanceService.getStageStorageInfo(),
    [],
    options
  );
}

/**
 * Hook for DWH storage info
 */
export function useDwhStorageInfo(
  databaseName?: string,
  schemaName?: string,
  options?: UseGouvernanceOptions
) {
  return useGouvernanceQuery<DwhStorageSummary>(
    () => GouvernanceService.getDwhStorageInfo(databaseName, schemaName),
    [databaseName, schemaName],
    options
  );
}

/**
 * Hook for DWH health info
 */
export function useDwhHealthInfo(
  schemaName: string,
  options?: UseGouvernanceOptions
) {
  return useGouvernanceQuery<DwhHealthInfo>(
    () => GouvernanceService.getDwhHealthInfo(schemaName),
    [schemaName],
    options
  );
}

/**
 * Hook for connectors info
 */
export function useConnectorsInfo(options?: UseGouvernanceOptions) {
  return useGouvernanceQuery<ConnectorsResponse>(
    () => GouvernanceService.getConnectorsInfo(),
    [],
    options
  );
}

/**
 * Hook for query access history
 */
export function useQueryAccessHistory(options?: UseGouvernanceOptions) {
  return useGouvernanceQuery(
    () => GouvernanceService.getQueryAccessHistory(),
    [],
    options
  );
}
