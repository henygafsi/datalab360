import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioHome from '@/app/shared/studio/StudioHome';

/**
 * /studio/new — guided application creation: industry → category → focus
 * (the business context), then the journey (sources proposed and
 * pre-selected, model proposal, preview). The Studio home lists the
 * applications themselves.
 */
export const metadata: Metadata = {
  title: 'Studio — New application',
};

export default function StudioNewPage() {
  return (
    <Suspense fallback={null}>
      <StudioHome />
    </Suspense>
  );
}
