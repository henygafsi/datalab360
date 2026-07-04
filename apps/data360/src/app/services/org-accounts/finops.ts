/**
 * Org-level FinOps reads (`/org-accounts/organization/*`) — three cost
 * endpoints: costs by account (currency), storage per account, and remaining
 * credit balance. Complements the credits/warehouse-credits views.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export interface OrgCostRow {
  account_name: string;
  cost?: number | null;
  currency?: string | null;
  [k: string]: unknown;
}
export interface OrgStorageRow {
  account_name: string;
  storage_tb?: number | null;
  [k: string]: unknown;
}
export interface OrgRemainingBalance {
  remaining_credits?: number | null;
  free_usage_credits?: number | null;
  as_of?: string | null;
  [k: string]: unknown;
}

const get = async <T>(url: string): Promise<T> => (await apiClient.get<T>(url)).data;

export const orgFinops = {
  /** Org costs by account in currency. */
  costs: (days?: number) => get<OrgCostRow[]>(API.orgAccounts.orgCosts(days)),
  /** Org storage per account. */
  storage: () => get<OrgStorageRow[]>(API.orgAccounts.orgStorage()),
  /** Org remaining credit balance. */
  remainingBalance: () => get<OrgRemainingBalance>(API.orgAccounts.orgRemainingBalance()),
};

export default orgFinops;
