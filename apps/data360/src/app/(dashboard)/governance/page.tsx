import { redirect } from 'next/navigation';
import { routes } from '@/config/routes';

/**
 * /governance has no content; redirect to the unified policies page by default.
 * Sub-routes: /governance/users, /governance/roles, /governance/grants,
 * /governance/policies, /governance/security-matrix exist and are linked from the sidebar.
 */
export default function GovernancePage() {
  redirect(routes.governance.policies);
}
