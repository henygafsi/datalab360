/**
 * Module configuration for role-based access control
 * Supports hierarchical modules (modules + sub-modules)
 * Maps between module IDs (used in sidebar) and module names (used in API/grants)
 */

export interface SubModuleConfig {
  id: string;          // Unique identifier (can be "cortex", "cortex_chat", etc.)
  name: string;        // Display name shown in UI
  apiName: string;     // API name sent to backend (snake_case)
  description: string;
  href?: string;       // Optional: direct link to page
  parentModule?: string; // Optional: parent module apiName
}

export interface ModuleConfig {
  id: number;
  name: string;        // Display name (shown in UI)
  apiName: string;     // API name (sent to backend) - snake_case
  description: string;
  subModules?: SubModuleConfig[]; // Optional: nested sub-modules
  visible?: boolean;   // Whether to show in menu (default: true)
}

// Static list of ALL available modules matching carbonMenuItems
// IMPORTANT: apiName must match backend's valid module names exactly (case-sensitive)
export const MODULES: ModuleConfig[] = [
  { 
    id: 1, 
    name: 'Connect Data', 
    apiName: 'connect_datalake', 
    description: 'Data Source Connection',
    visible: true
  },
  { 
    id: 12, 
    name: 'Explore & Design', 
    apiName: 'explore_design', 
    description: 'Explore and design data models',
    visible: true
  },
  { 
    id: 3, 
    name: 'Workflow', 
    apiName: 'workflow', 
    description: 'Workflow management',
    visible: true
  },
  { 
    id: 6, 
    name: 'Governance', 
    apiName: 'gouvernance', 
    description: 'User, role, and policy management',
    visible: true
  },
  { 
    id: 4, 
    name: 'Business Reporting', 
    apiName: 'bi_reporting', 
    description: 'Business Intelligence reports',
    visible: true
  },
  { 
    id: 10, 
    name: 'AI Intelligence', 
    apiName: 'intelligent', 
    description: 'AI/ML & Cortex features',
    visible: true,
    subModules: [
      {
        id: 'cortex',
        name: 'Cortex AI',
        apiName: 'cortex',
        description: 'Cortex AI features',
        parentModule: 'intelligent'
      },
      {
        id: 'semantic_models',
        name: 'Semantic Models',
        apiName: 'semantic_models',
        description: 'YAML models for Cortex Analyst',
        parentModule: 'intelligent'
      },
      {
        id: 'cortex_chat',
        name: 'Data & Governance',
        apiName: 'cortex_chat',
        description: 'ETL blocks, governance policies & security matrix',
        parentModule: 'intelligent'
      }
    ]
  },
  { 
    id: 5, 
    name: 'Data Health', 
    apiName: 'data_quality', 
    description: 'Data quality and health reports',
    visible: true
  },
  {
    id: 11,
    name: 'Dashboard',
    apiName: 'dashboard',
    description: 'Dashboard overview',
    visible: true
  },
  {
    id: 13,
    name: 'Account Overview',
    apiName: 'account_overview',
    description: 'Account overview and home page',
    visible: true
  },
  {
    id: 14,
    name: 'Client Accounts',
    apiName: 'client_accounts',
    description: 'Monitor and manage client Snowflake accounts',
    visible: true
  },

  // Data Engineering & Developer Tools — merged into Explore & Design and Workflow

  // Hidden modules (not shown in menu but can be granted)
  // Mapping: the /mapping page now redirects to Explore & Design. Kept here
  // (visible: false) only so existing RBAC grants referencing it still resolve
  // (moduleIdToName / findModuleByApiName). It is intentionally absent from the
  // sidebar nav. The routes.ts `mapping.viewMap` key is likewise retained per
  // the _DROPPED.md convention (imported by shared template components).
  {
    id: 2,
    name: 'Mapping',
    apiName: 'mapping',
    description: 'View and manage mappings',
    visible: false
  },
  { 
    id: 7, 
    name: "KPI's Store", 
    apiName: 'kpis_store', 
    description: 'KPI Store',
    visible: false
  },
  { 
    id: 8, 
    name: 'DaRquest / DAC', 
    apiName: 'darequest', 
    description: 'Data requests',
    visible: false
  },
  { 
    id: 9, 
    name: 'Observability', 
    apiName: 'observability',
    description: 'System monitoring & cross-module lineage',
    visible: true
  },
];

// Create lookup maps for fast access
const moduleByName = new Map(MODULES.map((m) => [m.name.toLowerCase(), m]));
const moduleById = new Map(MODULES.map((m) => [m.id, m]));
const moduleByApiName = new Map(MODULES.map((m) => [m.apiName, m]));

