/**
 * Governance identity & integrations (`/gouvernance/{oauth,gui-permissions,
 * enterprise-users}/*`) — three security clusters: OAuth/SAML integrations,
 * GUI page-access permissions, and the enterprise user directory. Typed client
 * (reads + admin mutations).
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export interface SecurityIntegration {
  name: string;
  type?: string | null;
  enabled?: boolean | null;
  category?: string | null;
  [k: string]: unknown;
}
export interface GuiPermission {
  permission_id?: string;
  page_path: string;
  role?: string | null;
  access_level?: string | null;
  [k: string]: unknown;
}
export interface EnterpriseUser {
  username: string;
  email?: string | null;
  status?: string | null;
  source?: string | null;
  [k: string]: unknown;
}

const get = async <T>(url: string): Promise<T> => (await apiClient.get<T>(url)).data;
const post = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.post<T>(url, body)).data;
const put = async <T>(url: string, body?: unknown): Promise<T> => (await apiClient.put<T>(url, body)).data;
const del = async <T>(url: string): Promise<T> => (await apiClient.delete<T>(url)).data;

const G = API.gouvernance;

export const oauth = {
  listIntegrations: () => get<SecurityIntegration[]>(G.oauthIntegrations()),
  createIntegration: (body: Record<string, unknown>) => post<SecurityIntegration>(G.oauthIntegrations(), body),
  networkPolicies: () => get<unknown[]>(G.oauthNetworkPolicies()),
  apiKeys: () => get<unknown[]>(G.oauthApiKeys()),
  createServiceUser: (body: Record<string, unknown>) => post<unknown>(G.oauthServiceUsers(), body),
  assignRsaKey: (body: { username: string; public_key: string }) => post<unknown>(G.oauthAssignRsaKey(), body),
  revokeRsaKey: (username: string) => del<unknown>(G.oauthRevokeRsaKey(username)),
  createSamlIntegration: (body: Record<string, unknown>) => post<SecurityIntegration>(G.oauthSamlIntegrations(), body),
};

export const guiPermissions = {
  list: () => get<GuiPermission[]>(G.guiPermissions()),
  upsert: (body: GuiPermission) => post<GuiPermission>(G.guiPermissions(), body),
  myAccess: () => get<{ pages?: string[] }>(G.guiMyAccess()),
  effective: (username: string) => get<{ pages?: string[] }>(G.guiEffective(username)),
  remove: (permissionId: string) => del<{ deleted?: boolean }>(G.guiPermissionDelete(permissionId)),
};

export const enterpriseUsers = {
  list: () => get<EnterpriseUser[]>(G.enterpriseUsers()),
  update: (username: string, body: Record<string, unknown>) => put<EnterpriseUser>(G.enterpriseUser(username), body),
  remove: (username: string) => del<{ deleted?: boolean }>(G.enterpriseUser(username)),
  sync: () => post<{ synced?: number }>(G.enterpriseUsersSync()),
};
