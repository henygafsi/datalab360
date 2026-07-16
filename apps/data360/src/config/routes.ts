export const routes = {
  home: '/',
  accountOverview: '/account-overview',
  sources: {
    catalog: '/sources',
  },
  dataProducts: {
    list: '/data-products',
  },
  connexion: {
    dataSourceConnection: '/data-source-connection',
  },
  mapping: {
    // Legacy route: /mapping renders a redirect to Explore & Design. Key kept
    // (per _DROPPED.md) because shared template components still import it.
    viewMap: '/mapping',
  },
  exploreDesign: {
    view: '/explore-design',
    /** Sources | Products | All cataloging sub-page (?tab= synced; no mindmap). */
    catalog: '/explore-design/catalog',
  },
  workflow:{
    ViewWorkflow: '/workflow'
  },
  deployApp: {
    home: '/deploy-app',
  },
  governance: {
    users: '/governance/users',
    /** Deep-link to a single user's read-only detail page. */
    viewUser: (id: string) => `/governance/users/view/${encodeURIComponent(id)}`,
    /** Deep-link to a single user's edit page. */
    editUser: (id: string) => `/governance/users/edit/${encodeURIComponent(id)}`,
    roles: '/governance/roles',
    grants: '/governance/grants',
    /** User × Data360-page access matrix (real users, governance-resolved access). */
    accessMatrix: '/governance/access-matrix',
    policies: '/governance/policies', // Unified policies page (RLS, Masking, Aggregation, Tags, Network, Password, Session)
    securityMatrix: '/governance/security-matrix',
    oauth: '/governance/oauth',
    projects: '/governance/projects',
    /** Every governance capability as a governed action (registry-in-tables). */
    actions: '/governance/actions',
    /**
     * G8 shareable deep-link to the Projects page with a project panel expanded
     * (`?project=<id>`) and, optionally, the active filter tab (`?tab=`). Read on
     * mount + written on select via a shallow `router.replace`.
     */
    projectDeepLink: (projectId: string, tab?: 'explore_design' | 'workflow') =>
      `/governance/projects?project=${encodeURIComponent(projectId)}${tab ? `&tab=${tab}` : ''}`,
  },
  biDashboard: {
    view: '/bi-dashboard',
    /** Open a dashboard project's editor. */
    project: (projectId: string) => `/bi-dashboard/${projectId}`,
    /**
     * G8 shareable deep-link to the BI list scoped to a project
     * (`?project=<id>`): scopes the health score cards and rings/scrolls the
     * matching project card. Additive — no redirect.
     */
    scopedView: (projectId: string) => `/bi-dashboard?project=${encodeURIComponent(projectId)}`,
  },
  dataQuality: {
    viewReports: '/data-quality'
  },
  observability: {
    dashboard: '/observability',
  },
  // dataEngineering & developer modules merged into explore-design & workflow
  /**
   * Administration HUB (front door) — the unified `/administration` surface with
   * 7 `?tab=<id>` sections that organize the split `/admin/*` and
   * `/administration/*` pages into one coherent entry. Non-destructive: every
   * `admin/*` route below stays registered so deep-links / breadcrumbs never 404.
   */
  administrationHub: '/administration',
  /** @deprecated landing index — superseded by the Administration HUB (administrationHub). Kept registered for back-compat. */
  adminHome: '/admin',
  data360Config: {
    /** Config Data360 : metadata, tables, colonnes date, cache/refresh */
    view: '/admin/data360-config',
  },
  adminPerformance: {
    /** Per-account, multi-axis Performance admin page (endpoint/user/cache/module/project/errors). */
    view: '/admin/performance',
  },
  adminPlatformSettings: {
    /** Platform-wide settings (config entries, refresh/reset controls). */
    view: '/admin/platform-settings',
  },
  adminApiHealth: {
    /** Live API route-prober / health dashboard. */
    view: '/admin/api-health',
  },
  clientAccounts: {
    dashboard: '/client-accounts',
  },
  // AI Intelligence — one page (/intelligent) with query-param tabs the page reads
  // via ?tab=<id>. These deep-link to REAL tab ids (see intelligent/page.tsx).
  intelligent: {
    dashboard: '/intelligent',
    semanticModels: '/intelligent?tab=semantic-models',
    aiChat: '/intelligent?tab=cortex-chat',
    aiAdvisor: '/intelligent?tab=ai-advisor',
    mlFeatures: '/intelligent?tab=ml-features',
    /** @deprecated was ?tab=data-governance (no such tab); points at a real tab so referrers resolve. */
    dataGovernance: '/intelligent?tab=ai-advisor',
    /** @deprecated alias → AI Chat tab. */
    cortexChat: '/intelligent?tab=cortex-chat',
  },

  project: {
    dashboard: '/project',
    /** Every project-lifecycle capability as a governed action (registry-in-tables). */
    actions: '/project/actions',
  },
  forms: {
    profileSettings: '/forms/profile-settings',
    notificationPreference: '/forms/profile-settings/notification',
    personalInformation: '/forms/profile-settings/profile',
    newsletter: '/forms/newsletter',
  },
  profile: '/profile',
  welcome: '/welcome',
  comingSoon: '/coming-soon',
  accessDenied: '/access-denied',
  notFound: '/not-found',
  maintenance: '/maintenance',
  auth: {
    // Linked from the real /signin form (kept pages under app/auth/).
    signUp1: '/auth/sign-up-1',
    forgotPassword1: '/auth/forgot-password-1',
  },
  signIn: '/signin',
};
