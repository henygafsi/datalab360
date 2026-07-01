/** Centralized API endpoints (backend contract). Data journey: services call getUrl() → backend path. */
// ////dependency//// lib → config.database.config only
import { API_CONFIG } from '@/config/database.config';

/**
 * ============================================================================
 *  API — single typed source of truth for every backend endpoint the FE calls.
 * ============================================================================
 *
 * Each entry is `{ method, path(args) }` where `path` returns a **relative**
 * URL (no host). Call through `apiClient`, which prepends `API_CONFIG.BASE_URL`
 * and attaches auth headers:
 *
 *     apiClient.get(API.common.tables(db, schema))
 *     apiClient.post(API.workflow.execute(id), body)
 *
 * Every path below is verified against the live FastAPI routers
 * (app/modules/<module>/router*.py + app/main.py). Grouped by domain.
 *
 * NOTE: the legacy `API_CONTRACTS` object further down returns ABSOLUTE urls
 * via getUrl() and is kept for back-compat with a few fetch()/axios call-sites.
 * Prefer `API` + `apiClient` for new code.
 */
const enc = encodeURIComponent;

type ProjectTypeFilter = 'explore_design' | 'workflow' | 'WORKFLOW';

function qs(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const API = {
  /** Auth & user — backend: /signin, /user/* (app/main.py + modules/auth/router.py). */
  auth: {
    /** POST /user/login/ (alias of POST /signin). body: { account_name, username, password } */
    login: () => '/user/login/',
    /** POST /signin — login alias returning access_token. */
    signin: () => '/signin',
    /** POST /user/register/ */
    register: () => '/user/register/',
    /** POST /user/bootstrap-account/ */
    bootstrapAccount: () => '/user/bootstrap-account/',
    /** GET /user/me/modules — modules the signed-in user can access. */
    myModules: () => '/user/me/modules',
  },

  /** Connectors — backend: /connect/* (modules/connectors/router.py). */
  connect: {
    /** GET /connect/connectors — list all registered connectors. */
    listConnectors: () => '/connect/connectors',
    /** GET /connect/connectors/health — health status of all connectors. */
    connectorsHealth: () => '/connect/connectors/health',
    /** GET /connect/source-catalog — full source catalog (connector view). */
    sourceCatalog: () => '/connect/source-catalog',
    /** POST /connect/connectors — create a new connector. */
    createConnector: () => '/connect/connectors',
    /** GET /connect/connectors/{id} — get connector by id. */
    getConnector: (id: string) => `/connect/connectors/${enc(id)}`,
    /** POST /connect/connectors/{id}/test — test a connector connection. */
    testConnector: (id: string) => `/connect/connectors/${enc(id)}/test`,
    /** POST /connect/connectors/{id}/sync — trigger a manual sync. */
    syncConnector: (id: string) => `/connect/connectors/${enc(id)}/sync`,
    createInternalStage: () => '/connect/stages/internal',
    listStages: () => '/connect/stages',
    createAwsStage: () => '/connect/aws/stage',
    createGcsStage: () => '/connect/gcs/stage',
    /** POST /connect/stages/{stage}/upload (multipart). */
    uploadToStage: (stage: string, overwrite?: boolean) =>
      `/connect/stages/${enc(stage)}/upload${qs({ overwrite })}`,
    /** GET /connect/stages/{stage}/files */
    listStageFiles: (stage: string, params?: { path?: string; sort?: string }) =>
      `/connect/stages/${enc(stage)}/files${qs(params)}`,
    /** DELETE /connect/stages/{stage}/files/{file_path} */
    deleteStageFile: (stage: string, filePath: string) =>
      `/connect/stages/${enc(stage)}/files/${enc(filePath)}`,
    /** POST /connect/snowflake_lake/datalake/connect */
    datalakeConnect: () => '/connect/snowflake_lake/datalake/connect',

    // --- Azure ---
    /** POST /connect/azure/storage_integration */
    azureStorageIntegration: () => '/connect/azure/storage_integration',
    /** POST /connect/azure/notification_integration */
    azureNotificationIntegration: () => '/connect/azure/notification_integration',
    /** POST /connect/azure/snowpipe */
    azureSnowpipe: () => '/connect/azure/snowpipe',
    /** POST /connect/azure/stage */
    azureStage: () => '/connect/azure/stage',

    // --- AWS ---
    /** POST /connect/aws/storage_integration */
    awsStorageIntegration: () => '/connect/aws/storage_integration',

    // --- GCS ---
    /** POST /connect/gcs/storage_integration */
    gcsStorageIntegration: () => '/connect/gcs/storage_integration',
    /** POST /connect/gcs/notification_integration */
    gcsNotificationIntegration: () => '/connect/gcs/notification_integration',

    // --- Integration (storage integration describe / alter) ---
    /** GET /connect/integration?integration_name=... */
    integrationDetails: () => '/connect/integration',
    /** PATCH /connect/integration/{integration_name} */
    patchIntegration: (name: string) => `/connect/integration/${enc(name)}`,

    // --- Stage files (preview / download / grants) ---
    /** GET /connect/stages/{stage}/grants */
    stageGrants: (stage: string) => `/connect/stages/${enc(stage)}/grants`,
    /** GET /connect/stages/{stage}/files/{file_path}/preview */
    previewStageFile: (stage: string, filePath: string) =>
      `/connect/stages/${enc(stage)}/files/${enc(filePath)}/preview`,
    /** GET /connect/stages/{stage}/files/{file_path}/download */
    downloadStageFile: (stage: string, filePath: string) =>
      `/connect/stages/${enc(stage)}/files/${enc(filePath)}/download`,

    // --- PostgreSQL / MySQL ---
    /** POST /connect/postgres/ingest */
    postgresIngest: () => '/connect/postgres/ingest',
    /** POST /connect/mysql/ingest */
    mysqlIngest: () => '/connect/mysql/ingest',

    // --- Databricks ---
    /** POST /connect/databricks/test */
    databricksTest: () => '/connect/databricks/test',
    /** POST /connect/databricks/catalogs */
    databricksCatalogs: () => '/connect/databricks/catalogs',
    /** POST /connect/databricks/schemas */
    databricksSchemas: () => '/connect/databricks/schemas',
    /** POST /connect/databricks/tables */
    databricksTables: () => '/connect/databricks/tables',
    /** POST /connect/databricks/ingest */
    databricksIngest: () => '/connect/databricks/ingest',

    // --- Oracle ---
    /** POST /connect/oracle/test */
    oracleTest: () => '/connect/oracle/test',
    /** POST /connect/oracle/ingest */
    oracleIngest: () => '/connect/oracle/ingest',
    /** POST /connect/oracle/sample-stage */
    oracleSampleStage: () => '/connect/oracle/sample-stage',

    // --- Iceberg ---
    /** POST /connect/iceberg/test */
    icebergTest: () => '/connect/iceberg/test',
    /** POST /connect/iceberg/namespaces */
    icebergNamespaces: () => '/connect/iceberg/namespaces',
    /** POST /connect/iceberg/tables */
    icebergTables: () => '/connect/iceberg/tables',
    /** POST /connect/iceberg/ingest */
    icebergIngest: () => '/connect/iceberg/ingest',
  },

  /**
   * Common metadata wizard — backend: /common/* (modules/common/router.py).
   * (Frontend historically called these under /explore-design/guided/*, which no
   * longer exists — the real routes are /common/*.)
   */
  common: {
    /** GET /common/databases */
    databases: () => '/common/databases',
    /** GET /common/schemas/{database_name} */
    schemas: (database: string) => `/common/schemas/${enc(database)}`,
    /** GET /common/tables/{database_name}/{schema_name} */
    tables: (database: string, schema: string) =>
      `/common/tables/${enc(database)}/${enc(schema)}`,
    /** GET /common/get_table_columns?database_name&schema_name&table_name */
    tableColumns: (database: string, schema: string, table: string) =>
      `/common/get_table_columns${qs({ database_name: database, schema_name: schema, table_name: table })}`,
  },

  /**
   * Unified projects — backend: /projects/* (modules/projects/router.py).
   * The cross-module project registry. Workflow/Explore lists come from here
   * via ?project_type=.
   */
  projects: {
    /** GET /projects?project_type&status&mine_only&limit&offset */
    list: (params?: {
      project_type?: ProjectTypeFilter;
      status?: string;
      mine_only?: boolean;
      limit?: number;
      offset?: number;
    }) => `/projects${qs(params)}`,
    /** GET /projects/{id} */
    get: (id: string) => `/projects/${enc(id)}`,
    /** PATCH-equivalent: PUT /projects/{id} (update name/metadata/status). */
    update: (id: string) => `/projects/${enc(id)}`,
    /** DELETE /projects/{id} (soft delete). */
    remove: (id: string) => `/projects/${enc(id)}`,
    /** GET /projects/{id}/events ; POST to add an event. */
    events: (id: string, params?: { status?: string; event_type?: string; limit?: number }) =>
      `/projects/${enc(id)}/events${qs(params)}`,
    /** PATCH /projects/{id}/events/bulk-update */
    bulkUpdateEvents: (id: string) => `/projects/${enc(id)}/events/bulk-update`,
    contributors: (id: string) => `/projects/${enc(id)}/contributors`,
    contributor: (id: string, username: string) => `/projects/${enc(id)}/contributors/${enc(username)}`,
    runs: (id: string) => `/projects/${enc(id)}/runs`,
    deployments: (id: string) => `/projects/${enc(id)}/deployments`,
    deployment: (id: string, deploymentId: string) =>
      `/projects/${enc(id)}/deployments/${enc(deploymentId)}`,
    approveDeployment: (id: string, deploymentId: string) =>
      `/projects/${enc(id)}/deployments/${enc(deploymentId)}/approve`,
    rejectDeployment: (id: string, deploymentId: string) =>
      `/projects/${enc(id)}/deployments/${enc(deploymentId)}/reject`,
    executeDeployment: (id: string, deploymentId: string) =>
      `/projects/${enc(id)}/deployments/${enc(deploymentId)}/execute`,
    rollback: (id: string) => `/projects/${enc(id)}/rollback`,
    lastUsed: () => '/projects/last-used',
    unified: () => '/projects/unified',
  },

  /**
   * Explore & Design — backend: /explore-design/* (modules/projects/explore_design/router.py).
   * Project create is POST /explore-design (empty path on the prefixed router);
   * everything else is project-scoped (/explore-design/{project_id}/...).
   */
  exploreDesign: {
    /** POST /explore-design — create an explore-design project. */
    createProject: () => '/explore-design',
    /** GET /explore-design/recent-deployment-errors */
    recentDeploymentErrors: (limit?: number) =>
      `/explore-design/recent-deployment-errors${qs({ limit })}`,
    ddlActions: (projectId: string) => `/explore-design/${enc(projectId)}/ddl-actions`,
    executeDdlActions: (projectId: string) =>
      `/explore-design/${enc(projectId)}/ddl-actions/execute`,
    versions: (projectId: string) => `/explore-design/${enc(projectId)}/versions`,
    /** POST /explore-design/{project_id}/deployments — request a deployment. */
    requestDeployment: (projectId: string) => `/explore-design/${enc(projectId)}/deployments`,
    listDeployments: (projectId: string) => `/explore-design/${enc(projectId)}/deployments`,
    approveDeployment: (projectId: string, deploymentId: string) =>
      `/explore-design/${enc(projectId)}/deployments/${enc(deploymentId)}/approve`,
    rejectDeployment: (projectId: string, deploymentId: string) =>
      `/explore-design/${enc(projectId)}/deployments/${enc(deploymentId)}/reject`,
    executeDeployment: (projectId: string, deploymentId: string) =>
      `/explore-design/${enc(projectId)}/deployments/${enc(deploymentId)}/execute`,
    scheduleIngestion: (projectId: string) =>
      `/explore-design/${enc(projectId)}/ingestion/schedule`,
    executeIngestion: (projectId: string) =>
      `/explore-design/${enc(projectId)}/ingestion/execute`,
    ingestionRuns: (projectId: string) => `/explore-design/${enc(projectId)}/ingestion/runs`,
    /** GET /explore-design/{project_id}/deployment-readiness — change_diff + lineage + cost */
    deploymentReadiness: (projectId: string) =>
      `/explore-design/${enc(projectId)}/deployment-readiness`,
    /** POST /explore-design/{project_id}/impact-analysis — downstream dependency impact */
    impactAnalysis: (projectId: string) =>
      `/explore-design/${enc(projectId)}/impact-analysis`,
    /** POST /explore-design/{project_id}/impact-analysis/enhanced — richer impact incl. lineage */
    impactAnalysisEnhanced: (projectId: string) =>
      `/explore-design/${enc(projectId)}/impact-analysis/enhanced`,
    /** POST /explore-design/{project_id}/conflict-check — detect event conflicts before deploy */
    conflictCheck: (projectId: string) =>
      `/explore-design/${enc(projectId)}/conflict-check`,
    /** POST /explore-design/{project_id}/post-verify — schema comparison after deploy */
    postVerify: (projectId: string) =>
      `/explore-design/${enc(projectId)}/post-verify`,
    /** GET /explore-design/{project_id}/ingestion/operations — list versioned ingestion ops */
    ingestionOperations: (projectId: string) =>
      `/explore-design/${enc(projectId)}/ingestion/operations`,
    /** GET /explore-design/schema-clone/list — list schema clones (project_id as query param) */
    schemaCloneList: () => `/explore-design/schema-clone/list`,
    // --- Business glossary (W6 reintegration: was unwired) -------------------
    /** GET /explore-design/glossary — list business glossary terms. */
    glossaryList: () => '/explore-design/glossary',
    /** POST /explore-design/glossary — create/update a glossary term (admin). */
    glossaryUpsert: () => '/explore-design/glossary',
    /** GET /explore-design/glossary/lookup?q=… — advisor glossary lookup (reuse). */
    glossaryLookup: (q?: string) => `/explore-design/glossary/lookup${qs({ q })}`,
    /** POST /explore-design/glossary/ai-draft — AI-draft a definition for review (admin). */
    glossaryAiDraft: () => '/explore-design/glossary/ai-draft',
    /** DELETE /explore-design/glossary/{term} — delete a glossary term (admin). */
    glossaryDelete: (term: string) => `/explore-design/glossary/${enc(term)}`,
    // --- Snowflake object management (W6 reintegration: dynamic tables/streams/tasks) ---
    /** GET|POST /explore-design/dynamic-tables — list / create dynamic tables. */
    dynamicTables: () => '/explore-design/dynamic-tables',
    /** GET|PATCH|DELETE /explore-design/dynamic-tables/{name} — describe / alter / drop. */
    dynamicTable: (name: string) => `/explore-design/dynamic-tables/${enc(name)}`,
    /** POST /explore-design/dynamic-tables/{name}/{action} — suspend|resume|refresh. */
    dynamicTableAction: (name: string, action: 'suspend' | 'resume' | 'refresh') =>
      `/explore-design/dynamic-tables/${enc(name)}/${action}`,
    /** GET|POST /explore-design/streams — list / create streams. */
    streams: () => '/explore-design/streams',
    /** GET|DELETE /explore-design/streams/{name} — describe / drop. */
    stream: (name: string) => `/explore-design/streams/${enc(name)}`,
    /** GET /explore-design/streams/{name}/data — peek stream data. */
    streamData: (name: string) => `/explore-design/streams/${enc(name)}/data`,
    /** GET /explore-design/tasks — list tasks. */
    deTasks: () => '/explore-design/tasks',
    /** GET|PATCH|DELETE /explore-design/tasks/{name} — describe / alter / drop. */
    deTask: (name: string) => `/explore-design/tasks/${enc(name)}`,
    /** POST /explore-design/tasks/{name}/{action} — suspend|resume. */
    deTaskAction: (name: string, action: 'suspend' | 'resume') =>
      `/explore-design/tasks/${enc(name)}/${action}`,
  },

  /**
   * Workflow (low-code ETL) — backend: /workflow/* (modules/projects/workflow/router.py).
   * Nested REST keyed by workflow_id. The workflow LIST is the unified project
   * list filtered by type: GET /projects?project_type=WORKFLOW.
   */
  workflow: {
    /** GET /projects?project_type=WORKFLOW — list workflows (unified registry). */
    list: () => `/projects${qs({ project_type: 'WORKFLOW' })}`,
    /** POST /workflow — create a workflow. */
    create: () => '/workflow',
    /**
     * PATCH /workflow/{id} — update workflow metadata (tags / name / description).
     * A workflow is a project row, so this persists to the shared project TAGS
     * column with cache invalidation (verified vs backend).
     */
    update: (id: string) => `/workflow/${enc(id)}`,
    capabilities: () => '/workflow/capabilities',
    steps: (id: string) => `/workflow/${enc(id)}/steps`,
    step: (id: string, stepId: string) => `/workflow/${enc(id)}/steps/${enc(stepId)}`,
    /** POST /workflow/{id}/execute */
    execute: (id: string) => `/workflow/${enc(id)}/execute`,
    compile: (id: string) => `/workflow/${enc(id)}/compile`,
    validate: (id: string) => `/workflow/${enc(id)}/validate`,
    runs: (id: string) => `/workflow/${enc(id)}/runs`,
    analyzeRun: (id: string, runId: string) => `/workflow/${enc(id)}/runs/${enc(runId)}/analyze`,
    versions: (id: string) => `/workflow/${enc(id)}/versions`,
    /** POST /workflow/{id}/schedule — schedule as a Snowflake task. */
    schedule: (id: string) => `/workflow/${enc(id)}/schedule`,
    /** POST /workflow/{id}/schedule/pause — suspend the scheduled task. */
    schedulePause: (id: string) => `/workflow/${enc(id)}/schedule/pause`,
    /** POST /workflow/{id}/schedule/resume — resume the scheduled task. */
    scheduleResume: (id: string) => `/workflow/${enc(id)}/schedule/resume`,
    /** DELETE /workflow/{id}/schedule */
    scheduleDelete: (id: string) => `/workflow/${enc(id)}/schedule`,
    schedules: () => '/workflow/schedules',
    taskStatus: (id: string) => `/workflow/${enc(id)}/task-status`,
    contributors: (id: string) => `/workflow/${enc(id)}/contributors`,
    contributor: (id: string, contributorId: string) =>
      `/workflow/${enc(id)}/contributors/${enc(contributorId)}`,
    /** GET /workflow/preview-table — preview rows for a table (params: database, schema, table, limit). */
    previewTable: () => '/workflow/preview-table',
    /** GET /workflow/{id}/block-events — SSE block-level events for a running workflow. */
    blockEvents: (id: string) => `/workflow/${enc(id)}/block-events`,
    /** POST /workflow/from-graph — create a workflow from a DAG/graph payload. */
    fromGraph: () => '/workflow/from-graph',
    /** GET /workflow/{id}/clone-data-tests — run connector data-quality checks for a workflow. */
    cloneDataTests: (id: string) => `/workflow/${enc(id)}/clone-data-tests`,
    /** GET /workflow/{id}/schedules — per-workflow schedule list (distinct from global schedules()). */
    perWorkflowSchedules: (id: string) => `/workflow/${enc(id)}/schedules`,
    /** GET /workflow/{id}/deployments — list deployments for a specific workflow. */
    deployments: (id: string) => `/workflow/${enc(id)}/deployments`,
    /** POST /workflow/{id}/deployments/{depId}/approve */
    approveDeployment: (id: string, depId: string) => `/workflow/${enc(id)}/deployments/${enc(depId)}/approve`,
    /** POST /workflow/{id}/deployments/{depId}/reject */
    rejectDeployment: (id: string, depId: string) => `/workflow/${enc(id)}/deployments/${enc(depId)}/reject`,
    /** POST /workflow/{id}/deployments/{depId}/execute */
    executeDeployment: (id: string, depId: string) => `/workflow/${enc(id)}/deployments/${enc(depId)}/execute`,
    /** GET /workflow/tasks/discover — discover data warehouse tasks that can be imported. */
    tasksDiscover: () => '/workflow/tasks/discover',
    /** POST /workflow/tasks/import — import discovered tasks as workflow projects. */
    tasksImport: () => '/workflow/tasks/import',
    /** GET /workflow/{id}/cost-summary — credit cost breakdown for a workflow. */
    costSummary: (id: string) => `/workflow/${enc(id)}/cost-summary`,
    /** GET /workflow/{id}/dag — full DAG representation for a workflow. */
    dag: (id: string) => `/workflow/${enc(id)}/dag`,
    /** POST /workflow/{id}/validate-block — validate a single block config. */
    validateBlock: (id: string) => `/workflow/${enc(id)}/validate-block`,
    /** POST /workflow/{id}/dry-run — simulate execution without side-effects. */
    dryRun: (id: string) => `/workflow/${enc(id)}/dry-run`,
    /** GET /workflow/{id}/estimate-vs-reference — compare cost estimate to baseline. */
    estimateVsReference: (id: string) => `/workflow/${enc(id)}/estimate-vs-reference`,
    /**
     * @deprecated No frontend consumer — palette uses action-templates instead.
     * TODO: wire to palette or remove after confirming admin api-health prober does not reflect this.
     */
    blocks: () => '/workflow/blocks',
    /**
     * @deprecated No frontend consumer found. TODO: remove after confirming no import surfaces it.
     */
    blocksCategories: () => '/workflow/blocks/categories',
    /**
     * @deprecated Declared but never called. TODO: wire to server-driven palette or remove.
     * GET /workflow/catalog/blocks — catalog-grounded block list with schema metadata.
     */
    catalogBlocks: () => '/workflow/catalog/blocks',
    /** GET /workflow/action-templates — reusable step templates. */
    actionTemplates: () => '/workflow/action-templates',
    /** POST /workflow/action-templates — create a new action template. */
    createActionTemplate: () => '/workflow/action-templates',
    /** POST /workflow/{workflowId}/cancel — cancel an in-progress workflow run (verified vs backend). */
    cancelRun: (workflowId: string) => `/workflow/${enc(workflowId)}/cancel`,
    /** GET /workflow/{workflowId}/tasks/{taskId}/logs — fetch task log lines (verified vs backend). */
    runLogs: (workflowId: string, taskId: string) =>
      `/workflow/${enc(workflowId)}/tasks/${enc(taskId)}/logs`,
    /** POST /workflow/setup/initialize-tables — initialize workflow tracking tables (one-shot). */
    setupInitializeTables: () => '/workflow/setup/initialize-tables',
    /** GET /workflow/git/repositories — list Snowflake Git repositories. */
    gitRepositories: () => '/workflow/git/repositories',
    /** GET /workflow/git/repositories/{name} — describe a single Git repository. */
    gitRepository: (name: string) => `/workflow/git/repositories/${enc(name)}`,
    /** GET /workflow/git/repositories/{name}/branches — list branches in a Git repository. */
    gitRepositoryBranches: (name: string) => `/workflow/git/repositories/${enc(name)}/branches`,
    /** GET /workflow/git/repositories/{name}/tags — list tags in a Git repository. */
    gitRepositoryTags: (name: string) => `/workflow/git/repositories/${enc(name)}/tags`,
    /** POST /workflow/git/repositories/{name}/fetch — fetch remote changes for a Git repository. */
    gitRepositoryFetch: (name: string) => `/workflow/git/repositories/${enc(name)}/fetch`,
    /** PATCH /workflow/compute-pools/{name} — alter a compute pool (api_workflow_alter_compute_pool, 2026-06-21). */
    computePool: (name: string) => `/workflow/compute-pools/${enc(name)}`,
    /** GET/POST /workflow/notebooks — list or create Snowflake notebooks. */
    notebooks: () => '/workflow/notebooks',
    /** GET/PATCH/DELETE /workflow/notebooks/{name} — single notebook operations. */
    notebook: (name: string) => `/workflow/notebooks/${enc(name)}`,
    /** POST /workflow/notebooks/{name}/execute — execute a Snowflake notebook. */
    notebookExecute: (name: string) => `/workflow/notebooks/${enc(name)}/execute`,
    /** POST /workflow/run-sql — run ad-hoc SQL in the data warehouse. */
    runSql: () => '/workflow/run-sql',
    /** POST /workflow/run-python — run ad-hoc Python via Snowpark. */
    runPython: () => '/workflow/run-python',
  },

  /** Gouvernance — backend: /gouvernance/* (modules/gouvernance + gui_permissions). */
  gouvernance: {
    clientDashboard: () => '/gouvernance/client/dashboard',
    users: () => '/gouvernance/users',
    usersWithRoles: () => '/gouvernance/users-with-roles',
    addUser: () => '/gouvernance/add-user',
    dropUser: () => '/gouvernance/drop-user',
    // TODO(contract): no backend route for batch user-drop — only DELETE /gouvernance/drop-user
    // exists (gouvernance.py:1280). Loop drop-user client-side or add a backend batch route.
    dropUsersBatch: () => '/gouvernance/drop-users-batch',
    enableUser: () => '/gouvernance/enable_user/',
    disableUser: () => '/gouvernance/disable_user/',
    roles: () => '/gouvernance/roles',
    addRole: () => '/gouvernance/add-role',
    dropRole: () => '/gouvernance/drop-role',
    dropRolesBatch: () => '/gouvernance/drop-roles-batch',
    assignRole: () => '/gouvernance/assign-role',
    unassignRole: () => '/gouvernance/unassign-role',
    /** GET|PUT /gouvernance/users/{username}/roles (backend: gouvernance.py:1520,1567). */
    userRoles: (username: string) => `/gouvernance/users/${enc(username)}/roles`,
    /** GET /gouvernance/users/{username} — single user detail (fetch_users.ts:getUserDetails). */
    userDetail: (username: string) => `/gouvernance/users/${enc(username)}`,
    grants: () => '/gouvernance/grants',
    /** GET /gouvernance/grants-for-role/{role_name} (backend: gouvernance.py:2321 — role_name is required). */
    grantsForRole: (roleName: string) => `/gouvernance/grants-for-role/${enc(roleName)}`,
    updateGrants: () => '/gouvernance/update-grants',
    securityMatrix: () => '/gouvernance/security-matrix',
    policies: () => '/gouvernance/policies',
    /** GET /gouvernance/policies/my-scope — role-scoped view: policies relevant to the
     *  caller's active role, annotated manageable_by_me / references_my_role (G1).
     *  NOT accountadmin-gated. (policies.ts:getMyScopePolicies). */
    policiesMyScope: () => '/gouvernance/policies/my-scope',
    /** GET /gouvernance/policies/health — policy health check across all policy types. */
    policiesHealth: () => '/gouvernance/policies/health',
    /** GET /gouvernance/policies/tags/list — list all governance tags (policies.ts:getTags). */
    policyTagsList: () => '/gouvernance/policies/tags/list',
    /** GET /gouvernance/policies/objects/{db}/{schema}/{table}/policies — policies
     *  applied to a deployed object: { row_access, masking, aggregation, tags }
     *  (policies.ts:getTablePolicies). Empty/honest for a not-yet-deployed table. */
    tablePolicies: (db: string, s: string, t: string) =>
      `/gouvernance/policies/objects/${enc(db)}/${enc(s)}/${enc(t)}/policies`,
    /** POST /gouvernance/policies/classification/classify — run semantic classification on a table (dmf.ts:classifyTable). */
    classificationClassify: () => '/gouvernance/policies/classification/classify',
    /** POST /gouvernance/policies/row-access — create a row access policy (policies.ts:createRLSPolicy). */
    policyRowAccess: () => '/gouvernance/policies/row-access',
    /** POST /gouvernance/policies/row-access/simulate — D1: who-can-see preview (read-only, honest degrade). */
    policyRowAccessSimulate: () => '/gouvernance/policies/row-access/simulate',
    /** POST /gouvernance/policies/masking/preview — D2: masked-vs-unmasked sample under caller's own role. */
    policyMaskingPreview: () => '/gouvernance/policies/masking/preview',
    /** GET /gouvernance/roles/{role}/least-privilege — D3: granted-but-unused grants (advisory only). */
    roleLeastPrivilege: (role: string) => `/gouvernance/roles/${enc(role)}/least-privilege`,
    /** GET /gouvernance/d360-roles — list all Data360 granular roles (fetch_roles.ts:getD360Roles). */
    d360Roles: () => '/gouvernance/d360-roles',
    /** GET /gouvernance/d360-roles/my-permissions — caller's effective action set (useCanPerform hook). */
    d360MyPermissions: () => '/gouvernance/d360-roles/my-permissions',
    /** GET /gouvernance/policies/dmf/list[?database=…&schema=…] — list available DMFs. */
    policyDmfList: () => '/gouvernance/policies/dmf/list',
    /** POST /gouvernance/policies/dmf — create a custom DMF (query params). */
    policyDmfCreate: () => '/gouvernance/policies/dmf',
    /** POST /gouvernance/policies/dmf/associate — associate a DMF with table columns. */
    policyDmfAssociate: () => '/gouvernance/policies/dmf/associate',
    /** POST /gouvernance/policies/dmf/disassociate — remove a DMF from table columns. */
    policyDmfDisassociate: () => '/gouvernance/policies/dmf/disassociate',
    /** POST /gouvernance/policies/dmf/schedule — set DMF evaluation schedule on a table. */
    policyDmfSchedule: () => '/gouvernance/policies/dmf/schedule',
    /** GET /gouvernance/policies/dmf/references — DMF associations for a table. */
    policyDmfReferences: () => '/gouvernance/policies/dmf/references',
    /** GET /gouvernance/compliance/score — account governance posture score (masking/row-access/tagging weighted). */
    complianceScore: () => '/gouvernance/compliance/score',
    /** GET /gouvernance/access-review/summary — access-review findings (mfa gaps, expiring policies, orphan grants). */
    accessReviewSummary: () => '/gouvernance/access-review/summary',
    // --- Identity & integrations (W6 reintegration: oauth / gui-perms / ent-users) ---
    /** GET|POST /gouvernance/oauth/integrations — list / create OAuth|SAML security integrations. */
    oauthIntegrations: () => '/gouvernance/oauth/integrations',
    /** GET /gouvernance/oauth/network-policies — list network policies. */
    oauthNetworkPolicies: () => '/gouvernance/oauth/network-policies',
    /** GET /gouvernance/oauth/api-keys — list service accounts with RSA keys. */
    oauthApiKeys: () => '/gouvernance/oauth/api-keys',
    /** POST /gouvernance/oauth/service-users — create a service user (PAT/API access). */
    oauthServiceUsers: () => '/gouvernance/oauth/service-users',
    /** POST /gouvernance/oauth/assign-rsa-key — assign an RSA public key to a user. */
    oauthAssignRsaKey: () => '/gouvernance/oauth/assign-rsa-key',
    /** DELETE /gouvernance/oauth/revoke-rsa-key/{username} — revoke a user's RSA key. */
    oauthRevokeRsaKey: (username: string) => `/gouvernance/oauth/revoke-rsa-key/${enc(username)}`,
    /** POST /gouvernance/oauth/saml-integrations — create a SAML2 SSO integration. */
    oauthSamlIntegrations: () => '/gouvernance/oauth/saml-integrations',
    /** GET|POST /gouvernance/gui-permissions — list / upsert GUI page-access permissions. */
    guiPermissions: () => '/gouvernance/gui-permissions',
    /** GET /gouvernance/gui-permissions/my-access — caller's effective page access. */
    guiMyAccess: () => '/gouvernance/gui-permissions/my-access',
    /** GET /gouvernance/gui-permissions/effective/{username} — effective page access for a user. */
    guiEffective: (username: string) => `/gouvernance/gui-permissions/effective/${enc(username)}`,
    /** DELETE /gouvernance/gui-permissions/{permission_id} — delete a GUI permission. */
    guiPermissionDelete: (permissionId: string) => `/gouvernance/gui-permissions/${enc(permissionId)}`,
    /** GET /gouvernance/enterprise-users — list enterprise directory users. */
    enterpriseUsers: () => '/gouvernance/enterprise-users',
    /** PUT|DELETE /gouvernance/enterprise-users/{username} — update / delete an enterprise user. */
    enterpriseUser: (username: string) => `/gouvernance/enterprise-users/${enc(username)}`,
    /** POST /gouvernance/enterprise-users/sync — sync users from Snowflake. */
    enterpriseUsersSync: () => '/gouvernance/enterprise-users/sync',
  },

  /** Cortex (AI) — backend: /cortex/* (modules/cortex). */
  cortex: {
    /** POST /cortex/query — Cortex Analyst NL→SQL */
    query: () => '/cortex/query',
    /** POST /cortex/complete — LLM completion (generation, summarize, etc.) */
    complete: () => '/cortex/complete',
    /** GET /cortex/kpis — KPI header stats for intelligent page */
    kpis: () => '/cortex/kpis',
    /** GET /cortex/models — list available AI/LLM models */
    models: () => '/cortex/models',
    /** GET /cortex/agents[?database=<db>] — list Cortex Agents */
    agents: (db?: string) => `/cortex/agents${db ? `?database=${enc(db)}` : ''}`,
    /** GET /cortex/semantic-models/list — list semantic model files */
    semanticModels: () => '/cortex/semantic-models/list',
    /** GET /cortex/semantic-models/{name} — fetch content of one semantic model */
    semanticModel: (name: string) => `/cortex/semantic-models/${enc(name)}`,
    /** POST /cortex/semantic-models — create/upload a semantic model */
    semanticModelsCreate: () => '/cortex/semantic-models',
    /** POST /cortex/semantic-models/generate — auto-generate YAML from DDL */
    semanticModelsGenerate: () => '/cortex/semantic-models/generate',
    /** POST /cortex/semantic-models/generate-and-save — generate + save to stage in one step */
    semanticModelsGenerateAndSave: () => '/cortex/semantic-models/generate-and-save',
    /** GET /cortex/semantic-views[?database=<db>] — list semantic views for NL analytics */
    semanticViews: (db?: string) => `/cortex/semantic-views${db ? `?database=${enc(db)}` : ''}`,
    /** GET /cortex/vectors/columns[?database=<db>] — list vector-embedded columns */
    vectorColumns: (db?: string) => `/cortex/vectors/columns${db ? `?database=${enc(db)}` : ''}`,
    /** POST /cortex/embeddings — embed a column with vector model (verified vs backend). */
    embedColumn: () => '/cortex/embeddings',
    /** POST /cortex/analyst/query — Cortex Analyst NL→SQL→results (cortex/router.py:1287, verified vs backend). */
    analystQuery: () => '/cortex/analyst/query',
    /** GET /cortex/ml/classification/models — list classification models */
    classificationModels: () => '/cortex/ml/classification/models',
    /** GET /cortex/ml/classification/{name} — get a classification model */
    classificationModel: (name: string) => `/cortex/ml/classification/${enc(name)}`,
    /** GET /cortex/ml/classification/{name}/metrics — model accuracy metrics */
    classificationMetrics: (name: string) => `/cortex/ml/classification/${enc(name)}/metrics`,
    /** POST /cortex/ml/classification/train — train a classification model */
    classificationTrain: () => '/cortex/ml/classification/train',
    /** POST /cortex/ml/classification/predict — run classification inference */
    classificationPredict: () => '/cortex/ml/classification/predict',
    /** POST /cortex/ml/finetune — create a fine-tune job */
    mlFinetune: () => '/cortex/ml/finetune',
    /** GET /cortex/ml/finetune/jobs — list fine-tune jobs */
    mlFinetuneJobs: () => '/cortex/ml/finetune/jobs',
    /** GET /cortex/ml/finetune/jobs/{id} — get a fine-tune job */
    mlFinetuneJob: (id: string) => `/cortex/ml/finetune/jobs/${enc(id)}`,
    /** POST /cortex/ml/finetune/jobs/{id}/cancel — cancel a fine-tune job */
    mlFinetuneJobCancel: (id: string) => `/cortex/ml/finetune/jobs/${enc(id)}/cancel`,
    /** GET /cortex/ml/document-ai/models — list document-AI models */
    documentAiModels: () => '/cortex/ml/document-ai/models',
    /** POST /cortex/ml/document-ai/predict — run document-AI prediction */
    documentAiPredict: () => '/cortex/ml/document-ai/predict',
    /** GET /cortex/ml/top-insights — list top-insights instances */
    topInsights: () => '/cortex/ml/top-insights',
    /** POST /cortex/ml/top-insights/{name}/analyze — run top-insights analysis */
    topInsightsAnalyze: (name: string) => `/cortex/ml/top-insights/${enc(name)}/analyze`,
    /** GET /cortex/snowpark/compute-pools — list Snowpark compute pools */
    snowparkComputePools: () => '/cortex/snowpark/compute-pools',
    /** GET /cortex/snowpark/services — list Snowpark container services */
    snowparkServices: () => '/cortex/snowpark/services',
    /** GET /cortex/snowpark/streamlit — list Streamlit apps (verified vs backend). */
    snowparkStreamlit: () => '/cortex/snowpark/streamlit',
    /** GET /cortex/snowpark/image-repos — list image repositories */
    snowparkImageRepos: () => '/cortex/snowpark/image-repos',
    /** POST /cortex/query-analytics/analyze — trigger AI query analysis (verified vs backend). */
    queryAnalyticsRun: () => '/cortex/query-analytics/analyze',
    /** GET /cortex/query-analytics/results — fetch analysis results */
    queryAnalyticsResults: () => '/cortex/query-analytics/results',
    /** GET /cortex/query-analytics/summary — fetch analysis summary */
    queryAnalyticsSummary: () => '/cortex/query-analytics/summary',
    /** GET /cortex/query-analytics/redundant-groups — redundant query groups with dedup stats */
    queryAnalyticsRedundantGroups: () => '/cortex/query-analytics/redundant-groups',
    /** GET /cortex/duckdb/datasets — list local analytics datasets */
    duckdbDatasets: () => '/cortex/duckdb/datasets',
    /** POST /cortex/duckdb/query — run a local DuckDB query */
    duckdbQuery: () => '/cortex/duckdb/query',
    /** POST /cortex/duckdb/query-stage — query a Snowflake stage locally */
    stageQuery: () => '/cortex/duckdb/query-stage',
    /** POST /cortex/ml/finetune — fine-tune entry point (alias of mlFinetune; /cortex/finetune does not exist). */
    finetune: () => '/cortex/ml/finetune',
    /** DELETE /cortex/snowpark/compute-pools/{name} — drop a compute pool. */
    snowparkComputePool: (name: string) => `/cortex/snowpark/compute-pools/${enc(name)}`,
    /** GET /cortex/snowpark/services/{name} — describe a container service. */
    snowparkService: (name: string) => `/cortex/snowpark/services/${enc(name)}`,
    /** GET /cortex/snowpark/services/{name}/status — get container service status. */
    snowparkServiceStatus: (name: string) => `/cortex/snowpark/services/${enc(name)}/status`,
    /** GET /cortex/snowpark/services/{name}/logs — fetch container service logs. */
    snowparkServiceLogs: (name: string) => `/cortex/snowpark/services/${enc(name)}/logs`,
  },

  /** Chat — backend: /chat/* (modules/chat/router.py). Conversations, messages, participants, attachments. */
  chat: {
    /** GET /chat/conversations — list all conversations for the current user. */
    conversations: () => '/chat/conversations',
    /** GET/PATCH /chat/conversations/{id} — fetch or update a single conversation. */
    conversation: (id: string) => `/chat/conversations/${enc(id)}`,
    /** POST /chat/conversations/dm — create a direct-message conversation. */
    conversationsDm: () => '/chat/conversations/dm',
    /** POST /chat/conversations/group — create a group conversation. */
    conversationsGroup: () => '/chat/conversations/group',
    /** GET/POST /chat/conversations/{id}/messages — list or send messages. */
    conversationMessages: (id: string) => `/chat/conversations/${enc(id)}/messages`,
    /** GET /chat/conversations/{id}/participants — list conversation participants. */
    conversationParticipants: (id: string) => `/chat/conversations/${enc(id)}/participants`,
    /** POST /chat/conversations/{id}/read — mark messages as read up to a given message. */
    conversationRead: (id: string) => `/chat/conversations/${enc(id)}/read`,
    /** POST /chat/conversations/{id}/attachments — upload a file attachment. */
    conversationAttachments: (id: string) => `/chat/conversations/${enc(id)}/attachments`,
    /** GET /chat/online-users — list users with active WebSocket connections. */
    onlineUsers: () => '/chat/online-users',
  },

  /** Observability — backend: /observability/* (mounted with prefix in main.py). */
  observability: {
    base: () => '/observability',
    /** GET /observability/kpis — intelligent health-score KPIs (main dashboard). */
    kpis: () => '/observability/kpis',
    /** GET /observability/intelligent-kpis — alias used by some consumers. */
    intelligentKpis: () => '/observability/intelligent-kpis',
    /** GET /observability/alerts[?days=N] — cost spikes, failed tasks, security findings. */
    alerts: (days?: number) => `/observability/alerts${qs({ days })}`,
    /** POST /observability/alerts/{alertId}/ack — acknowledge an alert (verified vs backend). */
    acknowledgeAlert: (alertId: string) => `/observability/alerts/${enc(alertId)}/ack`,
    /** GET /observability/lineage — data lineage from ACCESS_HISTORY. */
    lineage: (params?: { database?: string; schema?: string; table?: string; days?: number }) =>
      `/observability/lineage${qs(params)}`,
    /** GET /observability/performance/metrics[?days=N] */
    performanceMetrics: (days?: number) => `/observability/performance/metrics${qs({ days })}`,
    /** GET /observability/performance/slow-queries[?days=N&threshold_seconds=N] */
    slowQueries: (params?: { days?: number; threshold_seconds?: number }) =>
      `/observability/performance/slow-queries${qs(params)}`,
    /** GET /observability/cost/daily-credits[?days=N] — daily credit usage trend. */
    dailyCredits: (days?: number) => `/observability/cost/daily-credits${qs({ days })}`,
    /** GET /observability/probes/platform — probe all Data360 metadata tables for freshness. */
    probesPlatform: () => '/observability/probes/platform',
    /** GET /observability/compliance/gdpr — GDPR compliance assessment report. */
    complianceGdpr: () => '/observability/compliance/gdpr',
    /** GET /observability/compliance/soc2 — SOC 2 Type II compliance assessment. */
    complianceSoc2: () => '/observability/compliance/soc2',
    /** GET /observability/lineage/access-patterns[?days=N] — table access patterns. */
    lineageAccessPatterns: (days?: number) => `/observability/lineage/access-patterns${qs({ days })}`,
    /** GET /observability/lineage/cross-module[?days=N&database=…] — objects→roles→policies. */
    lineageCrossModule: (params?: { days?: number; database?: string }) =>
      `/observability/lineage/cross-module${qs(params)}`,
    /** GET /observability/lineage/with-tasks[?database=…&days=N] — lineage with tasks merged in. */
    lineageWithTasks: (params?: { database?: string; days?: number }) =>
      `/observability/lineage/with-tasks${qs(params)}`,
    /** GET /observability/activity/summary[?days=N] — user activity from QUERY_HISTORY. */
    activitySummary: (days?: number) => `/observability/activity/summary${qs({ days })}`,
    /** GET /observability/security/posture — security assessment metrics. */
    securityPosture: () => '/observability/security/posture',
    /** GET /observability/cost/warehouse-usage[?days=N] — WAREHOUSE_METERING_HISTORY credits. */
    warehouseUsage: (days?: number) => `/observability/cost/warehouse-usage${qs({ days })}`,
    /** GET /observability/cost/storage — storage usage metrics. */
    storage: () => '/observability/cost/storage',
    /** GET /observability/health — simple health check. */
    health: () => '/observability/health',
    /** GET /observability/dependencies[?object_name=…&object_domain=…&direction=…&days=N] */
    dependencies: (params?: {
      object_name?: string;
      object_domain?: string;
      direction?: 'upstream' | 'downstream';
      days?: number;
    }) => `/observability/dependencies${qs(params)}`,
    /** GET /observability/dependencies/graph[?database=…&schema=…] */
    dependenciesGraph: (params?: { database?: string; schema?: string }) =>
      `/observability/dependencies/graph${qs(params)}`,
    /** GET /observability/trust-center/findings — Trust Center security findings. */
    trustCenterFindings: () => '/observability/trust-center/findings',
    /** GET /observability/trust-center/summary — Trust Center summary overview. */
    trustCenterSummary: () => '/observability/trust-center/summary',
    /** GET /observability/tasks/importable[?state=…] — importable tasks for workflow import. */
    tasksImportable: (state?: string) => `/observability/tasks/importable${qs({ state })}`,
    /** GET /observability/probes/table?table=… — probe table freshness via row timestamps. */
    probesTable: (table: string) => `/observability/probes/table${qs({ table })}`,
    /** GET /observability/probes/schema?database=…&schema=… — probe all tables in a schema. */
    probesSchema: (database: string, schema: string) =>
      `/observability/probes/schema${qs({ database, schema })}`,
    /** GET /observability/probes/changes?table=…&since=… — rows changed since a timestamp. */
    probesChanges: (table: string, since: string) =>
      `/observability/probes/changes${qs({ table, since })}`,
    /** GET /observability/alerts/cross-module[?days=N] — cross-module correlated alerts. */
    alertsCrossModule: (days?: number) => `/observability/alerts/cross-module${qs({ days })}`,
    /** GET /observability/slo-tracking[?days=N] — SLO targets vs actuals, error budgets. */
    sloTracking: (days?: number) => `/observability/slo-tracking${qs({ days })}`,
    /** GET /observability/dashboard — consolidated dashboard payload. */
    dashboard: () => '/observability/dashboard',
    /** GET /observability/cost/monitors — list resource monitors with quota/used/remaining. */
    costMonitors: () => '/observability/cost/monitors',
    /** GET|PUT|DELETE /observability/cost/monitors/{name} — single resource monitor. */
    costMonitor: (name: string) => `/observability/cost/monitors/${enc(name)}`,
    /** POST /observability/cost/monitors/{name}/assign — attach a warehouse to a monitor. */
    costMonitorAssign: (name: string) => `/observability/cost/monitors/${enc(name)}/assign`,
    /** GET|POST /observability/budgets — list/create spend budgets. */
    budgets: () => '/observability/budgets',
    /** PUT|DELETE /observability/budgets/{name} — update/delete a spend budget. */
    budget: (name: string) => `/observability/budgets/${enc(name)}`,
    /** POST /observability/probes/batch-check — freshness for many tables in one call. W6. */
    probesBatchCheck: () => '/observability/probes/batch-check',
    /** GET /observability/sensors/all — batch sensor check across all modules. W6. */
    sensorsAll: () => '/observability/sensors/all',
  },

  /**
   * Command Center — backend: /command-center/* (modules/command_center/router.py).
   * Backs Account-overview tabs (Overview, FinOps, Security, Platform Activity, etc.).
   */
  commandCenter: {
    /** GET /command-center/overview-kpis[?range=<30d>] — cached single-payload KPIs. */
    overviewKpis:         (range?: string) => `/command-center/overview-kpis${range ? `?range=${enc(range)}` : ''}`,
    /** POST /command-center/overview-kpis/refresh — trigger cache refresh. */
    overviewKpisRefresh:  ()               => '/command-center/overview-kpis/refresh',
    /** POST /command-center/overview-kpis/install — provision cache table/proc (admin only). */
    overviewKpisInstall:  ()               => '/command-center/overview-kpis/install',
    /** GET /command-center/summary[?days=<n>] — executive summary across all modules. */
    summary:              (days?: number)  => `/command-center/summary${days != null ? `?days=${days}` : ''}`,
    /** GET /command-center/cost-breakdown[?days=<n>] — FinOps credit breakdown by warehouse/service. */
    costBreakdown:        (days?: number)  => `/command-center/cost-breakdown${days != null ? `?days=${days}` : ''}`,
    /** GET /command-center/infrastructure[?days=<n>] — Snowflake infra snapshot. */
    infrastructure:       (days?: number)  => `/command-center/infrastructure${days != null ? `?days=${days}` : ''}`,
    /** GET /command-center/security-audit[?days=<n>] — login, grant, MFA audit. */
    securityAudit:        (days?: number)  => `/command-center/security-audit${days != null ? `?days=${days}` : ''}`,
    /** GET /command-center/module-health[?days=<n>] — per-module health status. */
    moduleHealth:         (days?: number)  => `/command-center/module-health${days != null ? `?days=${days}` : ''}`,
    /** POST /command-center/warm-user-cache — warms user-specific KPI cache on login. */
    warmUserCache:        ()               => '/command-center/warm-user-cache',
    /**
     * GET /command-center/cache-metrics — runtime cache & API-call telemetry:
     * hit-rate, memory footprint, key-counts by prefix, service warm-cycle status,
     * and top endpoints (call count · avg/max latency · error rate). Admin-only.
     * Self-hides on 404/501 (route not deployed on this backend yet).
     */
    cacheMetrics:         ()               => '/command-center/cache-metrics',
    /** GET /command-center/tabs/{tab}[?days=<n>] — consolidated per-tab endpoint. */
    tab:                  (tab: string, days?: number) =>
      `/command-center/tabs/${enc(tab)}${days != null ? `?days=${days}` : ''}`,
    /** GET /command-center/time-context — parse time range preset into start/end/prev. */
    timeContext:          ()               => '/command-center/time-context',
    /** GET /command-center/filter-options[?days=<n>] — smart filter dropdowns with activity counts. */
    filterOptions:        (days?: number)  => `/command-center/filter-options${days != null ? `?days=${days}` : ''}`,
    /** GET /command-center/activity-feed — unified cross-module activity stream. */
    activityFeed:         ()               => '/command-center/activity-feed',
    /** GET /command-center/cross-module — cross-module intelligence joins. */
    crossModule:          ()               => '/command-center/cross-module',
    /** GET /command-center/warehouse-performance — utilization & query metrics. */
    warehousePerformance: ()               => '/command-center/warehouse-performance',
    /** GET /command-center/query-intelligence — top/slow queries, errors. */
    queryIntelligence:    ()               => '/command-center/query-intelligence',
    /** GET /command-center/pipelines — pipeline & ingestion health. */
    pipelines:            ()               => '/command-center/pipelines',
    /**
     * GET /command-center/projects/{id}/scores[?days=<n>] — per-project DQ/COST/PERF/GOV
     * scorecards. Each dimension carries `scope: "project" | "account"` so the UI can
     * label account-level fallbacks honestly (never shown as per-project data).
     */
    projectScores:        (id: string, days?: number) =>
      `/command-center/projects/${enc(id)}/scores${days != null ? `?days=${days}` : ''}`,
    /**
     * GET /command-center/projects/{id}/rollup[?days=<n>] — precomputed per-project
     * KPI rollup (DQ·PERF·GOV·STORAGE + per-project COST + reco counts + last
     * deploy/event), served cheaply from the batch-materialised PROJECT_ROLLUP
     * table; cold miss falls back to a live compute. `served_from` flags which.
     */
    projectRollup:        (id: string, days?: number) =>
      `/command-center/projects/${enc(id)}/rollup${days != null ? `?days=${days}` : ''}`,
  },

  /** Org accounts — backend: /org-accounts/* (modules/org_accounts/router.py). */
  orgAccounts: {
    /** GET /org-accounts/dashboard/overview — fast (~1s) accounts list + overview stats. */
    dashboardOverview:    ()                            => '/org-accounts/dashboard/overview',
    /** GET /org-accounts/dashboard/usage — combined credits + storage totals. */
    dashboardUsage:       ()                            => '/org-accounts/dashboard/usage',
    /** GET /org-accounts/dashboard/trends[?days=<n>] — chart trend data. */
    dashboardTrends:      (days?: number)               => `/org-accounts/dashboard/trends${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/accounts — list all accounts in the Snowflake org. */
    accounts:             ()                            => '/org-accounts/accounts',
    /** GET /org-accounts/accounts/{name} — detail for a specific account. */
    accountDetail:        (name: string)                => `/org-accounts/accounts/${enc(name)}`,
    /** DELETE /org-accounts/accounts/{name} — drop account (orgadmin only, irreversible). */
    dropAccount:          (name: string)                => `/org-accounts/accounts/${enc(name)}`,
    /** GET /org-accounts/account-health-score — health score for the current account. */
    accountHealthScore:   ()                            => '/org-accounts/account-health-score',
    /** GET /org-accounts/health/{name} — per-account health detail. */
    accountHealth:        (name: string)                => `/org-accounts/health/${enc(name)}`,
    /** GET /org-accounts/credits[?days=<n>] — credit usage with service breakdown. */
    credits:              (days?: number)               => `/org-accounts/credits${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/credits/trend[?days=<n>] — daily org credit trend. */
    creditsTrend:         (days?: number)               => `/org-accounts/credits/trend${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/credits/top[?days=<n>&limit=<n>] — top credit consumers. */
    creditsTop:           (days?: number, limit?: number) =>
      `/org-accounts/credits/top${qs({ days, limit })}`,
    /** GET /org-accounts/credit-forecast[?days_back=<n>] — linear regression forecast. */
    creditForecast:       (daysBack?: number)           => `/org-accounts/credit-forecast${daysBack != null ? `?days_back=${daysBack}` : ''}`,
    /** GET /org-accounts/cost-simulation/{type}/{id}[?days=30] — A: per-object 30d cost projection (baseline+bands, null→"—"). */
    costSimulation:       (objectType: string, objectId: string, days?: number) =>
      `/org-accounts/cost-simulation/${enc(objectType)}/${enc(objectId)}${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/credits/history/{name}[?days=<n>] — per-account daily credit history. */
    creditHistory:        (name: string, days?: number) =>
      `/org-accounts/credits/history/${enc(name)}${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/warehouses[?days=<n>] — warehouse usage across all accounts. */
    warehouses:           (days?: number)               => `/org-accounts/warehouses${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/warehouses/{name}[?days=<n>] — warehouse usage for a specific account. */
    accountWarehouses:    (name: string, days?: number) =>
      `/org-accounts/warehouses/${enc(name)}${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/organization/warehouse-credits[?days=<n>] — per-warehouse credits from ORGANIZATION_USAGE. */
    orgWarehouseCredits:  (days?: number)               => `/org-accounts/organization/warehouse-credits${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/organization/costs[?days=<n>] — org costs by account in currency (W6 FinOps). */
    orgCosts:             (days?: number)               => `/org-accounts/organization/costs${days != null ? `?days=${days}` : ''}`,
    /** GET /org-accounts/organization/storage — org storage per account (W6 FinOps). */
    orgStorage:           ()                            => '/org-accounts/organization/storage',
    /** GET /org-accounts/organization/remaining-balance — org remaining credit balance (W6 FinOps). */
    orgRemainingBalance:  ()                            => '/org-accounts/organization/remaining-balance',
    /** GET /org-accounts/org-summary — activity rolled up role→module/project→account. */
    orgSummary:           ()                            => '/org-accounts/org-summary',
    /** GET /org-accounts/events[?days=<n>] — platform events audit trail. */
    events:               (days?: number)               => `/org-accounts/events${days != null ? `?days=${days}` : ''}`,
    /** POST /org-accounts/warehouses/{name}/resize — ALTER WAREHOUSE size (connected account). */
    warehouseResize:      (name: string)                => `/org-accounts/warehouses/${enc(name)}/resize`,
    /** PATCH /org-accounts/warehouses/{name}/auto-suspend — set idle auto-suspend seconds. */
    warehouseAutoSuspend: (name: string)                => `/org-accounts/warehouses/${enc(name)}/auto-suspend`,
    /** POST /org-accounts/warehouses/{name}/suspend — ALTER WAREHOUSE SUSPEND. */
    warehouseSuspend:     (name: string)                => `/org-accounts/warehouses/${enc(name)}/suspend`,
    /** GET/POST /org-accounts/resource-monitors — list / create a resource monitor (no DELETE route). */
    resourceMonitors:     ()                            => '/org-accounts/resource-monitors',
  },

  /** Admin — backend: /admin/* (platform-level admin endpoints, admin-role only). */
  admin: {
    /** GET /admin/activity-stats — platform-wide activity stats. */
    activityStats: () => '/admin/activity-stats',
    /**
     * GET /admin/api-health/introspect?query_id=<id> — resolve a probed call's
     * underlying warehouse query (SQL text, status, elapsed/bytes/rows, warehouse,
     * role) plus related events. Used by the api-health DrillPanel. May 404/501
     * until the backend route is live.
     */
    apiHealthIntrospect: (queryId: string) =>
      `/admin/api-health/introspect?query_id=${enc(queryId)}`,
    /**
     * API-health RELEASE RUNS — persist a probe sweep as a tracked per-release
     * "project" and read back per-run KPIs + a per-release rollup/trend.
     * ACCOUNTADMIN-gated (backend `require_accountadmin_role`). May 404/501 until
     * the backend route is live — the consumer degrades to an honest
     * "not available on this backend" notice (never fabricates history).
     */
    apiHealth: {
      /** POST /admin/api-health/runs — persist one sweep. Body: { release, results[] }. */
      persistRun: () => '/admin/api-health/runs',
      /** GET /admin/api-health/runs — per-run KPIs + per-release rollup/trend. */
      listRuns: (release?: string, limit?: number) => {
        const qs = new URLSearchParams();
        if (release) qs.set('release', release);
        if (limit != null) qs.set('limit', String(limit));
        const q = qs.toString();
        return `/admin/api-health/runs${q ? `?${q}` : ''}`;
      },
      /** GET /admin/api-health/runs/{run_id} — stored rows + summary + slowest. */
      runDetail: (runId: string) => `/admin/api-health/runs/${enc(runId)}`,
    },
    /**
     * Real-time cache governance surface (admin-only). FORWARD CONTRACT — these
     * `/admin/cache/*` routes back the SVC-first cache architecture (see vault
     * _TARGET_ARCHITECTURE §4.1). Until the backend ships them they 404/501, and
     * every consumer must degrade to an HONEST "not available on this backend"
     * notice (never fabricate coverage). Mirrors the existing CacheMetricsPanel
     * honesty contract.
     */
    cache: {
      /** GET /admin/cache/coverage — cache warmth per account/role + uncovered warm targets. */
      coverage:          ()                              => '/admin/cache/coverage',
      /** GET /admin/cache/svc-health — service-account health per account (alive · auth_type · fallback_enabled). */
      svcHealth:         ()                              => '/admin/cache/svc-health',
      /** GET /admin/cache/warm-status — background warmer snapshot (last/next cycle, per-target warm/cold/refreshed/fail). */
      warmStatus:        ()                              => '/admin/cache/warm-status',
      /** POST /admin/cache/warm — manual warm trigger. Body: { account, page?, module?, per_role? } (bypasses the per-role env gate). */
      warm:              ()                              => '/admin/cache/warm',
      /** POST /admin/cache/invalidate-surface — precise account-scoped eviction. Body: { account, page?, module?, shared_fns?, dry_run? }. */
      invalidateSurface: ()                              => '/admin/cache/invalidate-surface',
      /** GET /cache/kpis — cache hit/miss rate + per-class key counts. */
      kpis:              ()                              => '/cache/kpis',
      /** GET /cache-stream/stats — live event-bus stats (active subscribers, tracked keys). */
      streamStats:       ()                              => '/cache-stream/stats',
    },
    /** GET /admin/service-account/health — SVC connection health (configured · alive · active_queries · role · degraded). */
    serviceAccountHealth: ()                             => '/admin/service-account/health',
    /** GET /admin/svc-registry — per-account SVC registry (account · user · alive · auth_type). */
    svcRegistry:          ()                             => '/admin/svc-registry',
  },

  /** BI Dashboard — backend: /bi-dashboard/* (modules/bi_dashboard/router.py). */
  biDashboard: {
    list:       ()                      => '/bi-dashboard',
    create:     ()                      => '/bi-dashboard',
    get:        (id: string)            => `/bi-dashboard/${enc(id)}`,
    update:     (id: string)            => `/bi-dashboard/${enc(id)}`,
    delete:     (id: string)            => `/bi-dashboard/${enc(id)}`,
    pages:      (id: string)            => `/bi-dashboard/${enc(id)}/pages`,
    page:       (id: string, p: string) => `/bi-dashboard/${enc(id)}/pages/${enc(p)}`,
    widgets:    (id: string)            => `/bi-dashboard/${enc(id)}/widgets`,
    widget:     (id: string, w: string) => `/bi-dashboard/${enc(id)}/widgets/${enc(w)}`,
    filters:    (id: string)            => `/bi-dashboard/${enc(id)}/filters`,
    filter:     (id: string, f: string) => `/bi-dashboard/${enc(id)}/filters/${enc(f)}`,
    render:     (id: string)            => `/bi-dashboard/${enc(id)}/render`,
    snapshot:   (id: string)            => `/bi-dashboard/${enc(id)}/snapshot`,
    drillThrough:(id: string)           => `/bi-dashboard/${enc(id)}/drill-through`,
    export:     (id: string)            => `/bi-dashboard/${enc(id)}/export`,
    nlToChart:  ()                      => '/bi-dashboard/nl-to-chart',
    autoCreate: ()                      => '/bi-dashboard/auto-create',
    templates:  ()                      => '/bi-dashboard/templates',
    retailKpis: ()                      => '/bi-dashboard/retail-kpis',
    /** GET /bi-dashboard/{id}/cost[?days=N] — honest-partial per-dashboard usage/cost proxy. */
    cost:       (id: string, days?: number) =>
      `/bi-dashboard/${enc(id)}/cost${days != null ? `?days=${days}` : ''}`,
    /** GET /bi-dashboard/{id}/status — draft/live publish state + share count. */
    status:     (id: string)            => `/bi-dashboard/${enc(id)}/status`,
    /** POST /bi-dashboard/{id}/publish — draft → live + notify (activity log). */
    publish:    (id: string)            => `/bi-dashboard/${enc(id)}/publish`,
    /** POST /bi-dashboard/{id}/unpublish — live → draft. */
    unpublish:  (id: string)            => `/bi-dashboard/${enc(id)}/unpublish`,
    /** GET /bi-dashboard/{id}/shares — list current share grants. */
    shares:     (id: string)            => `/bi-dashboard/${enc(id)}/shares`,
    /** POST /bi-dashboard/{id}/share — grant view to a user or D360 role. */
    share:      (id: string)            => `/bi-dashboard/${enc(id)}/share`,
    /** DELETE /bi-dashboard/{id}/shares/{shareId} — revoke a share grant. */
    revokeShare:(id: string, shareId: string) =>
      `/bi-dashboard/${enc(id)}/shares/${enc(shareId)}`,
  },

  /** Data Products — backend: /data-products/* (modules/data_products/router.py). */
  dataProducts: {
    /** GET /data-products — list all data products for the account */
    list: () => '/data-products',
    /** GET /data-products/{id} — fetch a single data product by ID */
    get: (id: string) => `/data-products/${enc(id)}`,
    /** POST /data-products — create a new data product */
    create: () => '/data-products',
    /** PUT /data-products/{id} — update a data product (name, description, SLA, etc.) */
    update: (id: string) => `/data-products/${enc(id)}`,
    /** DELETE /data-products/{id} — delete a data product */
    delete: (id: string) => `/data-products/${enc(id)}`,
    /** GET /data-products/{id}/lineage — upstream + downstream table lineage (data_products.py:1021, verified vs backend). */
    lineage: (id: string) => `/data-products/${enc(id)}/lineage`,
    /** GET /data-products/{id}/consumers — subscriber accounts + recent readers (data_products.py:1087, verified vs backend). */
    consumers: (id: string) => `/data-products/${enc(id)}/consumers`,
    /** POST /data-products/{id}/publish — publish product as a live Snowflake Secure Data Share */
    publish: (id: string) => `/data-products/${enc(id)}/publish`,
    /** POST /data-products/{id}/subscribe — grant a consumer account access to a published share */
    subscribe: (id: string) => `/data-products/${enc(id)}/subscribe`,
    /** POST /data-products/{id}/refresh — refresh the product's backing object (ALTER DYNAMIC TABLE … REFRESH; data_products.py:790, verified vs backend). */
    refresh: (id: string) => `/data-products/${enc(id)}/refresh`,
  },

  /** Data quality — backend: /data-quality/* (modules/data_quality). */
  dataQuality: {
    base: () => '/data-quality',
    /** GET /data-quality/quality-summary — global health score + KPIs */
    qualitySummary: () => '/data-quality/quality-summary',
    /** GET /data-quality/completeness-metrics — NULL_COUNT DMF results per column */
    completenessMetrics: () => '/data-quality/completeness-metrics',
    /** GET /data-quality/uniqueness-metrics — DUPLICATE_COUNT DMF results */
    uniquenessMetrics: () => '/data-quality/uniqueness-metrics',
    /** GET /data-quality/freshness-metrics — table staleness via INFORMATION_SCHEMA */
    freshnessMetrics: () => '/data-quality/freshness-metrics',
    /** GET /data-quality/ingestion-metrics — COPY_HISTORY load status */
    ingestionMetrics: () => '/data-quality/ingestion-metrics',
    /** GET /data-quality/schema-quality — PK / doc coverage per table */
    schemaQuality: () => '/data-quality/schema-quality',
    /** GET /data-quality/classification-coverage — tag coverage from ACCOUNT_USAGE */
    classificationCoverage: () => '/data-quality/classification-coverage',
    /** GET /data-quality/cost-metrics — active/time-travel/failsafe bytes */
    costMetrics: () => '/data-quality/cost-metrics',
    /** GET /data-quality/security-posture — masking / RLS / grants per table */
    securityPosture: () => '/data-quality/security-posture',
    /** GET /data-quality/dmf-results — DATA_METRIC_FUNCTION_REFERENCES view */
    dmfResults: () => '/data-quality/dmf-results',
    /** GET /data-quality/trend-analysis — daily avg DMF metric history */
    trendAnalysis: () => '/data-quality/trend-analysis',
    // TODO(henry-P1): /anomalies, /snapshot, /anomaly-detection and /trust-center/* are NOT
    // in the backend (verified 2026-06-07 vs 896-route dump). Closest real trust routes live
    // under /observability/trust-center/{findings,summary}. 404-self-disable until shipped.
    /** GET /data-quality/anomalies — ML anomaly results. (backend gap) */
    anomalies: () => '/data-quality/anomalies',
    /** GET /data-quality/snapshot — fan-out endpoint: all 9 dimensions. (backend gap) */
    snapshot: () => '/data-quality/snapshot',
    /** POST /data-quality/run-check — threshold check on a single table */
    runCheck: () => '/data-quality/run-check',
    /** POST /data-quality/auto-profile — recompute/refresh a table's column stats (row/null/distinct counts + score) */
    autoProfile: () => '/data-quality/auto-profile',
    /** POST /data-quality/dmf/schedule — schedule a recurring DMF quality check (verified vs backend route dump). */
    dmfSchedule: () => '/data-quality/dmf/schedule',
    /** POST /data-quality/dmf/thresholds — persist a DMF threshold rule */
    dmfThresholds: () => '/data-quality/dmf/thresholds',
    /** POST /data-quality/anomaly-detection — trigger ML anomaly detection */
    anomalyDetection: () => '/data-quality/anomaly-detection',
    /** GET /data-quality/dmf/breaches — server-side threshold-aware breach list */
    dmfBreaches: () => '/data-quality/dmf/breaches',
    /** GET /data-quality/dmf/catalog — full inventory (tables × metrics × breaches) */
    dmfCatalog: () => '/data-quality/dmf/catalog',
    /** GET /data-quality/trust-center/recommendations */
    trustCenterRecommendations: () => '/data-quality/trust-center/recommendations',
    /** POST /data-quality/trust-center/enable — opt a table into trust scoring */
    trustCenterEnable: () => '/data-quality/trust-center/enable',
    /** GET /data-quality/trust-center/report */
    trustCenterReport: () => '/data-quality/trust-center/report',
    /** POST /data-quality/projects/{project_id}/dmf-check — run a built-in DMF check on a table. */
    projectDmfCheck: (projectId: string) => `/data-quality/projects/${enc(projectId)}/dmf-check`,
    /** GET /data-quality/projects/{project_id}/dmf-results — DMF evaluation results for a project. */
    projectDmfResults: (projectId: string) => `/data-quality/projects/${enc(projectId)}/dmf-results`,
    /** GET /data-quality/projects/{project_id}/dmf-suggest — DMF suggestions for a project's tables. */
    projectDmfSuggest: (projectId: string) => `/data-quality/projects/${enc(projectId)}/dmf-suggest`,
  },

  /** Catalog — backend: /catalog/* (modules/catalog/router.py). */
  catalog: {
    /** GET /catalog/overview — account-level catalog summary + recent events. */
    overview: () => '/catalog/overview',
    /** GET /catalog/sources — list of connected source databases/types. */
    sources: () => '/catalog/sources',
    /** GET /catalog/objects/{id}/360 */
    object360: (id: string) => `/catalog/objects/${enc(id)}/360`,
    /** GET /catalog/objects/{id}/scores */
    objectScores: (id: string) => `/catalog/objects/${enc(id)}/scores`,
    /** POST /catalog/objects/{id}/scores/recompute */
    recomputeScores: (id: string) => `/catalog/objects/${enc(id)}/scores/recompute`,
    /** GET /catalog/objects/{fqn}/history — {fqn} contains dots/slashes, not URL-encoded. */
    objectHistory: (fqn: string) => `/catalog/objects/${fqn}/history`,
    /** GET /catalog/products */
    products: () => '/catalog/products',
    /** GET /catalog/products/{id}/overview */
    productOverview: (id: string) => `/catalog/products/${enc(id)}/overview`,
    /** GET /catalog/products/{id}/lineage */
    productLineage: (id: string) => `/catalog/products/${enc(id)}/lineage`,
    /** GET /catalog/products/{id}/assets */
    productAssets: (id: string) => `/catalog/products/${enc(id)}/assets`,
    /** GET /catalog/products/{id}/kpis */
    productKpis: (id: string) => `/catalog/products/${enc(id)}/kpis`,
    /** POST /catalog/products/{id}/recommend-model */
    recommendProductModel: (id: string) => `/catalog/products/${enc(id)}/recommend-model`,
    /** POST /catalog/products/{id}/generate-kpis */
    generateProductKpis: (id: string) => `/catalog/products/${enc(id)}/generate-kpis`,
    /** POST /catalog/products/{id}/publish */
    publishProduct: (id: string) => `/catalog/products/${enc(id)}/publish`,
    /** GET /catalog/kpis */
    kpis: () => '/catalog/kpis',
    /** GET /catalog/kpis/{id} */
    kpi: (id: string) => `/catalog/kpis/${enc(id)}`,
    /** POST /catalog/kpis/{id}/validate */
    validateKpi: (id: string) => `/catalog/kpis/${enc(id)}/validate`,
    /** GET /catalog/recommendations[?params] */
    recommendations: () => '/catalog/recommendations',
    /** POST /catalog/recommendations/{id}/apply */
    applyRecommendation: (id: string) => `/catalog/recommendations/${enc(id)}/apply`,
    /** POST /catalog/refresh — start a catalog refresh run (body: { scope_type, scope_value }). */
    refreshStart: () => '/catalog/refresh',
    /** GET /catalog/refresh/{run_id} — poll a running refresh. */
    refreshStatus: (runId: string) => `/catalog/refresh/${enc(runId)}`,
    events: () => '/catalog/events',
    /** GET /catalog/tables/{db}/{schema}/{table}/context */
    tableContext: (db: string, s: string, t: string) =>
      `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/context`,
    /** GET /catalog/tables/{db}/{schema}/{table}/governance */
    tableGovernance: (db: string, s: string, t: string) =>
      `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/governance`,
    /** GET /catalog/tables/{db}/{schema}/{table}/lineage */
    tableLineage: (db: string, s: string, t: string) =>
      `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/lineage`,
    /** GET /catalog/tables/{db}/{schema}/{table}/ingestion */
    tableIngestion: (db: string, s: string, t: string) =>
      `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/ingestion`,
    /** GET /catalog/tables/{db}/{schema}/{table}/ownership */
    tableOwnership: (db: string, s: string, t: string) =>
      `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/ownership`,
    /** GET /catalog/profile/{db}/{schema}/{table} */
    tableProfile: (db: string, s: string, t: string) =>
      `/catalog/profile/${enc(db)}/${enc(s)}/${enc(t)}`,
    /** @deprecated No backend route (404 local+live, 2026-06-07) and no consumer — remove or implement before use. */
    viewDdl: (db: string, s: string, v: string) =>
      `/catalog/views/${enc(db)}/${enc(s)}/${enc(v)}/ddl`,
    /** GET /catalog/refresh?scope=<scope>[&db=<db>] — legacy query-param form kept for compat. */
    refresh: (scope: string, db?: string) =>
      `/catalog/refresh?scope=${scope}${db ? `&db=${enc(db)}` : ''}`,
    /** POST /catalog/tags/flow */
    applyFlowTags: () => '/catalog/tags/flow',
    /** POST /catalog/tables/notify-consumers */
    notifyConsumers: () => '/catalog/tables/notify-consumers',
    /** GET /catalog/scores — global catalog trust/quality averages ({ averages: { trust_avg } }) */
    scores: () => '/catalog/scores',
    /** @deprecated No backend route (404 local+live, 2026-06-07) and no consumer — remove or implement before use. */
    detectedModels: (projectId?: string) =>
      `/sources/detected-models${projectId ? `?project_id=${enc(projectId)}` : ''}`,
  },

  /**
   * Data catalog object explorer — backend: /api/snowflake/explorer/*.
   * Typed per-route entries; prefer these over the generic accountOverview.explorer().
   */
  snowflakeExplorer: {
    /** GET /api/snowflake/explorer/summary — account-level KPI strip. */
    summary: () => '/api/snowflake/explorer/summary',
    /** GET /api/snowflake/explorer/databases[?page_size] */
    databases: () => '/api/snowflake/explorer/databases',
    /** GET /api/snowflake/explorer/schemas[?database&page_size] */
    schemas: () => '/api/snowflake/explorer/schemas',
    /** GET /api/snowflake/explorer/objects[?database&schema&page_size&…] */
    objects: () => '/api/snowflake/explorer/objects',
    /** GET /api/snowflake/explorer/facets[?database&schema] */
    facets: () => '/api/snowflake/explorer/facets',
    /** GET /api/snowflake/explorer/objects/{id} — identity + metadata. */
    object: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}`,
    /** GET /api/snowflake/explorer/objects/{id}/lineage */
    objectLineage: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/lineage`,
    /** GET /api/snowflake/explorer/objects/{id}/actions */
    objectActions: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/actions`,
    /** GET /api/snowflake/explorer/objects/{id}/columns */
    objectColumns: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/columns`,
    /** GET /api/snowflake/explorer/objects/{id}/governance */
    objectGovernance: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/governance`,
    /** GET /api/snowflake/explorer/objects/{id}/usage[?period&group_by] */
    objectUsage: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/usage`,
    /** GET /api/snowflake/explorer/objects/{id}/audit */
    objectAudit: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/audit`,
    /** GET /api/snowflake/explorer/objects/{id}/ddl */
    objectDdl: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/ddl`,
    /** GET /api/snowflake/explorer/objects/{id}/health */
    objectHealth: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/health`,
    /** GET /api/snowflake/explorer/objects/{id}/quality */
    objectQuality: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/quality`,
    /** GET /api/snowflake/explorer/objects/{id}/timeline[?limit] */
    objectTimeline: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/timeline`,
    /** GET /api/snowflake/explorer/objects/{id}/open-in-snowflake */
    objectOpenInSnowflake: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/open-in-snowflake`,
    /** GET /api/snowflake/explorer/objects/{id}/impact */
    objectImpact: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/impact`,
    /** GET /api/snowflake/explorer/objects/{id}/deep-dive */
    objectDeepDive: (id: string) => `/api/snowflake/explorer/objects/${enc(id)}/deep-dive`,
  },

  /** Account-overview Snowflake explorer — generic fallback (prefer snowflakeExplorer.*). */
  accountOverview: {
    explorer: (path: string) => `/api/snowflake/explorer/${path.replace(/^\//, '')}`,
  },

  /** Deployment tracking — backend: /deployments/* (modules/deployment_tracking). */
  deployments: {
    base: () => '/deployments',
  },

  /** Platform API — backend: /api/* (keep-rule endpoints). */
  platform: {
    path: (p: string) => `/api/${p.replace(/^\//, '')}`,

    /**
     * Page/role grants — backend: /api/platform/grants/* (validated, live).
     * These are FE path constants for the existing super-admin-gated grant
     * surface; they add NO backend routes. Reads use `/grants` (fresh after a
     * revoke); avoid `/grants/role/{role}` for post-mutation refresh (stale).
     */
    grants: {
      /** GET /api/platform/grants?role=&page=&module=  → { items, count }. */
      list: (opts?: { role?: string; page?: string; module?: string }) =>
        `/api/platform/grants${qs({ role: opts?.role, page: opts?.page, module: opts?.module })}`,
      /** GET /api/platform/grants/role/{role}  (can serve STALE data post-revoke). */
      byRole: (role: string) => `/api/platform/grants/role/${enc(role)}`,
      /** POST /api/platform/grants {role,page,module,tab?} — grant a role a page.
       *  DELETE /api/platform/grants {role,module,page?,tab?} — revoke. */
      base: () => '/api/platform/grants',
      /** GET /api/platform/grants/users?username= ; POST/DELETE {username,role}. */
      users: (username?: string) => `/api/platform/grants/users${qs({ username })}`,
      /** POST /api/platform/grants/actions {role,action_key,module,page,can_execute}. */
      actions: () => '/api/platform/grants/actions',
      /** POST /api/platform/grants/policies {role,policy_type,can:{read},policy_name?}. */
      policies: () => '/api/platform/grants/policies',
    },
  },

  /**
   * Access Requests — backend: /access-requests/* (modules/access_requests/router.py).
   * Badge-based data-access request flow: any authenticated user may submit;
   * owners and admins approve/deny via the inbox.
   */
  accessRequests: {
    /** POST /access-requests — submit a new access request.
     *  body: { asset_fqn, asset_type ('TABLE'|'VIEW'|'DATA_PRODUCT'), privilege ('SELECT'|'REFERENCES'), reason? } */
    create: () => '/access-requests',
    /** GET /access-requests/mine — requests submitted by the caller. */
    mine: () => '/access-requests/mine',
    /** GET /access-requests/inbox — requests awaiting the caller's approval; admins see all pending. */
    inbox: () => '/access-requests/inbox',
    /** GET /access-requests/all — full audit log (account-admin only). */
    all: () => '/access-requests/all',
    /** POST /access-requests/{id}/approve — approve a pending request. body: { note? } */
    approve: (id: string) => `/access-requests/${enc(id)}/approve`,
    /** POST /access-requests/{id}/deny — deny a pending request. body: { note? } */
    deny: (id: string) => `/access-requests/${enc(id)}/deny`,
  },

  /**
   * Administration — platform admin surfaces under /administration/*.
   * `performance.*` is the per-account, multi-axis Performance page contract
   * (backend built in parallel; FE degrades quietly on 404 — "not deployed yet").
   * All paths are scoped per account: /administration/performance/{account}/...
   */
  administration: {
    performance: {
      /** GET /administration/performance/{account}/overview?hours= — KPI block. */
      overview: (account: string, hours?: number) =>
        `/administration/performance/${enc(account)}/overview${qs({ hours })}`,
      /** GET /administration/performance/{account}/by-endpoint?hours=&limit= */
      byEndpoint: (account: string, opts?: { hours?: number; limit?: number }) =>
        `/administration/performance/${enc(account)}/by-endpoint${qs({ hours: opts?.hours, limit: opts?.limit })}`,
      /** GET /administration/performance/{account}/by-user?hours=&limit= */
      byUser: (account: string, opts?: { hours?: number; limit?: number }) =>
        `/administration/performance/${enc(account)}/by-user${qs({ hours: opts?.hours, limit: opts?.limit })}`,
      /** GET /administration/performance/{account}/by-cache?axis=page|tab|module|project&hours= */
      byCache: (account: string, axis: 'page' | 'tab' | 'module' | 'project', hours?: number) =>
        `/administration/performance/${enc(account)}/by-cache${qs({ axis, hours })}`,
      /** GET /administration/performance/{account}/by-module?hours= */
      byModule: (account: string, hours?: number) =>
        `/administration/performance/${enc(account)}/by-module${qs({ hours })}`,
      /** GET /administration/performance/{account}/errors?hours=&limit= */
      errors: (account: string, opts?: { hours?: number; limit?: number }) =>
        `/administration/performance/${enc(account)}/errors${qs({ hours: opts?.hours, limit: opts?.limit })}`,
      /** GET /administration/performance/{account}/user/{username}?hours= — user drill-down. */
      userDetail: (account: string, username: string, hours?: number) =>
        `/administration/performance/${enc(account)}/user/${enc(username)}${qs({ hours })}`,
    },
    /**
     * GET /administration/platform-health?hours=&user=&module=&limit= — audit-backed
     * platform health (reads usage telemetry on the caller's own connection, so it
     * works locally and in prod with no service account). KPIs + granular tables.
     */
    platformHealth: (opts?: { hours?: number; user?: string; module?: string; limit?: number }) =>
      `/administration/platform-health${qs({ hours: opts?.hours, user: opts?.user, module: opts?.module, limit: opts?.limit })}`,
  },

  /**
   * Standalone cache-service router (`/cache/*`) — SVC-first cache observability
   * & control (distinct from `admin.cache` = `/admin/cache/*`). Read endpoints
   * feed FinOps/cost monitoring; control endpoints (clear/warmup/refresh) are
   * admin-gated. Reintegration batch W6 (was unwired). [trace: app/modules/cache]
   */
  cacheService: {
    svcHealth:       () => '/cache/svc-health',
    stats:           () => '/cache/stats',
    testConnection:  () => '/cache/test-connection',
    clearPattern:    () => '/cache/clear/pattern',
    clearAll:        () => '/cache/clear/all',
    keys:            () => '/cache/keys',
    keyValue:        (key: string) => `/cache/keys/${enc(key)}`,
    warmup:          () => '/cache/warmup',
    health:          () => '/cache/health',
    performance:     () => '/cache/performance',
    refreshStatus:   () => '/cache/refresh/status',
    refreshStart:    () => '/cache/refresh/start',
    refreshStop:     () => '/cache/refresh/stop',
    refreshTrigger:  (job: string) => `/cache/refresh/trigger/${enc(job)}`,
    warmupTrigger:   () => '/cache/warmup/trigger',
    dashboard:       () => '/cache/dashboard',
    breakdown:       () => '/cache/breakdown',
    invalidations:   () => '/cache/invalidations',
  },
} as const;

/** Build an absolute URL from a relative API path (for fetch()/axios callers). */
export function apiUrl(relativePath: string): string {
  return `${API_CONFIG.BASE_URL}${relativePath}`;
}

/**
 * API Contract definitions matching backend flow_contracts.yaml
 */
export const API_CONTRACTS = {
  auth: {
    register: {
      method: 'POST' as const,
      path: '/user/register/',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/register/`,
    },
    login: {
      method: 'POST' as const,
      path: '/user/login/',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/login/`,
    },
  },
  user: {
    getProfile: {
      method: 'GET' as const,
      path: '/user/profile',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/profile`,
    },
    updateProfile: {
      method: 'PUT' as const,
      path: '/user/profile',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/profile`,
    },
    changePassword: {
      method: 'POST' as const,
      path: '/user/profile/password',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/profile/password`,
    },
    getUserRoles: {
      method: 'GET' as const,
      path: '/user/profile/roles',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/profile/roles`,
    },
    changeUserRole: {
      method: 'POST' as const,
      path: '/user/profile/role',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/profile/role`,
    },
  },
  dashboard: {
    meModules: {
      method: 'GET' as const,
      path: '/user/me/modules',
      getUrl: () => `${API_CONFIG.BASE_URL}/user/me/modules`,
    },
    orgClientDashboard: {
      method: 'GET' as const,
      path: '/gouvernance/client/dashboard',
      getUrl: () => `${API_CONFIG.BASE_URL}/gouvernance/client/dashboard`,
    },
    orgAccountsOverview: {
      method: 'GET' as const,
      path: '/org-accounts/dashboard/overview',
      getUrl: () => `${API_CONFIG.BASE_URL}/org-accounts/dashboard/overview`,
    },
  },
  metadata: {
    initMetadata: {
      method: 'POST' as const,
      path: '/metadata/init_metadata',
      getUrl: () => `${API_CONFIG.BASE_URL}/metadata/init_metadata`,
    },
  },
  dataSource: {
    createInternalStage: {
      method: 'POST' as const,
      path: '/connect/stages/internal',
      getUrl: () => `${API_CONFIG.BASE_URL}/connect/stages/internal`,
    },
    uploadToStage: {
      method: 'POST' as const,
      path: '/connect/stages/{stage_name}/upload',
      getUrl: (stageName: string, overwrite?: boolean) => {
        const url = new URL(`${API_CONFIG.BASE_URL}/connect/stages/${stageName}/upload`);
        if (overwrite !== undefined) {
          url.searchParams.set('overwrite', String(overwrite));
        }
        return url.toString();
      },
    },
    uploadAndLoad: {
      method: 'POST' as const,
      path: '/connect/stages/{stage_name}/upload-and-load',
      getUrl: (
        stageName: string,
        params: {
          database_name: string;
          schema_name: string;
          table_name: string;
          create_table?: boolean;
          overwrite?: boolean;
        }
      ) => {
        const url = new URL(`${API_CONFIG.BASE_URL}/connect/stages/${stageName}/upload-and-load`);
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.set(key, String(value));
          }
        });
        return url.toString();
      },
    },
    listStages: {
      method: 'GET' as const,
      path: '/connect/stages',
      getUrl: () => `${API_CONFIG.BASE_URL}/connect/stages`,
    },
    listStageFiles: {
      method: 'GET' as const,
      path: '/connect/stages/{stage_name}/files',
      getUrl: (stageName: string) => `${API_CONFIG.BASE_URL}/connect/stages/${stageName}/files`,
    },
  },
  exploreDesign: {
    /** Backend: POST /explore-design/projects (body: project_name, metadata?) */
    createProject: {
      method: 'POST' as const,
      path: '/explore-design/projects',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/projects`,
    },
    getProjects: {
      method: 'GET' as const,
      path: '/explore-design/projects',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/projects`,
    },
    createDeployment: {
      method: 'POST' as const,
      path: '/explore-design/deployments',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/deployments`,
    },
    /** Backend: GET /explore-design/projects/{projectId}/events */
    getProjectEvents: {
      method: 'GET' as const,
      path: '/explore-design/projects/{projectId}/events',
      getUrl: (projectId: string, params?: { status?: string; event_type?: string }) => {
        const url = new URL(`${API_CONFIG.BASE_URL}/explore-design/projects/${encodeURIComponent(projectId)}/events`);
        if (params?.status) url.searchParams.set('status', params.status);
        if (params?.event_type) url.searchParams.set('event_type', params.event_type);
        return url.toString();
      },
    },
    /** Backend: POST /explore-design/events (record one event) */
    recordEvent: {
      method: 'POST' as const,
      path: '/explore-design/events',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/events`,
    },
    /** Backend: POST /explore-design/add-event (batch record design events) */
    addEvent: {
      method: 'POST' as const,
      path: '/explore-design/add-event',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/add-event`,
    },
    /** Backend: POST /explore-design/validate-events */
    validateEvents: {
      method: 'POST' as const,
      path: '/explore-design/validate-events',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/validate-events`,
    },
    /** Backend: POST /explore-design/deployments/{id}/execute */
    executeDeployment: {
      method: 'POST' as const,
      path: '/explore-design/deployments/{id}/execute',
      getUrl: (deploymentId: string) => `${API_CONFIG.BASE_URL}/explore-design/deployments/${encodeURIComponent(deploymentId)}/execute`,
    },
  },
  /** New API v1 endpoints for unified project management + explore deploy */
  exploreDesignV1: {
    /** POST /explore-design — Create explore project */
    createExploreProject: {
      method: 'POST' as const,
      path: '/explore-design',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design`,
    },
    /** POST /explore-design/{projectId}/deploy — Quick deploy */
    quickDeploy: {
      method: 'POST' as const,
      path: '/explore-design/{projectId}/deploy',
      getUrl: (projectId: string, versionId: string) =>
        `${API_CONFIG.BASE_URL}/explore-design/${encodeURIComponent(projectId)}/deploy?version_id=${encodeURIComponent(versionId)}`,
    },
    /** POST /explore-design/{projectId}/deployments — Request deployment */
    requestDeployment: {
      method: 'POST' as const,
      path: '/explore-design/{projectId}/deployments',
      getUrl: (projectId: string) =>
        `${API_CONFIG.BASE_URL}/explore-design/${encodeURIComponent(projectId)}/deployments`,
    },
    /** GET /explore-design/{projectId}/deployments — List deployments */
    listDeployments: {
      method: 'GET' as const,
      path: '/explore-design/{projectId}/deployments',
      getUrl: (projectId: string) =>
        `${API_CONFIG.BASE_URL}/explore-design/${encodeURIComponent(projectId)}/deployments`,
    },
  },
  projectsV1: {
    /** POST /projects — Create project */
    createProject: {
      method: 'POST' as const,
      path: '/projects',
      getUrl: () => `${API_CONFIG.BASE_URL}/projects`,
    },
    /** GET /projects — List projects */
    listProjects: {
      method: 'GET' as const,
      path: '/projects',
      getUrl: () => `${API_CONFIG.BASE_URL}/projects`,
    },
    /** POST /projects/{projectId}/deployments — Request unified deployment */
    requestDeployment: {
      method: 'POST' as const,
      path: '/projects/{projectId}/deployments',
      getUrl: (projectId: string) =>
        `${API_CONFIG.BASE_URL}/projects/${encodeURIComponent(projectId)}/deployments`,
    },
  },
  mapping: {
    /** List projects: same as exploreDesign.getProjects (GET /explore-design/projects) for cross-module consistency. */
    getProjects: {
      method: 'GET' as const,
      path: '/explore-design/projects',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/projects`,
    },
  },
  workflow: {
    createWorkflow: {
      method: 'POST' as const,
      path: '/workflow',
      getUrl: () => `${API_CONFIG.BASE_URL}/workflow`,
    },
    getWorkflows: {
      method: 'GET' as const,
      path: '/workflow',
      getUrl: () => `${API_CONFIG.BASE_URL}/workflow`,
    },
    executeWorkflow: {
      method: 'POST' as const,
      path: '/workflow/{workflow_id}/execute',
      getUrl: (workflowId: string) =>
        `${API_CONFIG.BASE_URL}/workflow/${encodeURIComponent(workflowId)}/execute`,
    },
    scheduleDeployment: {
      method: 'POST' as const,
      path: '/workflow/{workflow_id}/deployments',
      getUrl: (workflowId: string) =>
        `${API_CONFIG.BASE_URL}/workflow/${encodeURIComponent(workflowId)}/deployments`,
    },
    /** Backend: POST /workflow */
    renameWorkflow: {
      method: 'POST' as const,
      path: '/workflow',
      getUrl: () => `${API_CONFIG.BASE_URL}/workflow`,
    },
  },
  /** @deprecated Both /bi/sales/* routes 404 local+live (2026-06-07) and have no consumer — legacy block, superseded by /bi-dashboard/*. */
  biRetail: {
    salesOverview: {
      method: 'GET' as const,
      path: '/bi/sales/overview',
      getUrl: (params?: { start_date?: string; end_date?: string; store_id?: string; region?: string }) => {
        const url = new URL(`${API_CONFIG.BASE_URL}/bi/sales/overview`);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
              url.searchParams.set(key, value);
            }
          });
        }
        return url.toString();
      },
    },
    salesDashboard: {
      method: 'GET' as const,
      path: '/bi/sales/dashboard',
      getUrl: (params?: { start_date?: string; end_date?: string }) => {
        const url = new URL(`${API_CONFIG.BASE_URL}/bi/sales/dashboard`);
        if (params) {
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
              url.searchParams.set(key, value);
            }
          });
        }
        return url.toString();
      },
    },
  },
} as const;

/**
 * Helper to get contract by capability ID (e.g., 'auth.login', 'workflow.create')
 */
export function getContractByCapability(capabilityId: string): { method: string; path: string; getUrl: (...args: any[]) => string } | null {
  const parts = capabilityId.split('.');
  if (parts.length < 2) return null;

  const [category, ...rest] = parts;
  const action = rest.join('.');

  const categoryMap: Record<string, any> = {
    auth: API_CONTRACTS.auth,
    dashboard: API_CONTRACTS.dashboard,
    metadata: API_CONTRACTS.metadata,
    datasource: API_CONTRACTS.dataSource,
    explore: API_CONTRACTS.exploreDesign,
    mapping: API_CONTRACTS.mapping,
    workflow: API_CONTRACTS.workflow,
    'bi.retail': API_CONTRACTS.biRetail,
  };

  const categoryContracts = categoryMap[category];
  if (!categoryContracts) return null;

  // Map action names
  const actionMap: Record<string, string> = {
    'register_account': 'register',
    'login': 'login',
    'user_modules': 'meModules',
    'org_client': 'orgClientDashboard',
    'org_accounts_overview': 'orgAccountsOverview',
    'init_all_ddls': 'initMetadata',
    'create_internal_stage': 'createInternalStage',
    'upload_files_to_stage': 'uploadToStage',
    'upload_and_load_raw_zone': 'uploadAndLoad',
    'create_project': 'createProject',
    'list_projects': 'getProjects',
    'create_deployment': 'createDeployment',
    'create': 'createWorkflow',
    'execute': 'executeWorkflow',
    'schedule_deployment': 'scheduleDeployment',
    'sales_overview': 'salesOverview',
    'sales_dashboard': 'salesDashboard',
  };

  const mappedAction = actionMap[action] || action;
  return categoryContracts[mappedAction] || null;
}
