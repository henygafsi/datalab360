'use client';

import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { listProjects } from '@/app/services/api/projectsApi';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

export function useDashboardProjects() {
  return useCacheAwareQuery(
    // mine_only:false so seeded/sample dashboards owned by other identities are
    // listed too — matches the live BI landing page's GET /projects path.
    () => listProjects({ project_type: 'bi_dashboard', mine_only: false }),
    {
      cacheKeys: [CACHE_KEYS.PROJECTS, CACHE_KEYS.BI_DASHBOARDS],
      enabled: true,
    }
  );
}
