/**
 * `/admin` → `/administration` redirect.
 *
 * The old card grid here was a strict subset of the Administration hub's
 * launchpad (Performance, Config, Platform Settings, API Health are all hub
 * tabs) — one front door, not two. Its live ActivityDashboard panel moved
 * into the hub's Platform Health tab. The real `/admin/*` sub-pages
 * (performance, data360-config, platform-settings, api-health) remain — they
 * are the hub's drill-down destinations.
 */
import { redirect } from 'next/navigation';

export default function AdminIndexRedirect() {
  redirect('/administration');
}
