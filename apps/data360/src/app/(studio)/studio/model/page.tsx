import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioModelView from '@/app/shared/studio/StudioModelView';

/**
 * /studio/model — the application model, full screen: entity graph
 * (backend-precomputed React Flow nodes/edges), grain/freshness/lineage per
 * table, report shape, and the patch/edit chat. `?draft=` picks the
 * application; defaults to the most recent draft.
 */
export const metadata: Metadata = {
  title: 'Studio — Model',
};

export default function StudioModelPage() {
  return (
    <Suspense fallback={null}>
      <StudioModelView />
    </Suspense>
  );
}
