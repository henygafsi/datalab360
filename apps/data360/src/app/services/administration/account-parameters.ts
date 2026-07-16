'use client';

/**
 * administration/account-parameters — every account-level Snowflake parameter
 * (SHOW PARAMETERS IN ACCOUNT), surfaced read-only in the Administration hub's
 * Config tab. These are the account's real security/session/retention knobs
 * (MFA caching, network/IP, statement timeouts, data retention…) that had no UI.
 *
 *   GET /api/administration/account-parameters
 *     → { parameters: AccountParameter[], count, settable: string[] }
 *
 * Envelope: standard_response — payload at res.data.data.
 */
import apiClient from '@/lib/api-client';

const PATH = '/api/administration/account-parameters';

export interface AccountParameter {
  name: string;
  value: string;
  default: string;
  level: string;
  type: string;
  description?: string;
  settable?: boolean;
}

export interface AccountParametersResult {
  parameters: AccountParameter[];
  count: number;
  settable: string[];
}

export async function getAccountParameters(): Promise<AccountParametersResult> {
  const res = await apiClient.get(PATH);
  const d = (res.data?.data ?? res.data) as Partial<AccountParametersResult>;
  return {
    parameters: d.parameters ?? [],
    count: d.count ?? (d.parameters?.length ?? 0),
    settable: d.settable ?? [],
  };
}

/** Security-relevant parameter names (MFA / network / session / auth / timeout). */
export const SECURITY_PARAM_HINT = /MFA|NETWORK|IP_|SESSION|PASSWORD|LOGIN|SSO|SCIM|OAUTH|TIMEOUT|SECURITY|ENCRYPT|RETENTION/i;
