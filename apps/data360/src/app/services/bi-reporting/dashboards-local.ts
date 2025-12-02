/**
 * Local Storage Dashboard Service
 * Saves dashboards to browser localStorage instead of backend
 * Can be upgraded to backend API when ready
 */

export interface DashboardItem {
  id: string;
  type: 'chart';
  componentId: string;
  position: number;
  config?: any;
  w?: number;
  h?: number;
  hUnits?: number;
  fontScale?: number;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: DashboardItem[];
  sharedWith?: string[];
  isPublic: boolean;
  tags?: string[];
}

export interface CreateDashboardInput {
  name: string;
  description?: string;
  items: DashboardItem[];
  isPublic?: boolean;
  tags?: string[];
}

const STORAGE_KEY = 'data360_dashboards';
const CURRENT_USER_KEY = 'data360_current_user';

/**
 * Get all dashboards from localStorage
 */
const getAllDashboards = (): Dashboard[] => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load dashboards from localStorage:', error);
    return [];
  }
};

/**
 * Save all dashboards to localStorage
 */
const saveAllDashboards = (dashboards: Dashboard[]): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
  } catch (error) {
    console.error('Failed to save dashboards to localStorage:', error);
    throw new Error('Failed to save dashboard. Storage quota may be exceeded.');
  }
};

/**
 * Get current user's username
 */
const getCurrentUser = (): string => {
  if (typeof window === 'undefined') return 'anonymous';

  try {
    return localStorage.getItem(CURRENT_USER_KEY) || 'anonymous';
  } catch (error) {
    return 'anonymous';
  }
};

/**
 * Set current user's username
 */
export const setCurrentUser = (username: string): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CURRENT_USER_KEY, username);
  } catch (error) {
    console.error('Failed to set current user:', error);
  }
};

/**
 * Generate unique ID
 */
const generateId = (): string => {
  return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create a new dashboard
 */
export const createDashboard = async (
  dashboard: CreateDashboardInput,
  token?: string
): Promise<Dashboard> => {
  return new Promise((resolve, reject) => {
    try {
      const dashboards = getAllDashboards();

      const newDashboard: Dashboard = {
        id: generateId(),
        name: dashboard.name,
        description: dashboard.description,
        createdBy: getCurrentUser(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: dashboard.items,
        sharedWith: [],
        isPublic: dashboard.isPublic || false,
        tags: dashboard.tags || [],
      };

      dashboards.push(newDashboard);
      saveAllDashboards(dashboards);

      resolve(newDashboard);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to create dashboard'));
    }
  });
};

/**
 * Get all dashboards for the current user
 */
export const getDashboards = async (token?: string): Promise<Dashboard[]> => {
  return new Promise((resolve) => {
    try {
      const dashboards = getAllDashboards();
      const currentUser = getCurrentUser();

      // Filter to show user's own dashboards + public dashboards + shared with user
      const filtered = dashboards.filter(
        (d) =>
          d.createdBy === currentUser ||
          d.isPublic ||
          d.sharedWith?.includes(currentUser)
      );

      resolve(filtered);
    } catch (error) {
      console.error('Failed to get dashboards:', error);
      resolve([]);
    }
  });
};

/**
 * Get a single dashboard by ID
 */
export const getDashboard = async (
  id: string,
  token?: string
): Promise<Dashboard> => {
  return new Promise((resolve, reject) => {
    try {
      const dashboards = getAllDashboards();
      const dashboard = dashboards.find((d) => d.id === id);

      if (!dashboard) {
        reject(new Error('Dashboard not found'));
        return;
      }

      resolve(dashboard);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to fetch dashboard'));
    }
  });
};

/**
 * Update an existing dashboard
 */
export const updateDashboard = async (
  id: string,
  updates: Partial<CreateDashboardInput>,
  token?: string
): Promise<Dashboard> => {
  return new Promise((resolve, reject) => {
    try {
      const dashboards = getAllDashboards();
      const index = dashboards.findIndex((d) => d.id === id);

      if (index === -1) {
        reject(new Error('Dashboard not found'));
        return;
      }

      const currentUser = getCurrentUser();
      if (dashboards[index].createdBy !== currentUser) {
        reject(new Error('You do not have permission to update this dashboard'));
        return;
      }

      const updatedDashboard: Dashboard = {
        ...dashboards[index],
        ...updates,
        id, // Keep original ID
        createdBy: dashboards[index].createdBy, // Keep original creator
        createdAt: dashboards[index].createdAt, // Keep original creation date
        updatedAt: new Date().toISOString(),
      };

      dashboards[index] = updatedDashboard;
      saveAllDashboards(dashboards);

      resolve(updatedDashboard);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to update dashboard'));
    }
  });
};

/**
 * Delete a dashboard
 */
export const deleteDashboard = async (
  id: string,
  token?: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const dashboards = getAllDashboards();
      const index = dashboards.findIndex((d) => d.id === id);

      if (index === -1) {
        reject(new Error('Dashboard not found'));
        return;
      }

      const currentUser = getCurrentUser();
      if (dashboards[index].createdBy !== currentUser) {
        reject(new Error('You do not have permission to delete this dashboard'));
        return;
      }

      dashboards.splice(index, 1);
      saveAllDashboards(dashboards);

      resolve();
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to delete dashboard'));
    }
  });
};

