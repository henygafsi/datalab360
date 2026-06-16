/**
 * `/users/view/[id]` → `/governance/users/view/[id]` redirect.
 *
 * This was an orphaned duplicate of the live Governance user-detail page
 * (`(dashboard)/governance/users/view/[id]`), unreachable from the nav and
 * flagged by the route audit. It now redirects to the single live surface so
 * any stray deep-link lands on the maintained page.
 */
import { redirect } from 'next/navigation';
import { routes } from '@/config/routes';

export default function UserViewRedirect({ params }: { params: { id: string } }) {
  redirect(routes.governance.viewUser(params.id));
}
