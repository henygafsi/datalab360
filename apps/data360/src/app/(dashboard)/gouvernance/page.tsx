import { redirect } from 'next/navigation';
import { routes } from '@/config/routes';

/**
 * /gouvernance has no content; redirect to the unified policies page by default.
 * Sub-routes: /gouvernance/users, /gouvernance/roles, /gouvernance/grants,
 * /gouvernance/policies, /gouvernance/security-matrix exist and are linked from the sidebar.
 */
export default function GouvernancePage() {
  redirect(routes.gouvernance.policies);
}
