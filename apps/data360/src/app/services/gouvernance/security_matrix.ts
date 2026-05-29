/**
 * Gouvernance Service - Security Matrix (RLS)
 * Handles Row-Level Security matrix entries for role-based data access
 */
import apiClient from '@/lib/api-client';

/**
 * Single row from Snowflake SECURITY_MATRIX (GET response)
 */
export type SecurityMatrixEntryRow = {
  id: number;
  role_name: string;
  region_id?: string | null;
  store_id?: string | null;
  department_id?: string | null;
  product_category?: string | null;
  customer_segment?: string | null;
  access_level: string;
  created_at?: string;
  updated_at?: string;
};

/**
 * Security Matrix Entry Type (legacy / create payload shape)
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
 * Available security axes (for dropdowns) - matches backend GET
 */
export type SecurityAxes = {
  regions: Array<{ id: string; name: string }>;
  stores: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  product_categories?: string[];
  customer_segments?: string[];
  access_levels?: string[];
};

/**
 * Security Matrix Response (includes both entries and available axes)
 */
export type SecurityMatrixResponse = {
  entries: SecurityMatrixEntryRow[];
  total_entries: number;
  available_axes: SecurityAxes;
};
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
 * Payload to create one matrix entry (backend expects role_name, axes, access_level)
 */
export type CreateMatrixEntryPayload = {
  role_name: string;
  axes: {
    region_id?: string | null;
    store_id?: string | null;
    department_id?: string | null;
    product_category?: string | null;
    customer_segment?: string | null;
  };
  access_level: string;
};

/**
 * Create a single security matrix entry
 * POST /gouvernance/security-matrix
 */
export async function createSecurityMatrixEntry(
  entry: CreateMatrixEntryPayload
): Promise<{ message: string; role_name: string; axes: Record<string, unknown>; access_level: string }> {
  try {
    const response = await apiClient.post('/gouvernance/security-matrix', entry);
    return response.data;
  } catch (error) {
    console.error('Error creating security matrix entry:', error);
    throw error;
  }
}
/**
 * Payload to update one matrix entry (backend: axes dict + access_level)
 */
export type UpdateMatrixEntryPayload = {
  axes?: {
    region_id?: string | null;
    store_id?: string | null;
    department_id?: string | null;
    product_category?: string | null;
    customer_segment?: string | null;
  };
  access_level?: string;
};

/**
 * Update a security matrix entry
 * PUT /gouvernance/security-matrix/{id}
 */
export async function updateSecurityMatrixEntry(
  id: number,
  entry: UpdateMatrixEntryPayload
): Promise<{ message: string }> {
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