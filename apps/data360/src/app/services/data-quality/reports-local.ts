/**
 * Local Storage Data Quality Report Service
 * Saves data quality reports to browser localStorage
 * Can be upgraded to backend API when ready
 */

export interface QualityMetric {
  id: string;
  name: string;
  value: number;
  threshold?: number;
  status: 'pass' | 'warning' | 'fail';
  category: 'completeness' | 'accuracy' | 'consistency' | 'timeliness' | 'validity';
}

export interface DataSource {
  id: string;
  name: string;
  type: 'database' | 'file' | 'api' | 'stream';
  connectionStatus: 'connected' | 'disconnected' | 'error';
}

export interface QualityReportItem {
  id: string;
  type: 'chart' | 'metric' | 'table';
  componentId: string;
  position: number;
  config?: any;
  w?: number;
  h?: number;
  hUnits?: number;
  fontScale?: number;
}

export interface QualityReport {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: QualityReportItem[];
  dataSources: DataSource[];
  metrics: QualityMetric[];
  schedule?: {
    enabled: boolean;
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
    nextRun?: string;
  };
  sharedWith?: string[];
  isPublic: boolean;
  tags?: string[];
}

export interface CreateQualityReportInput {
  name: string;
  description?: string;
  items: QualityReportItem[];
  dataSources?: DataSource[];
  metrics?: QualityMetric[];
  isPublic?: boolean;
  tags?: string[];
}

const STORAGE_KEY = 'data360_quality_reports';
const CURRENT_USER_KEY = 'data360_current_user';

/**
 * Get all quality reports from localStorage
 */
const getAllReports = (): QualityReport[] => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as QualityReport[]) : [];
  } catch (error) {
    console.error('Failed to load quality reports from localStorage:', error);
    return [];
  }
};

/**
 * Save all quality reports to localStorage
 */
