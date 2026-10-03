import { pagesOptions } from '@/app/api/auth/[...nextauth]/pages-options';
import withAuth from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Route-level module gating.
 *
 * Measured 2026-09-29: a DATA_VIEWER holding exactly three modules
 * (account_overview, bi_reporting, dashboard) could open 25 of the 48 product
 * pages by typing the URL — governance, administration, data health, workflow,
 * explore & design and more. The sidebar hid them and several API calls answered
 * 403, but the PAGE rendered, with its chrome, its empty tables and its action
 * buttons. Authentication was the only thing this middleware ever checked.
 *
 * Hiding a link is not access control. The gate belongs on the route.
 *
 * Design rules, in order of importance:
 *  - FAIL OPEN, never closed. A missing or malformed module list means "let them
 *    through": the API is the enforcing boundary and it already refuses. Locking a
 *    legitimate user out of their own product because a claim was late would be a
 *    worse bug than the one being fixed.
 *  - Admin roles bypass entirely — they are granted every module by design.
 *  - Only paths with an UNAMBIGUOUS module owner are listed. A page whose module
 *    is arguable is left ungated rather than guessed at.
 */

/** Snowflake roles that hold every module by design (mirrors useAuth). */
const ADMIN_ROLES = ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'];

/**
 * Where a refusal lands: `/` forwards here (carrying the reason), and it is
 * also where NextAuth sends a fresh sign-in.
 *
 * This one path must never be refused, because refusing it has nowhere left to
 * go. A user who does not hold `account_overview` used to be bounced
 * `/account-overview` → `/?denied=account_overview` → `/account-overview?…` →
 * forever: measured at 6386 navigations in seven seconds, which the browser
 * ends as ERR_TOO_MANY_REDIRECTS. The whole product became unreachable for
 * them — exactly the lockout the FAIL OPEN rule above exists to prevent, and
 * strictly worse than the over-permissive page this gate was added to close.
 *
 * Letting it render is consistent with that rule: the API is still the
 * enforcing boundary and still refuses the data, so the page opens empty and
 * explains itself (AccessDeniedNotice) instead of trapping the session.
 *
 * Note this is keyed on the PATHNAME, never on the `?denied=` parameter — a
 * user appending `?denied=…` to a gated URL must not thereby open it.
 */
const DENIAL_LANDING_PATH = '/account-overview';

/**
 * First path segment → the `apiName` from src/config/modules.ts that owns it.
 * Longest-prefix wins, so a sub-path inherits its parent's module.
 */
const ROUTE_MODULE: Array<[string, string]> = [
  ['/account-overview', 'account_overview'],
  ['/client-accounts', 'client_accounts'],
  ['/governance', 'gouvernance'],
  ['/gouvernance', 'gouvernance'],
  ['/data-quality', 'data_quality'],
  ['/bi-dashboard', 'bi_reporting'],
  ['/intelligent', 'intelligent'],
  ['/observability', 'observability'],
  ['/workflow', 'workflow'],
  ['/explore-design', 'explore_design'],
  ['/data-source-connection', 'connect_datalake'],
  ['/sources', 'connect_datalake'],
  ['/mapping', 'mapping'],
];

function moduleForPath(pathname: string): string | null {
  let best: [string, string] | null = null;
  for (const entry of ROUTE_MODULE) {
    const [prefix] = entry;
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (!best || prefix.length > best[0].length) best = entry;
    }
  }
  return best ? best[1] : null;
}

/** True when this token's holder may open a page owned by `required`. */
function holdsModule(token: Record<string, unknown> | null, required: string): boolean {
  if (!token) return false;
  const role = String(token.role ?? '').toUpperCase();
  if (ADMIN_ROLES.some((r) => role.includes(r))) return true;

  const items = token.items;
  if (!Array.isArray(items) || items.length === 0) return true; // fail open, see header

  const held = items
    .map((m) => (typeof m === 'string' ? m : (m as Record<string, unknown>)?.apiName))
    .filter((m): m is string => typeof m === 'string')
    .map((m) => m.toLowerCase());
  if (held.length === 0) return true; // unrecognised shape — fail open

  return held.includes(required.toLowerCase());
}

export default withAuth(
  /**
   * Signed in, but this page belongs to a module they do not hold.
   *
   * Sending them to /signin would be wrong and alarming: their session is valid,
   * and a sign-in screen reads as "you have been logged out". They are sent to
   * the landing surface instead, carrying the reason, so the app can say what
   * happened. Only genuine unauthenticated traffic reaches the sign-in page,
   * which the `authorized` callback below still handles.
   *
   * That landing surface always renders, held or not (DENIAL_LANDING_PATH), so
   * a refusal costs exactly one redirect and can never chain into another.
   */
  function middleware(req) {
    const token = (req as unknown as { nextauth?: { token?: Record<string, unknown> } }).nextauth?.token ?? null;
    const { pathname } = req.nextUrl;
    const required = moduleForPath(pathname);
    if (!token || !required || holdsModule(token, required)) return NextResponse.next();
    // The landing surface is the one page a refusal may not refuse — see
    // DENIAL_LANDING_PATH. Everything else still redirects, exactly once.
    if (pathname === DENIAL_LANDING_PATH) return NextResponse.next();

    const url = req.nextUrl.clone();
    url.pathname = '/';
    url.search = `?denied=${encodeURIComponent(required)}&from=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  },
  {
    callbacks: {
      // Authentication only. Module gating happens in the handler above so that a
      // refusal can redirect somewhere sensible instead of to the sign-in page.
      // NextAuth handles session expiry via maxAge in auth-options.ts.
      authorized: ({ token }) => !!token,
    },
    pages: {
      ...pagesOptions,
    },
  },
);

export const config = {
  // Protect all dashboard routes - unauthenticated users will be redirected to /signin
  matcher: [
    '/',
    '/account-overview',
    '/account-overview/:path*',
    '/client-accounts',
    '/data-source-connection/:path*',
    '/explore-design/:path*',
    '/explore-design',
    '/sources',
    '/sources/:path*',
    '/mapping',
    '/mapping/:path*',
    '/workflow/:path*',
    '/workflow',
    '/governance/:path*',
    '/governance',
    // Legacy French slug — harmless safety net; next.config redirects() fires
    // before middleware so requests to /gouvernance/* are already 308'd to
    // /governance/* by the time middleware would have run.
    '/gouvernance/:path*',
    '/bi-dashboard/:path*',
    '/bi-dashboard',
    '/data-quality/:path*',
    '/data-quality',
    '/intelligent/:path*',
    '/intelligent',
    '/observability/:path*',
    '/observability',
    '/executive',
    '/financial',
    '/analytics',
    // Studio — its own light shell outside the dashboard group, same auth.
    '/studio',
    '/studio/:path*',
    '/logistics/:path*',
    '/ecommerce/:path*',
    '/support/:path*',
    '/file/:path*',
    '/file-manager',
    '/invoice/:path*',
    '/forms/profile-settings/:path*',
  ],
};
