import { Suspense } from 'react';
import AdminRouteGuard from '@/components/AdminRouteGuard';
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
function HubFallback() {
  // Never a blank screen while the client hub resolves `?tab` / suspends —
  // show a lightweight skeleton instead of `null` (the route's BLANK in the
  // runtime sweep was a dev-compile artifact, but a null fallback would also
  // read as blank under any real slow load).
  return (
    <div style={{ padding: 24 }} aria-busy="true">
      <div style={{ height: 28, width: 220, background: '#e5e7eb', borderRadius: 6, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ height: 32, width: 96, background: '#eef2f7', borderRadius: 8 }} />
        ))}
      </div>
      <div style={{ height: 180, background: '#f3f4f6', borderRadius: 12 }} />
    </div>
  );
}

export default function AdministrationPage() {
  return (
    <AdminRouteGuard surface="The Administration hub">
      <Suspense fallback={<HubFallback />}>
        <AdministrationHub />
      </Suspense>
    </AdminRouteGuard>
  );
}
