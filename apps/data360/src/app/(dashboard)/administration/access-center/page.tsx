import { redirect } from 'next/navigation';

/**
 * `/administration/access-center` — CONSOLIDATED into the Administration HUB.
 *
 * The Access Control Center is now embedded inline as the `access` tab of the
 * single admin hub (data360 tab-minimized cockpit pattern: sub-pages → tabs).
 * The surface itself lives in `./components/AccessCenterSurface.tsx` and is
 * rendered by AdministrationHub; this standalone route redirects so existing
 * deep-links / breadcrumbs never 404.
 *
 * Note: the old page synced its own `?tab=<section>` param — that deep-link
 * granularity is intentionally dropped (the hub owns `?tab=` for its top-level
 * tabs). All section panels remain reachable inside the embedded surface.
 */
export default function AccessCenterRedirect() {
  redirect('/administration?tab=access');
}
