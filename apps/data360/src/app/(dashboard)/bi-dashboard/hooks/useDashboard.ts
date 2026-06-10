'use client';

import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { getDashboard } from '@/app/services/api/biDashboardApi';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

export function useDashboard(projectId: string | null) {
  return useCacheAwareQuery(
    () => getDashboard(projectId!),
    {
      cacheKeys: [CACHE_KEYS.BI_DASHBOARDS],
      enabled: !!projectId,
    }
  );
}
