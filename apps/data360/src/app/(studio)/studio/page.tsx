import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioAppsHome from '@/app/shared/studio/StudioAppsHome';

/**
 * /studio — the Studio home: the user's APPLICATIONS, not a questionnaire.
 * Creation lives at /studio/new; each card opens /studio/apps/[id].
 */
export const metadata: Metadata = {
  title: 'Studio',
};

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <StudioAppsHome />
    </Suspense>
  );
}
