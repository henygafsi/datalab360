import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioSourceOnboarding from '@/app/shared/studio/StudioSourceOnboarding';

/**
 * /studio/source — the minimalist source journey: connector grid (real
 * catalog, multi-select) → pick the data → source KPIs from metadata only
 * → one understand & quality run. Standard dashboard auth; heavy admin
 * configuration stays in /data-source-connection.
 */
export const metadata: Metadata = {
  title: 'Studio — Sources',
};

export default function StudioSourcePage() {
  return (
    <Suspense fallback={null}>
      <StudioSourceOnboarding />
    </Suspense>
  );
}
