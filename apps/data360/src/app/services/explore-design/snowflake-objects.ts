/**
 * Snowflake object management (`/explore-design/{dynamic-tables,streams,tasks}/*`)
 * — W6 reintegration of three cohesive, previously-unwired clusters: dynamic
 * tables, streams and tasks (CRUD + lifecycle). Self-contained typed client.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export interface DynamicTable {
  name: string;
  target_lag?: string | null;
  warehouse?: string | null;
  refresh_mode?: string | null;
  scheduling_state?: string | null;
  [k: string]: unknown;
}
export interface Stream {
  name: string;
  source_type?: string | null;
  stale?: boolean | null;
  mode?: string | null;
  [k: string]: unknown;
}
export interface DeTask {
  name: string;
  state?: string | null;
  schedule?: string | null;
  warehouse?: string | null;
  [k: string]: unknown;
}

const get = async <T>(url: string): Promise<T> => (await apiClient.get<T>(url)).data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body)).data;
const patch = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.patch<T>(url, body)).data;
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data;

const E = API.exploreDesign;

export const dynamicTables = {
  list: () => get<DynamicTable[]>(E.dynamicTables()),
  create: (body: Record<string, unknown>) => post<DynamicTable>(E.dynamicTables(), body),
  describe: (name: string) => get<DynamicTable>(E.dynamicTable(name)),
  alter: (name: string, body: Record<string, unknown>) => patch<DynamicTable>(E.dynamicTable(name), body),
  drop: (name: string) => del<{ dropped?: boolean }>(E.dynamicTable(name)),
  suspend: (name: string) => post<unknown>(E.dynamicTableAction(name, 'suspend')),
  resume: (name: string) => post<unknown>(E.dynamicTableAction(name, 'resume')),
  refresh: (name: string) => post<unknown>(E.dynamicTableAction(name, 'refresh')),
};

export const streams = {
  list: () => get<Stream[]>(E.streams()),
  create: (body: Record<string, unknown>) => post<Stream>(E.streams(), body),
  describe: (name: string) => get<Stream>(E.stream(name)),
  drop: (name: string) => del<{ dropped?: boolean }>(E.stream(name)),
  peek: (name: string) => get<unknown[]>(E.streamData(name)),
};

export const deTasks = {
  list: () => get<DeTask[]>(E.deTasks()),
  describe: (name: string) => get<DeTask>(E.deTask(name)),
  alter: (name: string, body: Record<string, unknown>) => patch<DeTask>(E.deTask(name), body),
  drop: (name: string) => del<{ dropped?: boolean }>(E.deTask(name)),
  suspend: (name: string) => post<unknown>(E.deTaskAction(name, 'suspend')),
  resume: (name: string) => post<unknown>(E.deTaskAction(name, 'resume')),
};
