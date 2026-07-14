/**
 * Workflow — Output Data-Access service.
 *
 * Backs the workflow right-bar / governance-tab "Data Access" section: who can
 * read a workflow's OUTPUT table and which policies govern it. Read-only,
 * grounded on real Snowflake (`GET /workflow/output-access` →
 * SHOW GRANTS ON <object> + INFORMATION_SCHEMA.POLICY_REFERENCES).
 */
import apiClient from '@/lib/api-client';

export interface OutputGrant {
  privilege: string;
  granted_to: string;   // ROLE | USER | ...
  grantee_name: string;
  grant_option: boolean;
}
export interface OutputViewerRole {
  role: string;
  privilege: string;
}
export interface OutputPolicy {
  policy_name: string;
  policy_kind: string;  // MASKING_POLICY | ROW_ACCESS_POLICY | AGGREGATION_POLICY
  column: string | null;
}
export interface OutputAccess {
  table: string;
  grants: OutputGrant[];
  viewer_roles: OutputViewerRole[];
  owner: string | null;
  policies: OutputPolicy[];
  viewer_role_count: number;
  policy_count: number;
  degraded: boolean;
  degraded_reasons: string[];
}

export async function getWorkflowOutputAccess(
  database: string,
  schema: string,
  table: string,
): Promise<OutputAccess> {
  const { data } = await apiClient.get<OutputAccess>('/workflow/output-access', {
    params: { database, schema, table },
  });
  return data;
}
