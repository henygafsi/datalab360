'use client';

import { useTrackEvent } from '@/hooks/useTrackEvent';

/**
 * Fire-and-forget page-view tracking for the Project dashboard.
 *
 * `useTrackEvent` auto-queues a PAGE_VIEW on mount/route change. Mounting it from
 * a tiny client island lets the server-rendered page (which exports `metadata`,
 * and so cannot itself be a client component) register the view without any extra
 * UI. Renders nothing.
 *
 * Note: `detectModule` in the hook has no `/project` branch yet, so this view is
 * attributed to module "unknown" (the real path is still captured in
 * `details.page`). Tracking the in-page row selection as a FEATURE_CLICK lives in
 * the shared Project Summary component, not here.
 */
export default function ProjectDashboardTracker() {
  useTrackEvent();
  return null;
}
