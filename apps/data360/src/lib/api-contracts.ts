/** Centralized API endpoints (backend contract). Data journey: services call getUrl() → backend path. */
// ////dependency//// lib → config.database.config only
import { API_CONFIG } from '@/config/database.config';

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
