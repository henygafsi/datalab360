/**
 * features-catalog — the descriptive FEATURE REGISTRY for the whole platform.
 *
 * A typed, business-readable catalog of the real features shipped across every
 * module: what each one does around your data (one plain-English sentence),
 * where it lives in the app, and the backend endpoints it calls.
 *
 * Ground truth for the endpoint lists is `src/lib/api-contracts.ts` (the single
 * source of truth for backend paths) plus each module's service layer under
 * `src/app/services/<module>/`. Paths keep their `{param}` placeholders so they
 * read as contracts, not as literal calls.
 *
 * Module slugs match `MODULES[].apiName` (src/config/modules.ts) so display
 * names can be resolved with `getModuleDisplayName()` — never hardcoded.
 *
 * ACTIVATION: per-account activation is served by the entitlements API
 * (GET /api/administration/entitlements). A catalog row is "governable" when
 * its entitlement key — `entitlement` if set, else `${module}:${featureKey}` —
 * exists in that matrix; several catalog rows may share one governing
 * entitlement (the backend governs at coarser grain). Rows with no matching
 * entitlement render an honest "—" (enforced by role grants only).
 */

export interface FeatureDef {
  /** Module slug (backend apiName style — matches MODULES[].apiName where present). */
  module: string;
  /** Stable feature key, unique within the module. */
  featureKey: string;
  /** Short business-readable feature name. */
  name: string;
  /** One sentence, business English: what this does around your data. */
  description: string;
  /** Backend paths the feature calls (from api-contracts.ts / module services). */
  endpoints: string[];
  /** Page / tab where the feature lives. */
  surface: string;
  /**
   * Governing entitlement key ("module:feature_key" in the backend feature
   * registry) when it differs from `${module}:${featureKey}`. Toggling writes
   * THAT entitlement — rows sharing it activate and deactivate together.
   */
  entitlement?: string;
}

/** Display order of module groups (mirrors the sidebar journey). */
export const MODULE_ORDER: string[] = [
  'account_overview',
  'connect_datalake',
  'explore_design',
  'workflow',
  'gouvernance',
  'bi_reporting',
  'intelligent',
  'data_quality',
  'observability',
  'administration',
];

/** The entitlement key that governs a catalog row (explicit override or direct match). */
export function entitlementKeyOf(f: FeatureDef): string {
  return f.entitlement ?? `${f.module}:${f.featureKey}`;
}

