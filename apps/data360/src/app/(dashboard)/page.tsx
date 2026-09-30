import { redirect } from 'next/navigation';

/**
 * `/` is not a page — it forwards to the landing surface.
 *
 * It MUST carry the query string across. The route-level module gate in
 * src/middleware.ts refuses a page the signed-in user's role does not hold by
 * redirecting to `/?denied=<module>&from=<path>`; a bare redirect('/account-overview')
 * dropped those params, so the refusal arrived as a silent bounce — the user
 * clicks Governance, lands on the overview, and is told nothing. Forwarding the
 * search string is what lets the destination explain itself.
 */
export default function DashboardPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value != null) qs.set(key, value);
  }
  const search = qs.toString();
  redirect(search ? `/account-overview?${search}` : '/account-overview');
}
