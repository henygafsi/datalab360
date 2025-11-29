/**
 * Types for Gouvernance/Dashboard APIs
 */

export interface QueryAccessHistory {
  QUERY_ID: string;
  QUERY_TEXT: string;
  QUERY_USER: string;
  QUERY_START_TIME: string;
  DIRECT_OBJECTS_ACCESSED: any;
  BASE_OBJECTS_ACCESSED: any;
  OBJECTS_MODIFIED: any;
}

export interface StageSize {
  database_name: string;
  schema_name: string;
  stage_name: string;
  total_mb: number | null;
  error?: string;
}

export interface TableStorage {
  table_name: string;
  storage_gb: number;
}

export interface DwhStorageSummary {
  database: string;
  schema: string;
  total_storage_gb: number;
  tables: TableStorage[];
}

export interface StagedTableInfo {
  database: string;
  schema: string;
  table_name: string;
  source_file: string;
  storage_gb: number;
}

export interface StagedTableStorage {
  database: string;
  total_storage_gb: number;
  tables: StagedTableInfo[];
}

export interface DwhTableHealth {
  schema: string;
  table_name: string;
  row_count: number | null;
  last_altered: string | null;
  is_empty: boolean | null;
  storage_mb: number | null;
}

export interface DwhHealthInfo {
  tables: DwhTableHealth[];
}

export interface ClientDashboardInfo {
  total_events: number;
  success_rate: number;
  failed_events: number;
  last_login: string | null;
  last_ingestion: string | null;
  last_mapping: string | null;
  events_by_module: Record<string, number>;
}

export interface ConnectorInfo {
  name: string;
  enabled: boolean;
  category: string;
  created_on: string;
  last_altered: string;
  storage_mb: number | null;
}

export interface ConnectorsResponse {
  connectors: ConnectorInfo[];
}

export interface UserActivityWithQuery {
  USERNAME: string;
  MODULE_NAME: string;
  EVENT_TYPE: string;
  EVENT_STATUS: string;
  EVENT_DATE: string;
  QUERY_ID: string | null;
  QUERY_TEXT: string | null;
  QUERY_STATUS: string | null;
  EXECUTION_TIME_SEC: number | null;
  ROWS_PRODUCED: number | null;
  WAREHOUSE_NAME: string | null;
}

export interface ActivityFilterParams {
  username?: string;
  module_name?: string;
  event_type?: string;
  start_date?: string;
  end_date?: string;
  query_status?: string;
}

export interface MfaStatus {
  username: string;
  mfa_enabled: boolean;
}