// Create sub-module lookup map
const subModuleByApiName = new Map<string, SubModuleConfig>();
MODULES.forEach(module => {
  module.subModules?.forEach(subModule => {
    subModuleByApiName.set(subModule.apiName, subModule);
  });
});

/**
 * Get only visible modules (for menu display)
 */
export function getVisibleModules(): ModuleConfig[] {
  return MODULES.filter(m => m.visible !== false);
}

/**
 * Get all modules (including hidden ones)
 */
export function getAllModules(): ModuleConfig[] {
  return MODULES;
}

/**
 * Find module by API name (works for both modules and sub-modules)
 */
export function findModuleByApiName(apiName: string): ModuleConfig | SubModuleConfig | undefined {
  // First check main modules
  const mainModule = moduleByApiName.get(apiName);
  if (mainModule) return mainModule;
  
  // Then check sub-modules
  return subModuleByApiName.get(apiName);
}

/**
 * Get parent module for a sub-module
 */
export function getParentModule(subModuleApiName: string): ModuleConfig | undefined {
  const subModule = subModuleByApiName.get(subModuleApiName);
  if (!subModule || !subModule.parentModule) return undefined;
  
  return moduleByApiName.get(subModule.parentModule);
}

/**
 * Expand module list to include sub-modules
 * Used for grants management - if user has "intelligent", they also get "cortex", "semantic_models", etc.
 */
export function expandModulesToIncludeSubModules(moduleApiNames: string[]): string[] {
  const expanded = new Set<string>(moduleApiNames);
  
  moduleApiNames.forEach(apiName => {
    const mod = moduleByApiName.get(apiName);
    if (mod?.subModules) {
      mod.subModules.forEach(sub => {
        expanded.add(sub.apiName);
      });
    }
  });
  
  return Array.from(expanded);
}

/**
 * Collapse sub-modules to parent modules
 * Used for saving grants - convert ["cortex", "semantic_models"] to ["intelligent"]
 */
export function collapseSubModulesToParents(moduleApiNames: string[]): string[] {
  const result = new Set<string>();

  console.log('[Modules] Collapsing:', moduleApiNames);

  moduleApiNames.forEach(apiName => {
    const subModule = subModuleByApiName.get(apiName);
    if (subModule && subModule.parentModule) {
      // This is a sub-module, add the parent instead
      console.log(`[Modules] ${apiName} is a sub-module of ${subModule.parentModule}`);
      result.add(subModule.parentModule);
    } else {
      // This is a main module, add it
      console.log(`[Modules] ${apiName} is a main module`);
      result.add(apiName);
    }
  });

  const collapsed = Array.from(result);
  console.log('[Modules] Collapsed result:', collapsed);
  return collapsed;
}

/**
 * Get display name for any module or sub-module
 */
export function getModuleDisplayName(apiName: string): string {
  const item = findModuleByApiName(apiName);
  return item?.name || apiName;
}

/**
 * Convert module name to ID
 */
export function moduleNameToId(name: string): number | undefined {
  return moduleByName.get(name.toLowerCase())?.id;
}

/**
 * Convert module ID to name
 */
export function moduleIdToName(id: number): string | undefined {
  return moduleById.get(id)?.name;
}

/**
 * Convert an array of module names to IDs
 */
export function moduleNamesToIds(names: string[]): number[] {
  return names
    .map((name) => moduleNameToId(name))
    .filter((id): id is number => id !== undefined);
}

/**
 * Convert an array of module IDs to names
 */
export function moduleIdsToNames(ids: number[]): string[] {
  return ids
    .map((id) => moduleIdToName(id))
    .filter((name): name is string => name !== undefined);
}

/**
 * Get all module IDs
 */
export function getAllModuleIds(): number[] {
  return MODULES.map((m) => m.id);
}

/**
 * Get all module names
 */
export function getAllModuleNames(): string[] {
  return MODULES.map((m) => m.name);
}

/**
 * Get all API names (including sub-modules)
 */
export function getAllApiNames(): string[] {
  const names: string[] = [];
  
  MODULES.forEach(module => {
    names.push(module.apiName);
    module.subModules?.forEach(sub => {
      names.push(sub.apiName);
    });
  });
  
  return names;
}

/**
 * Normalize session items to IDs
 * Handles both numeric IDs and string names
 */
export function normalizeToIds(items: (string | number)[]): number[] {
  return items
    .map((item) => {
      if (typeof item === 'number') {
        return item;
      }
      // Try to parse as number first
      const parsed = parseInt(item, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
      // Try to convert name to ID
      return moduleNameToId(item);
    })
    .filter((id): id is number => id !== undefined);
}
