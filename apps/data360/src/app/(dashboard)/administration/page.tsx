import { Suspense } from 'react';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ControlRoom from './control/ControlRoom';

/**
 * `/administration` — ONE control page (2026-09 user directive: single page
 * to steer the platform and see the output of front+back development —
 * endpoint management included — restricted to ACCOUNTADMIN, who can also
 * adjust access from here).
 *
 * Replaces the former 7-tab hub. The old hub component and sub-pages stay in
 * the tree (routes preserved — see _DROPPED.md) but leave the navigation.
 */
function Fallback() {
  return (
    <div style={{ padding: 24 }} aria-busy="true">
      <div style={{ height: 28, width: 220, background: '#e5e7eb', borderRadius: 6, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 64, width: 180, background: '#eef2f7', borderRadius: 12 }} />
        ))}
      </div>
      <div style={{ height: 240, background: '#f3f4f6', borderRadius: 12 }} />
    </div>
  );
}

export default function AdministrationPage() {
  return (
    <AdminRouteGuard surface="The Administration control room" requireRoles={['ACCOUNTADMIN']}>
      <Suspense fallback={<Fallback />}>
        <ControlRoom />
      </Suspense>
    </AdminRouteGuard>
  );
}
