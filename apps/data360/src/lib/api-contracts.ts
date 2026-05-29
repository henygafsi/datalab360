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
 * (app/modules/**/router*.py + app/main.py). Grouped by domain.
 *
 * NOTE: the legacy `API_CONTRACTS` object further down returns ABSOLUTE urls
 * via getUrl() and is kept for back-compat with a few fetch()/axios call-sites.
 * Prefer `API` + `apiClient` for new code.
 */
const enc = encodeURIComponent;

type ProjectTypeFilter = 'explore_design' | 'workflow' | 'bi_dashboard' | 'WORKFLOW';

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
      `/connect/stages/${enc(stage)}/files/${filePath}`,
    /** POST /connect/snowflake_lake/datalake/connect */
    datalakeConnect: () => '/connect/snowflake_lake/datalake/connect',
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
  },

  /** Gouvernance — backend: /gouvernance/* (modules/gouvernance + gui_permissions). */
  gouvernance: {
    clientDashboard: () => '/gouvernance/client/dashboard',
    users: () => '/gouvernance/users',
    usersWithRoles: () => '/gouvernance/users-with-roles',
    addUser: () => '/gouvernance/add-user',
    dropUser: () => '/gouvernance/drop-user',
    dropUsersBatch: () => '/gouvernance/drop-users-batch',
    enableUser: () => '/gouvernance/enable_user',
    disableUser: () => '/gouvernance/disable_user',
    roles: () => '/gouvernance/roles',
    addRole: () => '/gouvernance/add-role',
    dropRole: () => '/gouvernance/drop-role',
    dropRolesBatch: () => '/gouvernance/drop-roles-batch',
    assignRole: () => '/gouvernance/assign-role',
    unassignRole: () => '/gouvernance/unassign-role',
    userRoles: (username: string) => `/gouvernance/${enc(username)}/roles`,
    grants: () => '/gouvernance/grants',
    grantsForRole: () => '/gouvernance/grants-for-role',
    updateGrants: () => '/gouvernance/update-grants',
    securityMatrix: () => '/gouvernance/security-matrix',
    policies: () => '/gouvernance/policies',
  },

  /** Cortex (AI) — backend: /cortex/* (modules/cortex). */
  cortex: {
    query: () => '/cortex/query',
  },

  /** Observability — backend: /observability/* (mounted with prefix in main.py). */
  observability: {
    base: () => '/observability',
  },

  /** Org accounts — backend: /org-accounts/* (modules/org_accounts/router.py). */
  orgAccounts: {
    dashboardOverview: () => '/org-accounts/dashboard/overview',
    events: () => '/org-accounts/events',
  },

  /** Data quality — backend: /data-quality/* (modules/data_quality). */
  dataQuality: {
    base: () => '/data-quality',
  },

  /** Catalog — backend: /catalog/* (modules/catalog/router.py). */
  catalog: {
    events: () => '/catalog/events',
  },

  /** Account-overview Snowflake explorer — backend: /api/snowflake/explorer/*. */
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
