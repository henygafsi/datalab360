'use client';

import axios from 'axios';
import { getSession } from 'next-auth/react';

export interface TableSelection { database: string; schema: string; table: string; }

export interface MappingState {
  project_id: string | null;
  source_database: string;
  source_schema: string;
  source_table: string;
  target_database: string;
  target_schema: string;
  target_table: string;
  column_mappings: Array<{
    source_column: string;
    target_column: string;
    data_type: string;
    source_table_key?: string;
    target_table_key?: string;
  }>;
  new_target_columns?: Array<{ name: string; type: string; nullable: boolean }>;
  new_target_columns_by_table?: { [tableKey: string]: Array<{ name: string; type: string; nullable: boolean }> };
  primary_keys?: { source: { [tableKey: string]: string[] }; target: string[] };
  column_attributes?: { [tableKey: string]: { [columnName: string]: any } };
  groups?: Array<{ sources: TableSelection[]; target: TableSelection | null }>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Fetch full mapping state for a project from backend.
 * NOTE: Endpoint path may need adjusting to your backend.
 */
export async function getProjectState(projectId: string): Promise<MappingState> {
  const session = await getSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  const token = session.user.access_token;

  // Try common patterns; adjust as needed
  const endpoints = [
    `${API_BASE_URL}/mapping/project-state`,
    `${API_BASE_URL}/mapping/get_project_state`,
    `${API_BASE_URL}/mapping/project/${encodeURIComponent(projectId)}`,
  ];

  let lastErr: any;
  for (const url of endpoints) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { project_id: projectId },
      });
      return res.data as MappingState;
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw new Error(lastErr?.response?.data?.detail || lastErr?.message || 'Failed to load project state');
}

