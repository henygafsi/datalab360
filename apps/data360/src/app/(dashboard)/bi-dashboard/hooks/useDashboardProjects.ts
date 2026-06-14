'use client';

import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { listProjects } from '@/app/services/api/projectsApi';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

export function useDashboardProjects() {
  return useCacheAwareQuery(
    () => listProjects({ project_type: 'bi_dashboard', mine_only: true }),
    {
      cacheKeys: [CACHE_KEYS.PROJECTS, CACHE_KEYS.BI_DASHBOARDS],
      enabled: true,
    }
  );
}
