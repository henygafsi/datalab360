import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioSourcesHome from '@/app/shared/studio/sources/StudioSourcesHome';

/**
 * /studio/source — connections & objects, as a lifecycle surface:
 * two dense local views (Connections / Objects in use, ?view=) with the
 * connection sheet and the object/columns sheet opening in place, and the
 * guided add journey behind the one primary « Add a source » action.
 * Standard dashboard auth; heavy admin configuration stays in
 * /data-source-connection.
 */
export const metadata: Metadata = {
  title: 'Studio — Sources',
};

export default function StudioSourcePage() {
  return (
    <Suspense fallback={null}>
      <StudioSourcesHome />
    </Suspense>
  );
}
