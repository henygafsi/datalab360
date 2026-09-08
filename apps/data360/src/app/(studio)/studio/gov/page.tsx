import { Suspense } from 'react';
import type { Metadata } from 'next';

import StudioGov from '@/app/shared/studio/StudioGov';

/**
 * /studio/gov — governance & access seen from the Studio: roles, the
 * caller's own allow-set, scoped policies and access requests (icon
 * selection), plus a chat-only access-plan creation (no forms). Standard
 * dashboard auth — every read is caller-scoped, so no admin gate.
 */
export const metadata: Metadata = {
  title: 'Studio — Governance',
};

export default function StudioGovPage() {
  return (
    <Suspense fallback={null}>
      <StudioGov />
    </Suspense>
  );
}