const saveAllReports = (reports: QualityReport[]): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch (error) {
    console.error('Failed to save quality reports to localStorage:', error);
    throw new Error('Failed to save report. Storage quota may be exceeded.');
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
  return `quality_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create a new quality report
 */
export const createQualityReport = async (
  report: CreateQualityReportInput,
  token?: string
): Promise<QualityReport> => {
  return new Promise((resolve, reject) => {
    try {
      const reports = getAllReports();

      const newReport: QualityReport = {
        id: generateId(),
        name: report.name,
        description: report.description,
        createdBy: getCurrentUser(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: report.items,
        dataSources: report.dataSources || [],
        metrics: report.metrics || [],
        sharedWith: [],
        isPublic: report.isPublic || false,
        tags: report.tags || [],
      };

      reports.push(newReport);
      saveAllReports(reports);

      resolve(newReport);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to create quality report'));
    }
  });
};

/**
 * Get all quality reports for the current user
 */
export const getQualityReports = async (token?: string): Promise<QualityReport[]> => {
  return new Promise((resolve) => {
    try {
      const reports = getAllReports();
      const currentUser = getCurrentUser();

      // Filter to show user's own reports + public reports + shared with user
      const filtered = reports.filter(
        (r) =>
          r.createdBy === currentUser ||
          r.isPublic ||
          r.sharedWith?.includes(currentUser)
      );

      resolve(filtered);
    } catch (error) {
      console.error('Failed to get quality reports:', error);
      resolve([]);
    }
  });
};

/**
 * Get a single quality report by ID
 */
export const getQualityReport = async (
  id: string,
  token?: string
): Promise<QualityReport> => {
  return new Promise((resolve, reject) => {
    try {
      const reports = getAllReports();
      const report = reports.find((r) => r.id === id);

      if (!report) {
        reject(new Error('Quality report not found'));
        return;
      }

      resolve(report);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to fetch quality report'));
    }
  });
};

/**
 * Update an existing quality report
 */
export const updateQualityReport = async (
  id: string,
  updates: Partial<CreateQualityReportInput>,
  token?: string
): Promise<QualityReport> => {
  return new Promise((resolve, reject) => {
    try {
      const reports = getAllReports();
      const index = reports.findIndex((r) => r.id === id);

      if (index === -1) {
        reject(new Error('Quality report not found'));
        return;
      }

      const currentUser = getCurrentUser();
      if (reports[index].createdBy !== currentUser) {
        reject(new Error('You do not have permission to update this report'));
        return;
      }

      const updatedReport: QualityReport = {
        ...reports[index],
        ...updates,
        id, // Keep original ID
        createdBy: reports[index].createdBy, // Keep original creator
        createdAt: reports[index].createdAt, // Keep original creation date
        updatedAt: new Date().toISOString(),
      };

      reports[index] = updatedReport;
      saveAllReports(reports);

      resolve(updatedReport);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to update quality report'));
    }
  });
};

/**
 * Delete a quality report
 */
export const deleteQualityReport = async (
  id: string,
  token?: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const reports = getAllReports();
      const index = reports.findIndex((r) => r.id === id);

      if (index === -1) {
        reject(new Error('Quality report not found'));
        return;
      }

      const currentUser = getCurrentUser();
      if (reports[index].createdBy !== currentUser) {
        reject(new Error('You do not have permission to delete this report'));
        return;
      }

      reports.splice(index, 1);
      saveAllReports(reports);

      resolve();
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to delete quality report'));
    }
  });
};

/**
 * Duplicate a quality report
 */
export const duplicateQualityReport = async (
  id: string,
  token?: string
): Promise<QualityReport> => {
  return new Promise((resolve, reject) => {
    try {
      const reports = getAllReports();
      const original = reports.find((r) => r.id === id);

      if (!original) {
        reject(new Error('Quality report not found'));
        return;
      }

      const duplicate: QualityReport = {
        ...original,
        id: generateId(),
        name: `${original.name} (Copy)`,
        createdBy: getCurrentUser(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sharedWith: [],
      };

      reports.push(duplicate);
      saveAllReports(reports);

      resolve(duplicate);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to duplicate quality report'));
    }
  });
};

/**
 * Export quality report as JSON
 */
export const exportQualityReport = async (
  id: string,
  token?: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const reports = getAllReports();
      const report = reports.find((r) => r.id === id);

      if (!report) {
        reject(new Error('Quality report not found'));
        return;
      }

      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        report,
      };

      resolve(JSON.stringify(exportData, null, 2));
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to export quality report'));
    }
  });
};

/**
 * Import quality report from JSON
 */
export const importQualityReport = async (
  jsonData: string,
  token?: string
): Promise<QualityReport> => {
  return new Promise((resolve, reject) => {
    try {
      const parsed: any = JSON.parse(jsonData);

      if (!parsed.report) {
        reject(new Error('Invalid quality report export format'));
        return;
      }

      const reports = getAllReports();

      const imported: QualityReport = {
        ...parsed.report,
        id: generateId(),
        createdBy: getCurrentUser(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        name: `${parsed.report.name} (Imported)`,
      };

      reports.push(imported);
      saveAllReports(reports);

      resolve(imported);
    } catch (error: any) {
      reject(new Error(error.message || 'Failed to import quality report'));
    }
  });
};

/**
 * Clear all quality reports (use with caution!)
 */
export const clearAllQualityReports = (): void => {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear quality reports:', error);
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
    const reports = getAllReports();
    const dataSize = JSON.stringify(reports).length;
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

const API_BASE = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : '';

function mapCheckToMetric(check: Record<string, unknown>, index: number): QualityMetric {
  const checkType = (check.check_type as string) || 'custom';
  const status = (check.status as string)?.toLowerCase() === 'pass' ? 'pass' : (check.status as string)?.toLowerCase() === 'fail' ? 'fail' : 'warning';
  let value = 0;
  let threshold: number | undefined;
  if (checkType === 'COMPLETENESS' && typeof check.completeness_pct === 'number') {
    value = check.completeness_pct;
    threshold = (check.threshold as number) ?? 95;
  } else if (checkType === 'ROW_COUNT') {
    value = typeof check.row_count === 'number' ? Math.min(100, check.row_count) : 0;
    threshold = 1;
  } else if (checkType === 'FRESHNESS') {
    const maxAge = (check.max_age_hours_threshold as number) ?? 24;
    const age = (check.age_hours as number) ?? 0;
    value = age <= maxAge ? 100 : Math.max(0, 100 - (age - maxAge));
    threshold = 100;
  } else {
    value = status === 'pass' ? 100 : 0;
    threshold = 100;
  }
  const categoryMap: Record<string, QualityMetric['category']> = {
    COMPLETENESS: 'completeness',
    UNIQUENESS: 'consistency',
    FRESHNESS: 'timeliness',
    SCHEMA_VALIDATION: 'validity',
    ROW_COUNT: 'completeness',
    CUSTOM_RULE: 'validity',
  };
  return {
    id: `dq_${index}_${checkType}`,
    name: (check.column as string) ? `${checkType}: ${check.column}` : checkType.replace(/_/g, ' '),
    value: Math.round(value * 10) / 10,
    threshold,
    status: status as 'pass' | 'warning' | 'fail',
    category: categoryMap[checkType] ?? 'validity',
  };
}

export interface RunQualityChecksOptions {
  table?: string;
  completeness_checks?: string[];
  uniqueness_checks?: string[];
}

/**
 * Run quality checks via backend (real data). No mock.
 * If no table is provided, uses the report's first data source name as qualified table.
 */
export const runQualityChecks = async (
  reportId: string,
  token?: string,
  options?: RunQualityChecksOptions
): Promise<QualityMetric[]> => {
  const reports = getAllReports();
  const report = reports.find((r) => r.id === reportId);
  const table = options?.table ?? report?.dataSources?.[0]?.name;
  if (!table) return [];
  if (!token) throw new Error('Authentication required to run quality checks');
  const apiUrl = `${API_BASE}/data-quality/run-check`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      table,
      completeness_checks: options?.completeness_checks ?? null,
      uniqueness_checks: options?.uniqueness_checks ?? null,
      freshness_config: null,
      expected_schema: null,
      custom_rules: null,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Quality check failed: ${res.status}`);
  }
  const json = (await res.json()) as { data?: { checks?: Record<string, unknown>[] }; message?: string };
  const checks = json?.data?.checks ?? [];
  return checks.map((c, i) => mapCheckToMetric(c as Record<string, unknown>, i));
};
