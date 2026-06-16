/**
 * `/users/edit/[id]` → `/governance/users/edit/[id]` redirect.
 *
 * This was an orphaned duplicate of the live Governance user-edit page
 * (`(dashboard)/governance/users/edit/[id]`), unreachable from the nav and
 * flagged by the route audit. It now redirects to the single live surface so
 * any stray deep-link lands on the maintained page.
 */
import { redirect } from 'next/navigation';
import { routes } from '@/config/routes';

export default function UserEditRedirect({ params }: { params: { id: string } }) {
  redirect(routes.governance.editUser(params.id));
}
