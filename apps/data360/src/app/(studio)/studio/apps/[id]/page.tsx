import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioWorkspace from '@/app/shared/studio/StudioWorkspace';

/**
 * /studio/apps/[id] — THE application: reports by default,
 * ?view=model|data|workflows|access|knowledge switches the surface.
 * The id is the backend draft/application id; everything on this page is
 * read from and persisted to that application — reopening it in a fresh
 * browser restores the same sources, definitions, charts and decisions.
 */
export const metadata: Metadata = {
  title: 'Studio — Application',
};

export default function StudioAppPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <StudioWorkspace appId={params.id} />
    </Suspense>
  );
}
