# Dropped routes — backlog_V1

This note records page routes removed from navigation/routing during the
`feat/backlog-v1` frontend cleanup. Shared component libraries under
`src/app/shared/*` were intentionally NOT deleted (out of scope), and the
template-route keys in `src/config/routes.ts` were intentionally KEPT (see
"routes.ts note" below).

## Analytics-BI (overlaps external BI, off the no-code spine)

These overlap an external BI tool and sit off the product's no-code spine.

- `analytics`   (`/analytics`)
- `bi-dashboard` (`/bi-dashboard`)
- `executive`   (`/executive`)

Nav: the "Analytics" sidebar dropdown (BI Dashboard + Dashboards) was removed
from `src/layouts/hydrogen/sidebar-menu.tsx`. The Intelligent module was KEPT
and promoted to a top-level "Intelligent" nav entry (it is a real Data360
module, not BI).

## Leftover Isomorphic/Hydrogen starter pages (template starter cruft)

Generic admin-template demo pages with no Data360 function:

- `ecommerce`, `invoice`, `job-board`, `point-of-sale`, `crm`, `logistics`,
  `financial`, `appointment`, `event-calendar`, `file-manager`, `file`,
  `forms`, `widgets`, `tables`, `affiliate`, `image-viewer`, `demo-showcase`,
  `blank`, `roles-permissions` (template Roles & Permissions — governance has
  its own `/governance/roles`, so this template page was dropped).

## Kept (real Data360 modules / real user pages)

- `account-overview`, `admin`, `governance`, `data-products`, `data-quality`,
  `data-source-config`, `data-source-connection`, `sources`, `explore-design`,
  `intelligent`, `mapping`, `observability`, `workflow`, `deploy-app`, `users`,
  `client-accounts`, `project` (data360 Projects), `email-templates`.
- `profile` — KEPT. It is the user profile page, linked from the retained
  `shared/account-settings/*` (password/profile/role settings) views.

## Governance route dedupe (backlog_V1)

- `governance/network-policies` (`/governance/network-policies`) — REMOVED. It
  was a thin standalone wrapper rendering the same `NetworkPoliciesContent`
  already shown by the unified Policies page (`/governance/policies`, "Network"
  tab — the canonical surface per `routes.ts`). The lone inbound link
  (`shared/command-center/OrgAccountsTab.tsx` "Enable network policy" CTA) was
  repointed to `/governance/policies`.
- Dead nav link fix: the hydrogen sidebar "Masking Policy" entry pointed at
  `/governance/masking` (no such page) and was repointed to
  `/governance/policies` (Masking tab).

## routes.ts note (why the keys were NOT removed)

The corresponding keys in `src/config/routes.ts` (e.g. `eCommerce`, `logistics`,
`invoice`, `tables`, `forms`, `widgets`, `biReporting`, `biDashboard`,
`analytics`, `rolesPermissions`, etc.) were intentionally left in place. They are
still imported/compiled by retained `src/app/shared/*` template component
libraries and by the per-layout `*-menu-items` files. Build safety wins:
deleting these keys would break TypeScript compilation of out-of-scope files.
The user-facing routes are nonetheless gone — the page directories were deleted
(URLs now 404) and the active sidebar nav entries were removed.
