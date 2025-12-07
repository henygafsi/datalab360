/**
 * Module configuration for role-based access control
 * This maps between module IDs (used in sidebar) and module names (used in API/grants)
 */

export interface ModuleConfig {
  id: number;
  name: string;
  description: string;
}

// Static list of ALL available modules matching carbonMenuItems
export const MODULES: ModuleConfig[] = [
  { id: 1, name: 'Connexion', description: 'Data Source Connection' },
  { id: 2, name: 'Mapping', description: 'View and manage mappings' },
  { id: 3, name: 'Workflow', description: 'Workflow management' },
  { id: 4, name: 'BI Reporting', description: 'Business Intelligence reports' },
  { id: 5, name: 'Data Quality', description: 'Data quality reports' },
  { id: 6, name: 'Gouvernance', description: 'User, role, and policy management' },
  { id: 7, name: "KPI's Store", description: 'KPI Store' },
  { id: 8, name: 'DaRquest / DAC', description: 'Data requests' },
  { id: 9, name: 'Observability', description: 'System monitoring' },
  { id: 10, name: 'Intelligent', description: 'AI/ML & Cortex features' },
];

// Create lookup maps for fast access
const moduleByName = new Map(MODULES.map((m) => [m.name.toLowerCase(), m]));
const moduleById = new Map(MODULES.map((m) => [m.id, m]));

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
