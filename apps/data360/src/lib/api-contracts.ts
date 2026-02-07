/**
 * API Contracts Configuration
 * 
 * Centralized API endpoint definitions based on backend flow_contracts.yaml
 * This ensures frontend services align with backend contracts.
 */

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
        const url = new URL(`${API_CONFIG.BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/upload`);
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
        const url = new URL(`${API_CONFIG.BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/upload-and-load`);
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
      getUrl: (stageName: string) => `${API_CONFIG.BASE_URL}/connect/stages/${encodeURIComponent(stageName)}/files`,
    },
  },
  exploreDesign: {
    createProject: {
      method: 'POST' as const,
      path: '/explore-design/create_project',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/create_project`,
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
  },
  mapping: {
    getProjects: {
      method: 'POST' as const,
      path: '/explore-design/guided/get_projects',
      getUrl: () => `${API_CONFIG.BASE_URL}/explore-design/guided/get_projects`,
    },
  },
  workflow: {
    createWorkflow: {
      method: 'POST' as const,
      path: '/workflow/create_workflow/',
      getUrl: () => `${API_CONFIG.BASE_URL}/workflow/create_workflow/`,
    },
    getWorkflows: {
      method: 'GET' as const,
      path: '/workflow/get_workflows/',
      getUrl: () => `${API_CONFIG.BASE_URL}/workflow/get_workflows/`,
    },
    executeWorkflow: {
      method: 'POST' as const,
      path: '/workflow/execute_workflow/',
      getUrl: (workflowName: string) => {
        const url = new URL(`${API_CONFIG.BASE_URL}/workflow/execute_workflow/`);
        url.searchParams.set('workflow_name', workflowName);
        return url.toString();
      },
    },
    scheduleDeployment: {
      method: 'POST' as const,
      path: '/workflow/deployments/schedule',
      getUrl: () => `${API_CONFIG.BASE_URL}/workflow/deployments/schedule`,
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
