import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioSettings from '@/app/shared/studio/StudioSettings';

/**
 * /studio/admin — consolidated Studio administration: every application's
 * configuration, analysis, AI registry (suggestions + history) and cost.
 * Reuses the existing settings surface — no parallel monitoring page.
 */
export const metadata: Metadata = {
  title: 'Studio — Administration',
};

export default function StudioAdminPage() {
  return (
    <Suspense fallback={null}>
      <StudioSettings />
    </Suspense>
  );
}
