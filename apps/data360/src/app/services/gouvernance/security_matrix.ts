/**
 * Gouvernance Service - Security Matrix (RLS)
 * Handles Row-Level Security matrix entries for role-based data access
 */
import apiClient from '@/lib/api-client';

/**
 * Security Matrix Entry Type
 */
export type SecurityMatrixEntry = {
  id?: number;
  role_name: string;
  region?: string;
  store?: string;
  department?: string;
  custom_filter?: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Available security axes (for dropdowns)
 */
export type SecurityAxes = {
  regions: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  customs: Array<{ id: string; name: string }>;
};

/**
 * Security Matrix Response (includes both entries and available axes)
 */
export type SecurityMatrixResponse = {
  entries: SecurityMatrixEntry[];
  available_axes: SecurityAxes;
};

/**
 * Initialize the security matrix schema with retail DDL + sample data
 * POST /gouvernance/security-matrix/init
 */
export async function initializeSecurityMatrix(): Promise<{ message: string }> {
  try {
    const response = await apiClient.post('/gouvernance/security-matrix/init');
    return response.data;
  } catch (error) {
    console.error('Error initializing security matrix:', error);
    throw error;
  }
}

/**
 * Get all security matrix entries with available axes
 * GET /gouvernance/security-matrix
 */
export async function getSecurityMatrix(): Promise<SecurityMatrixResponse> {
  try {
    const response = await apiClient.get('/gouvernance/security-matrix');
    return response.data;
  } catch (error) {
    console.error('Error fetching security matrix:', error);
    throw error;
  }
}

/**
 * Create a single security matrix entry
 * POST /gouvernance/security-matrix
 */
export async function createSecurityMatrixEntry(
  entry: Omit<SecurityMatrixEntry, 'id' | 'created_at' | 'updated_at'>
): Promise<SecurityMatrixEntry> {
  try {
    const response = await apiClient.post('/gouvernance/security-matrix', entry);
    return response.data;
  } catch (error) {
    console.error('Error creating security matrix entry:', error);
    throw error;
  }
}

/**
 * Bulk create security matrix entries for a role
 * POST /gouvernance/security-matrix/bulk
 */
export async function bulkCreateSecurityMatrixEntries(entries: {
  role_name: string;
  entries: Array<Omit<SecurityMatrixEntry, 'id' | 'role_name' | 'created_at' | 'updated_at'>>;
}): Promise<{ created: number; entries: SecurityMatrixEntry[] }> {
  try {
    const response = await apiClient.post('/gouvernance/security-matrix/bulk', entries);
    return response.data;
  } catch (error) {
    console.error('Error bulk creating security matrix entries:', error);
    throw error;
  }
}

/**
 * Update a security matrix entry
 * PUT /gouvernance/security-matrix/{id}
 */
export async function updateSecurityMatrixEntry(
  id: number,
  entry: Partial<Omit<SecurityMatrixEntry, 'id' | 'created_at' | 'updated_at'>>
): Promise<SecurityMatrixEntry> {
  try {
    const response = await apiClient.put(`/gouvernance/security-matrix/${id}`, entry);
    return response.data;
  } catch (error) {
    console.error(`Error updating security matrix entry ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a security matrix entry
 * DELETE /gouvernance/security-matrix/{id}
 */
export async function deleteSecurityMatrixEntry(id: number): Promise<{ message: string }> {
  try {
    const response = await apiClient.delete(`/gouvernance/security-matrix/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting security matrix entry ${id}:`, error);
    throw error;
  }
}

/**
 * Delete all security matrix entries for a role
 * DELETE /gouvernance/security-matrix/role/{role}
 */
export async function deleteSecurityMatrixByRole(
  roleName: string
): Promise<{ message: string; deleted: number }> {
  try {
    const response = await apiClient.delete(`/gouvernance/security-matrix/role/${roleName}`);
    return response.data;
  } catch (error) {
    console.error(`Error deleting security matrix entries for role ${roleName}:`, error);
    throw error;
  }
}
