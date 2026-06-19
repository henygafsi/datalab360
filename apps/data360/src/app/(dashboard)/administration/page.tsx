import { Suspense } from 'react';
import AdministrationHub from './components/AdministrationHub';

/**
 * `/administration` — the unified Administration HUB (front door).
 *
 * Previously this route redirected straight into Access Control. It now renders
 * a coherent 7-tab hub (`?tab=<id>`) that organizes the split `/admin/*` and
 * `/administration/*` surfaces. Non-destructive: every underlying route stays
 * live — the hub embeds self-contained panels or links into the existing pages.
 *
 * The hub is a client component (reads `?tab` via `useSearchParams`), so it is
 * wrapped in Suspense per the App Router contract.
 */
export default function AdministrationPage() {
  return (
    <Suspense fallback={null}>
      <AdministrationHub />
    </Suspense>
  );
}