export const FEATURES_CATALOG: FeatureDef[] = [
  // ── Account Overview ───────────────────────────────────────────────────────
  {
    module: 'account_overview',
    featureKey: 'overview_kpis',
    name: 'Executive KPI wall',
    description:
      'Lands you on a live wall of account-wide numbers — spend, storage, users, activity and health — so you see the state of your data platform at a glance.',
    endpoints: [
      '/command-center/overview-kpis',
      '/command-center/overview-kpis/refresh',
      '/command-center/summary',
    ],
    surface: 'Account Overview · Overview',
  },
  {
    module: 'account_overview',
    featureKey: 'finops_breakdown',
    name: 'Cost breakdown (FinOps)',
    description:
      'Breaks credit spend down by warehouse and service and trends it over time, so you know exactly where your data budget goes.',
    endpoints: [
      '/command-center/cost-breakdown',
      '/command-center/tabs/{tab}',
      '/observability/cost/daily-credits',
    ],
    surface: 'Account Overview · FinOps',
  },
  {
    module: 'account_overview',
    featureKey: 'security_audit',
    name: 'Security audit',
    description:
      'Reviews sign-ins, permission changes and MFA posture across the account so risky access is caught early.',
    endpoints: ['/command-center/security-audit'],
    surface: 'Account Overview · Security',
  },
  {
    module: 'account_overview',
    featureKey: 'query_audit',
    name: 'Query history audit',
    description:
      'A searchable log of every query run against your data — who ran what, when, how long it took and what it scanned.',
    endpoints: ['/command-center/audit/query-history'],
    surface: 'Account Overview · Audit',
  },
  {
    module: 'account_overview',
    featureKey: 'access_audit',
    name: 'Data access audit',
    description:
      'Traces who actually read which tables and columns — the evidence trail for investigations and compliance.',
    endpoints: ['/command-center/audit/access-history', '/command-center/profiling/column'],
    surface: 'Account Overview · Audit',
  },
  {
    module: 'account_overview',
    featureKey: 'login_audit',
    name: 'Sign-in audit',
    description:
      'Lists every sign-in attempt with its outcome and client, making brute-force attempts and unusual patterns visible.',
    endpoints: ['/command-center/audit/login-history'],
    surface: 'Account Overview · Audit',
  },
  {
    module: 'account_overview',
    featureKey: 'object_deep_dive',
    name: 'Object deep dive',
    description:
      'Opens a full dossier on any table or view — columns, usage, lineage, governance and health — in one panel.',
    endpoints: [
      '/api/snowflake/explorer/objects/{id}/deep-dive',
      '/api/snowflake/explorer/objects/{id}/usage',
      '/api/snowflake/explorer/objects/{id}/lineage',
    ],
    surface: 'Account Overview · Data Explorer',
    entitlement: 'command_center:object_deep_dive',
  },

  // ── Connect Data ───────────────────────────────────────────────────────────
  {
    module: 'connect_datalake',
    featureKey: 'connector_registry',
    name: 'Source connectors',
    description:
      'Registers your databases, lakehouses and cloud buckets as governed sources and keeps their connection health visible.',
    endpoints: ['/connect/connectors', '/connect/connectors/health', '/connect/source-catalog'],
    surface: 'Connect Data',
  },
  {
    module: 'connect_datalake',
    featureKey: 'connection_test',
    name: 'Connection test',
    description:
      'Verifies credentials and reachability of a source before you trust it with a pipeline.',
    endpoints: [
      '/connect/connectors/{id}/test',
      '/connect/databricks/test',
      '/connect/oracle/test',
      '/connect/iceberg/test',
    ],
    surface: 'Connect Data · connector card',
  },
  {
    module: 'connect_datalake',
    featureKey: 'manual_sync',
    name: 'On-demand sync',
    description:
      'Pulls fresh data from a connected source right now instead of waiting for the next scheduled run.',
    endpoints: ['/connect/connectors/{id}/sync'],
    surface: 'Connect Data · connector card',
  },
  {
    module: 'connect_datalake',
    featureKey: 'stage_files',
    name: 'Staging areas & files',
    description:
      'Uploads files into managed staging areas, then previews, downloads or removes them before ingestion.',
    endpoints: [
      '/connect/stages',
      '/connect/stages/{stage}/upload',
      '/connect/stages/{stage}/files',
      '/connect/stages/{stage}/files/{path}/preview',
    ],
    surface: 'Connect Data · Stages',
  },
  {
    module: 'connect_datalake',
    featureKey: 'cloud_integrations',
    name: 'Cloud storage integrations',
    description:
      'Wires S3, Azure and GCS buckets into the platform with the right storage and notification plumbing for auto-loading.',
    endpoints: [
      '/connect/aws/storage_integration',
      '/connect/azure/storage_integration',
      '/connect/gcs/storage_integration',
      '/connect/azure/snowpipe',
    ],
    surface: 'Connect Data · cloud wizards',
  },
  {
    module: 'connect_datalake',
    featureKey: 'database_ingestion',
    name: 'Database & lakehouse ingestion',
    description:
      'Copies tables from operational databases and lakehouses into your warehouse in one guided run.',
    endpoints: [
      '/connect/postgres/ingest',
      '/connect/mysql/ingest',
      '/connect/oracle/ingest',
      '/connect/databricks/ingest',
      '/connect/iceberg/ingest',
    ],
    surface: 'Connect Data · ingestion wizards',
  },
  {
    module: 'connect_datalake',
    featureKey: 'datalake_browser',
    name: 'Data lake browser',
    description:
      'Connects your data lake and browses it in place so lake files become discoverable datasets.',
    endpoints: ['/connect/snowflake_lake/datalake/connect'],
    surface: 'Connect Data · Data lake',
  },

  // ── Explore & Design ───────────────────────────────────────────────────────
  {
    module: 'explore_design',
    featureKey: 'project_workspace',
    name: 'Modeling projects',
    description:
      'Creates shared projects where teams design target tables on a canvas before anything touches production.',
    endpoints: ['/explore-design', '/projects', '/projects/{id}'],
    surface: 'Explore & Design',
    entitlement: 'projects:project_crud',
  },
  {
    module: 'explore_design',
    featureKey: 'guided_mapping',
    name: 'Guided source-to-target mapping',
    description:
      'Maps source columns onto target tables with server-side validation, so transformations are proven correct before they are written.',
    endpoints: ['/explore-design/guided/add-event', '/explore-design/guided/test_mapping'],
    surface: 'Explore & Design · canvas mapping',
  },
  {
    module: 'explore_design',
    featureKey: 'ddl_generation',
    name: 'DDL generation & execution',
    description:
      'Turns your model into executable DDL and applies it to the warehouse as a controlled, reviewable step.',
    endpoints: ['/explore-design/{id}/ddl-actions', '/explore-design/{id}/ddl-actions/execute'],
    surface: 'Explore & Design · Deploy',
  },
  {
    module: 'explore_design',
    featureKey: 'release_deployments',
    name: 'Governed releases',
    description:
      'Requests a deployment, runs readiness and conflict checks, routes it through named approvers and verifies the schema after execution — no direct-to-production changes.',
    endpoints: [
      '/explore-design/{id}/deployments',
      '/explore-design/{id}/deployments/{depId}/approve',
      '/explore-design/{id}/deployments/{depId}/execute',
      '/explore-design/{id}/deployment-readiness',
      '/explore-design/{id}/conflict-check',
      '/explore-design/{id}/post-verify',
      '/explore-design/{id}/release-state',
    ],
    surface: 'Explore & Design · Deploy / Release',
    entitlement: 'projects:deployments',
  },
  {
    module: 'explore_design',
    featureKey: 'impact_analysis',
    name: 'Impact analysis',
    description:
      'Shows which downstream tables and reports a change would affect before you ship it.',
    endpoints: [
      '/explore-design/{id}/impact-analysis',
      '/explore-design/{id}/impact-analysis/enhanced',
    ],
    surface: 'Explore & Design · Deploy',
  },
  {
    module: 'explore_design',
    featureKey: 'scheduled_ingestion',
    name: 'Scheduled ingestion',
    description:
      'Loads mapped data on a recurring schedule and keeps a run-by-run history of every load.',
    endpoints: [
      '/explore-design/{id}/ingestion/schedule',
      '/explore-design/{id}/ingestion/execute',
      '/explore-design/{id}/ingestion/runs',
    ],
    surface: 'Explore & Design · Ingestion',
  },
  {
    module: 'explore_design',
    featureKey: 'business_glossary',
    name: 'Business glossary',
    description:
      'A shared dictionary of business terms attached to your data model, with AI-drafted definitions submitted for human review.',
    endpoints: [
      '/explore-design/glossary',
      '/explore-design/glossary/lookup',
      '/explore-design/glossary/ai-draft',
    ],
    surface: 'Explore & Design · Glossary',
  },
  {
    module: 'explore_design',
    featureKey: 'ai_change_analyst',
    name: 'AI change analyst',
    description:
      'AI narrates what changed in your project, flags risks per release axis and keeps the full review history.',
    endpoints: ['/explore-design/{id}/ai/history', '/explore-design/{id}/release-state'],
    surface: 'Explore & Design · right bar',
  },
  {
    module: 'explore_design',
    featureKey: 'catalog_360',
    name: 'Data catalog & object 360',
    description:
      'Browses sources and products in a governed catalog and opens a 360° view — context, lineage, governance, profile — for any object.',
    endpoints: [
      '/catalog/overview',
      '/catalog/sources',
      '/catalog/objects/{id}/360',
      '/catalog/tables/{db}/{schema}/{table}/context',
    ],
    surface: 'Explore & Design · Catalog',
    entitlement: 'catalog:catalog_360',
  },
  {
    module: 'explore_design',
    featureKey: 'data_products',
    name: 'Data products',
    description:
      'Packages curated tables into published data products with lineage, consumer tracking and refresh controls.',
    endpoints: [
      '/data-products',
      '/data-products/{id}/publish',
      '/data-products/{id}/lineage',
      '/data-products/{id}/consumers',
    ],
    surface: 'Explore & Design · Catalog · Products',
    entitlement: 'projects:data_products',
  },
  {
    module: 'explore_design',
    featureKey: 'project_rls',
    name: 'Project row-level security',
    description:
      'Applies per-role row filters to project data so each team only ever sees its own slice.',
    endpoints: ['/gouvernance/policies/row-access', '/gouvernance/policies/row-access/apply'],
    surface: 'Explore & Design · Deploy · security step',
    entitlement: 'projects:project_rls',
  },

  // ── Workflow ───────────────────────────────────────────────────────────────
  {
    module: 'workflow',
    featureKey: 'block_catalog',
    name: 'Pipeline block canvas',
    description:
      'Builds data pipelines from reusable blocks on a visual canvas — extract, transform, load — without hand-written plumbing.',
    endpoints: [
      '/workflow',
      '/workflow/from-graph',
      '/workflow/{id}/steps',
      '/workflow/action-templates',
    ],
    surface: 'Workflow · canvas',
  },
  {
    module: 'workflow',
    featureKey: 'run_execute',
    name: 'Run & track',
    description:
      'Runs a pipeline on demand and tracks every run to success or failure, with the ability to cancel mid-flight.',
    endpoints: ['/workflow/{id}/execute', '/workflow/{id}/runs', '/workflow/{id}/cancel'],
    surface: 'Workflow · Runs',
  },
  {
    module: 'workflow',
    featureKey: 'run_logs_analysis',
    name: 'Run logs & AI analysis',
    description:
      'Shows task-level logs for each run and gives an AI read on why a run failed and how to fix it.',
    endpoints: [
      '/workflow/{id}/tasks/{taskId}/logs',
      '/workflow/{id}/runs/{runId}/analyze',
      '/workflow/{id}/block-events',
    ],
    surface: 'Workflow · Runs · run detail',
  },
  {
    module: 'workflow',
    featureKey: 'validation_dry_run',
    name: 'Validate & dry run',
    description:
      'Checks a pipeline’s configuration and simulates a full execution without touching any data.',
    endpoints: [
      '/workflow/{id}/validate',
      '/workflow/{id}/dry-run',
      '/workflow/{id}/validate-block',
      '/workflow/{id}/compile',
    ],
    surface: 'Workflow · canvas toolbar',
  },
  {
    module: 'workflow',
    featureKey: 'scheduling',
    name: 'Pipeline scheduling',
    description:
      'Runs pipelines automatically on a recurring schedule, with pause and resume per pipeline.',
    endpoints: [
      '/workflow/{id}/schedule',
      '/workflow/{id}/schedule/pause',
      '/workflow/{id}/schedule/resume',
      '/workflow/schedules',
    ],
    surface: 'Workflow · Schedules',
  },
  {
    module: 'workflow',
    featureKey: 'workflow_deployments',
    name: 'Pipeline deployments',
    description:
      'Promotes a pipeline through review and approval into production, keeping the deployment trail.',
    endpoints: [
      '/workflow/{id}/deployments',
      '/workflow/{id}/deployments/{depId}/approve',
      '/workflow/{id}/deployments/{depId}/execute',
    ],
    surface: 'Workflow · Deployments',
    entitlement: 'projects:deployments',
  },
  {
    module: 'workflow',
    featureKey: 'task_import',
    name: 'Task discovery & import',
    description:
      'Finds scheduled jobs already running in your warehouse and imports them as managed, observable pipelines.',
    endpoints: [
      '/workflow/tasks/discover',
      '/workflow/tasks/import',
      '/observability/tasks/importable',
    ],
    surface: 'Workflow · Import',
  },
  {
    module: 'workflow',
    featureKey: 'adhoc_code',
    name: 'Ad-hoc SQL, Python & notebooks',
    description:
      'Runs one-off SQL or Python against your data and manages notebooks for the advanced steps a canvas can’t express.',
    endpoints: ['/workflow/run-sql', '/workflow/run-python', '/workflow/notebooks'],
    surface: 'Workflow · code blocks / notebooks',
  },

  // ── Governance ─────────────────────────────────────────────────────────────
  {
    module: 'gouvernance',
    featureKey: 'user_lifecycle',
    name: 'User lifecycle',
    description:
      'Creates, enables, disables and removes platform users, and assigns or revokes their roles from one screen.',
    endpoints: [
      '/gouvernance/users',
      '/gouvernance/add-user',
      '/gouvernance/drop-user',
      '/gouvernance/enable_user/',
      '/gouvernance/disable_user/',
      '/gouvernance/assign-role',
    ],
    surface: 'Governance · Users',
  },
  {
    module: 'gouvernance',
    featureKey: 'd360_roles',
    name: 'Granular application roles',
    description:
      'Defines fine-grained application roles from templates and decides exactly which actions each role may perform in every module.',
    endpoints: [
      '/gouvernance/d360-roles',
      '/gouvernance/d360-roles/templates',
      '/gouvernance/d360-roles/action-registry',
      '/gouvernance/d360-roles/my-permissions',
    ],
    surface: 'Governance · Roles',
    entitlement: 'gouvernance:d360_roles',
  },
  {
    module: 'gouvernance',
    featureKey: 'privilege_grants',
    name: 'Roles & privilege grants',
    description:
      'Creates warehouse roles, grants or revokes object privileges per role, and reviews the whole grant matrix in one view.',
    endpoints: [
      '/gouvernance/roles',
      '/gouvernance/add-role',
      '/gouvernance/grants-matrix',
      '/gouvernance/grant-permission',
      '/gouvernance/revoke-permission',
      '/gouvernance/grants-for-role/{role}',
    ],
    surface: 'Governance · Grants',
  },
  {
    module: 'gouvernance',
    featureKey: 'policy_lifecycle',
    name: 'Data protection policies',
    description:
      'Creates row-access and masking policies that filter or hide sensitive data per role, and binds them to your tables.',
    endpoints: [
      '/gouvernance/policies',
      '/gouvernance/policies/row-access',
      '/gouvernance/policies/row-access/apply',
      '/gouvernance/policies/health',
    ],
    surface: 'Governance · Policies',
    entitlement: 'gouvernance:policy_lifecycle',
  },
  {
    module: 'gouvernance',
    featureKey: 'policy_simulation',
    name: 'Policy preview & simulation',
    description:
      'Previews exactly which rows and masked values each role would see before a policy goes live.',
    endpoints: [
      '/gouvernance/policies/row-access/simulate',
      '/gouvernance/policies/masking/preview',
    ],
    surface: 'Governance · Policies · preview',
  },
  {
    module: 'gouvernance',
    featureKey: 'pii_intelligence',
    name: 'Sensitive-data detection',
    description:
      'AI scans your tables for personal and sensitive data and applies classification tags automatically.',
    endpoints: [
      '/gouvernance/policies/classification/classify',
      '/gouvernance/policies/classification/extract-categories',
      '/gouvernance/policies/classification/apply-tags',
    ],
    surface: 'Governance · Classification',
    entitlement: 'gouvernance:pii_intelligence',
  },
  {
    module: 'gouvernance',
    featureKey: 'access_review',
    name: 'Access review & compliance score',
    description:
      'Runs a periodic review of who can access what — unused grants, MFA gaps, expiring policies — rolled into one compliance score.',
    endpoints: [
      '/gouvernance/access-review/summary',
      '/gouvernance/compliance/score',
      '/gouvernance/roles/{role}/least-privilege',
      '/gouvernance/security-matrix',
    ],
    surface: 'Governance · Access Review',
  },
  {
    module: 'gouvernance',
    featureKey: 'gui_permissions',
    name: 'Page access control',
    description:
      'Controls which pages and tabs each role can open in the application, per module and per user.',
    endpoints: [
      '/gouvernance/gui-permissions',
      '/gouvernance/gui-permissions/my-access',
      '/api/platform/grants',
    ],
    surface: 'Governance · Page Access / Administration · Access Control',
    entitlement: 'gouvernance:gui_permissions',
  },
  {
    module: 'gouvernance',
    featureKey: 'identity_integrations',
    name: 'SSO & service identities',
    description:
      'Manages single sign-on, service accounts, API keys and network policies for people and machines.',
    endpoints: [
      '/gouvernance/oauth/integrations',
      '/gouvernance/oauth/saml-integrations',
      '/gouvernance/oauth/service-users',
      '/gouvernance/oauth/api-keys',
    ],
    surface: 'Governance · Identity',
  },
  {
    module: 'gouvernance',
    featureKey: 'access_requests',
    name: 'Data access requests',
    description:
      'Lets anyone request access to a dataset and routes the approval to its owner, with a full audit trail of decisions.',
    endpoints: [
      '/access-requests',
      '/access-requests/inbox',
      '/access-requests/{id}/approve',
      '/access-requests/{id}/deny',
    ],
    surface: 'Governance · Access Requests / bell inbox',
  },

  // ── Business Reporting ─────────────────────────────────────────────────────
  {
    module: 'bi_reporting',
    featureKey: 'dashboard_crud',
    name: 'Dashboard builder',
    description:
      'Creates dashboards with pages, widgets and filters over your governed data — layout and queries in one place.',
    endpoints: [
      '/bi-dashboard',
      '/bi-dashboard/{id}/pages',
      '/bi-dashboard/{id}/widgets',
      '/bi-dashboard/{id}/filters',
    ],
    surface: 'Business Reporting · editor',
  },
  {
    module: 'bi_reporting',
    featureKey: 'dashboard_render',
    name: 'Live rendering & export',
    description:
      'Renders dashboards from live data, snapshots them and exports the result for sharing outside the platform.',
    endpoints: [
      '/bi-dashboard/{id}/render',
      '/bi-dashboard/{id}/snapshot',
      '/bi-dashboard/{id}/export',
    ],
    surface: 'Business Reporting · viewer',
  },
  {
    module: 'bi_reporting',
    featureKey: 'ai_dashboard_wizard',
    name: 'AI dashboard wizard',
    description:
      'Describe the view you want in plain language and AI builds the chart — or a whole dashboard — from your data.',
    endpoints: ['/bi-dashboard/nl-to-chart', '/bi-dashboard/auto-create', '/bi-dashboard/templates'],
    surface: 'Business Reporting · AI build',
  },
  {
    module: 'bi_reporting',
    featureKey: 'drill_through',
    name: 'Drill-through',
    description:
      'Click any chart to open the underlying rows and keep digging without leaving the dashboard.',
    endpoints: ['/bi-dashboard/{id}/drill-through'],
    surface: 'Business Reporting · viewer · right bar',
  },
  {
    module: 'bi_reporting',
    featureKey: 'publish_share',
    name: 'Publish & share',
    description:
      'Moves a dashboard from draft to live and shares it with chosen users or roles — revocably, with the share list visible.',
    endpoints: [
      '/bi-dashboard/{id}/publish',
      '/bi-dashboard/{id}/unpublish',
      '/bi-dashboard/{id}/share',
      '/bi-dashboard/{id}/shares',
    ],
    surface: 'Business Reporting · header actions',
  },
  {
    module: 'bi_reporting',
    featureKey: 'dashboard_cost',
    name: 'Dashboard cost & status',
    description:
      'Shows what each dashboard costs to serve and whether it is draft or live, so expensive reports are visible.',
    endpoints: ['/bi-dashboard/{id}/cost', '/bi-dashboard/{id}/status'],
    surface: 'Business Reporting · header badges',
  },

  // ── AI Intelligence ────────────────────────────────────────────────────────
  {
    module: 'intelligent',
    featureKey: 'nl_analytics',
    name: 'Ask your data',
    description:
      'Ask questions in plain language and get governed, explainable answers computed directly from your data.',
    endpoints: ['/cortex/query', '/cortex/analyst/query'],
    surface: 'AI Intelligence · AI Chat',
  },
  {
    module: 'intelligent',
    featureKey: 'semantic_models',
    name: 'Semantic models',
    description:
      'Curated models that teach the AI your business vocabulary so answers always use the right tables and definitions.',
    endpoints: [
      '/cortex/semantic-models/list',
      '/cortex/semantic-models',
      '/cortex/semantic-models/generate',
    ],
    surface: 'AI Intelligence · Semantic Models',
  },
  {
    module: 'intelligent',
    featureKey: 'recommendations',
    name: 'Actionable recommendations',
    description:
      'Continuously analyzes your account and queues cost, performance and governance recommendations you can acknowledge, snooze or resolve.',
    endpoints: [
      '/api/recommendations',
      '/api/recommendations/analyze',
      '/api/recommendations/{id}/resolve',
    ],
    surface: 'AI Intelligence · AI Advisor',
    entitlement: 'recommendations:reco_lifecycle',
  },
  {
    module: 'intelligent',
    featureKey: 'ml_classification',
    name: 'Classification models',
    description:
      'Trains classification models on your tables and runs predictions without your data ever leaving the platform.',
    endpoints: [
      '/cortex/ml/classification/train',
      '/cortex/ml/classification/predict',
      '/cortex/ml/classification/models',
    ],
    surface: 'AI Intelligence · ML Features',
  },
  {
    module: 'intelligent',
    featureKey: 'model_finetuning',
    name: 'Model fine-tuning',
    description:
      'Fine-tunes AI models on your own data and tracks each training job from launch to completion.',
    endpoints: ['/cortex/ml/finetune', '/cortex/ml/finetune/jobs'],
    surface: 'AI Intelligence · ML Features',
  },
  {
    module: 'intelligent',
    featureKey: 'vector_search',
    name: 'Semantic (vector) search',
    description:
      'Embeds text columns so you can search your data by meaning, not just by keyword.',
    endpoints: ['/cortex/vectors/columns', '/cortex/embeddings'],
    surface: 'AI Intelligence · ML Features',
  },
  {
    module: 'intelligent',
    featureKey: 'query_workload_ai',
    name: 'Query workload analysis',
    description:
      'AI reviews your query workload, finds redundant or expensive patterns and quantifies the potential saving.',
    endpoints: [
      '/cortex/query-analytics/analyze',
      '/cortex/query-analytics/summary',
      '/cortex/query-analytics/redundant-groups',
    ],
    surface: 'AI Intelligence · Query Analytics',
  },
  {
    module: 'intelligent',
    featureKey: 'top_insights',
    name: 'Automatic insights',
    description:
      'Finds the drivers behind a metric’s movement automatically instead of manual slice-and-dice.',
    endpoints: ['/cortex/ml/top-insights', '/cortex/ml/top-insights/{name}/analyze'],
    surface: 'AI Intelligence · ML Features',
  },

  // ── Data Health ────────────────────────────────────────────────────────────
  {
    module: 'data_quality',
    featureKey: 'quality_dashboard',
    name: 'Quality health score',
    description:
      'One health score for your data plus per-dimension views — completeness, uniqueness, freshness and ingestion status.',
    endpoints: [
      '/data-quality/quality-summary',
      '/data-quality/completeness-metrics',
      '/data-quality/freshness-metrics',
    ],
    surface: 'Data Health · Overview',
  },
  {
    module: 'data_quality',
    featureKey: 'dmf_lifecycle',
    name: 'Quality metrics on tables',
    description:
      'Attaches reusable quality metrics to tables, schedules their evaluation and keeps the results history.',
    endpoints: [
      '/gouvernance/policies/dmf/list',
      '/gouvernance/policies/dmf/associate',
      '/gouvernance/policies/dmf/schedule',
      '/data-quality/dmf-results',
    ],
    surface: 'Data Health · Checks',
    entitlement: 'data_quality:dmf_lifecycle',
  },
  {
    module: 'data_quality',
    featureKey: 'thresholds_breaches',
    name: 'Thresholds & breaches',
    description:
      'Sets pass/fail thresholds on quality metrics and lists every breach so nothing degrades silently.',
    endpoints: [
      '/data-quality/dmf/thresholds',
      '/data-quality/dmf/breaches',
      '/data-quality/run-check',
    ],
    surface: 'Data Health · Checks',
  },
  {
    module: 'data_quality',
    featureKey: 'auto_profiler',
    name: 'Table profiler',
    description:
      'Profiles a table in one click — row counts, nulls, distinct values — and refreshes its quality score.',
    endpoints: ['/data-quality/auto-profile'],
    surface: 'Data Health · table actions',
  },
  {
    module: 'data_quality',
    featureKey: 'dmf_suggestions',
    name: 'AI check suggestions',
    description:
      'AI looks at each table’s shape and suggests the quality checks worth attaching to it.',
    endpoints: ['/data-quality/dmf/suggest', '/data-quality/projects/{projectId}/dmf-suggest'],
    surface: 'Data Health · Checks · suggest',
  },
  {
    module: 'data_quality',
    featureKey: 'anomaly_detection',
    name: 'Anomaly detection',
    description:
      'Machine learning watches your metric history and flags unusual changes in the data before users notice.',
    endpoints: ['/data-quality/anomaly-detection'],
    surface: 'Data Health · Anomalies',
  },
  {
    module: 'data_quality',
    featureKey: 'trust_center',
    name: 'Trust scoring',
    description:
      'Opts tables into trust scoring and reports which datasets are safe to build on and which need attention.',
    endpoints: [
      '/data-quality/trust-center/enable',
      '/data-quality/trust-center/report',
      '/data-quality/trust-center/recommendations',
    ],
    surface: 'Data Health · Trust',
  },

  // ── Observability ──────────────────────────────────────────────────────────
  {
    module: 'observability',
    featureKey: 'health_kpis',
    name: 'Platform health KPIs',
    description:
      'Live health scores for pipelines, cost, security and performance, consolidated into one operations dashboard.',
    endpoints: ['/observability/kpis', '/observability/dashboard'],
    surface: 'Observability · Dashboard',
  },
  {
    module: 'observability',
    featureKey: 'alerts',
    name: 'Alerts & acknowledgement',
    description:
      'Raises cost spikes, failed tasks and security findings as alerts you can acknowledge and track to closure.',
    endpoints: [
      '/observability/alerts',
      '/observability/alerts/{alertId}/ack',
      '/observability/alerts/cross-module',
    ],
    surface: 'Observability · Alerts',
  },
  {
    module: 'observability',
    featureKey: 'slo_tracking',
    name: 'SLO tracking',
    description:
      'Tracks service-level objectives against actuals with error budgets, so reliability is measured instead of guessed.',
    endpoints: ['/observability/slo-tracking'],
    surface: 'Observability · SLOs',
  },
  {
    module: 'observability',
    featureKey: 'resource_monitors',
    name: 'Spend guardrails',
    description:
      'Puts hard credit limits on compute so a runaway job suspends itself instead of burning the budget.',
    endpoints: [
      '/observability/cost/monitors',
      '/observability/cost/monitors/{name}',
      '/observability/cost/monitors/{name}/assign',
    ],
    surface: 'Observability · Cost / Administration · Cost Governance',
    entitlement: 'observability:resource_monitors',
  },
  {
    module: 'observability',
    featureKey: 'budgets',
    name: 'Spend budgets',
    description:
      'Sets spend budgets per scope and warns before you cross them, keeping monthly costs predictable.',
    endpoints: ['/observability/budgets', '/observability/budgets/{name}'],
    surface: 'Observability · Cost',
    entitlement: 'observability:budgets',
  },
  {
    module: 'observability',
    featureKey: 'lineage_explorer',
    name: 'Data lineage',
    description:
      'Maps how data flows between tables and pipelines — upstream and downstream — so changes and incidents can be traced.',
    endpoints: [
      '/observability/lineage',
      '/observability/dependencies/graph',
      '/observability/lineage/with-tasks',
    ],
    surface: 'Observability · Lineage',
  },
  {
    module: 'observability',
    featureKey: 'freshness_probes',
    name: 'Freshness probes',
    description:
      'Probes tables and whole schemas for staleness so you know the data is current before anyone builds on it.',
    endpoints: [
      '/observability/probes/table',
      '/observability/probes/schema',
      '/observability/probes/batch-check',
      '/observability/sensors/all',
    ],
    surface: 'Observability · Freshness',
  },
  {
    module: 'observability',
    featureKey: 'performance_watch',
    name: 'Performance monitoring',
    description:
      'Watches query performance over time and lists the slowest queries with their cost so tuning targets are obvious.',
    endpoints: ['/observability/performance/metrics', '/observability/performance/slow-queries'],
    surface: 'Observability · Performance',
  },
  {
    module: 'observability',
    featureKey: 'compliance_reports',
    name: 'Compliance reports',
    description:
      'Generates GDPR and SOC 2 readiness assessments plus a security posture summary for auditors.',
    endpoints: [
      '/observability/compliance/gdpr',
      '/observability/compliance/soc2',
      '/observability/security/posture',
    ],
    surface: 'Observability · Compliance',
  },

  // ── Administration ─────────────────────────────────────────────────────────
  {
    module: 'administration',
    featureKey: 'entitlements',
    name: 'Feature entitlements',
    description:
      'Turns platform features on or off for the whole account — the switchboard this registry reads and writes.',
    endpoints: [
      '/api/administration/entitlements',
      '/api/administration/entitlements/{module}/{feature_key}',
    ],
    surface: 'Administration · Features / Entitlements',
  },
  {
    module: 'administration',
    featureKey: 'governance_posture',
    name: 'Governance posture',
    description:
      'A per-module rollup of enabled features, granted roles, bound policies and usage — who governs what, at a glance.',
    endpoints: ['/api/administration/governance-posture'],
    surface: 'Administration · Entitlements & Feature Gov.',
  },
  {
    module: 'administration',
    featureKey: 'platform_health',
    name: 'Platform health telemetry',
    description:
      'Audit-backed usage and error telemetry for the whole platform, filterable by user and module.',
    endpoints: ['/administration/platform-health'],
    surface: 'Administration · Platform Health',
  },
  {
    module: 'administration',
    featureKey: 'usage_analytics',
    name: 'Performance analytics',
    description:
      'Per-endpoint, per-user and per-module performance drill-down for the account, over any time window.',
    endpoints: [
      '/administration/performance/{account}/overview',
      '/administration/performance/{account}/by-endpoint',
      '/administration/performance/{account}/by-user',
    ],
    surface: 'Administration · Performance',
  },
  {
    module: 'administration',
    featureKey: 'server_metrics',
    name: 'Server metrics',
    description:
      'Live in-process server metrics — request rate, latency percentiles, memory and recent errors — for operations.',
    endpoints: ['/admin/server-metrics'],
    surface: 'Administration · Server Metrics',
  },
  {
    module: 'administration',
    featureKey: 'api_health_runs',
    name: 'API health runs',
    description:
      'Probes every backend route, persists each sweep and trends reliability release over release.',
    endpoints: [
      '/admin/api-health/runs',
      '/admin/api-health/runs/{run_id}',
      '/admin/api-health/introspect',
    ],
    surface: 'Administration · API Health',
  },
];
