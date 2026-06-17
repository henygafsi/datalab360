/**
 * `/users` → `/governance/users` redirect.
 *
 * User management lives entirely under Governance (the live surface backed by
 * `GET /gouvernance/users`). The bare `/users` path was an orphan with no page
 * of its own (404). This permanent redirect catches stray deep-links and keeps
 * every "users" route resolving to the real governance list.
 */
import { redirect } from 'next/navigation';
import { routes } from '@/config/routes';

export default function UsersIndexRedirect() {
  redirect(routes.governance.users);
}