/**
 * Duplicate a dashboard
 */
export const duplicateDashboard = async (
  id: string,
  token?: string
): Promise<Dashboard> => {
  return new Promise((resolve, reject) => {
    try {
      const dashboards = getAllDashboards();
      const original = dashboards.find((d) => d.id === id);

      if (!original) {
        reject(new Error('Dashboard not found'));
        return;
      }

      const duplicate: Dashboard = {
        ...original,
        id: generateId(),
        name: `${original.name} (Copy)`,
        createdBy: getCurrentUser(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sharedWith: [],
      };

      dashboards.push(duplicate);
      saveAllDashboards(dashboards);

      resolve(duplicate);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to duplicate dashboard'));
    }
  });
};

/**
 * Export dashboard as JSON
 */
export const exportDashboard = async (
  id: string,
  token?: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const dashboards = getAllDashboards();
      const dashboard = dashboards.find((d) => d.id === id);

      if (!dashboard) {
        reject(new Error('Dashboard not found'));
        return;
      }

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        dashboard,
      };

      resolve(JSON.stringify(exportData, null, 2));
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to export dashboard'));
    }
  });
};

/**
 * Import dashboard from JSON
 */
export const importDashboard = async (
  jsonData: string,
  token?: string
): Promise<Dashboard> => {
  return new Promise((resolve, reject) => {
    try {
      const parsed = JSON.parse(jsonData);

      if (!parsed.dashboard) {
        reject(new Error('Invalid dashboard export format'));
        return;
      }

      const dashboards = getAllDashboards();

      const imported: Dashboard = {
        ...parsed.dashboard,
        id: generateId(),
        createdBy: getCurrentUser(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: `${parsed.dashboard.name} (Imported)`,
      };

      dashboards.push(imported);
      saveAllDashboards(dashboards);

      resolve(imported);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to import dashboard'));
    }
  });
};

/**
 * Clear all dashboards (use with caution!)
 */
export const clearAllDashboards = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear dashboards:', error);
  }
};

/**
 * Get storage info
 */
export const getStorageInfo = (): { used: number; available: number; percentage: number } => {
  if (typeof window === 'undefined') {
    return { used: 0, available: 0, percentage: 0 };
  }

  try {
    const dashboards = getAllDashboards();
    const dataSize = JSON.stringify(dashboards).length;
    const maxSize = 5 * 1024 * 1024; // 5MB (typical localStorage limit)

    return {
      used: dataSize,
      available: maxSize - dataSize,
      percentage: (dataSize / maxSize) * 100,
    };
  } catch (error) {
    return { used: 0, available: 0, percentage: 0 };
  }
};
