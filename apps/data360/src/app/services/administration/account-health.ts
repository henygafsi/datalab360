'use client';

/**
 * administration/account-health — the shared right-rail "Snowflake account
 * health" pulse (FINAL-TAB-DISPLAY-SPEC wave 2).
 *
 *   GET /api/administration/account-health
 *     → { chips: { warehouses, credits, failed_queries, failed_logins,
 *                  storage, dmf }, degraded }
 *
 * One backend slot (5-min shared cache) feeds every page's rail. Each chip is
 * independently nullable — the backend degrades per-chip with a reason in
 * `degraded`; the UI renders an honest "—" for a null chip, never a zero.
 * Envelope: standard_response — payload at res.data.data (see entitlements.ts).
 */
import axios from 'axios';
import apiClient from '@/lib/api-client';
import { dedupGet } from '@/app/services/request-dedup';

const PATH = '/api/administration/account-health';

export interface AccountHealthChips {
  warehouses: { total: number; running: number; queued: number } | null;
  credits: { today: number; daily_avg_7d: number } | null;
  failed_queries: { total_24h: number; failed_24h: number; fail_pct: number } | null;
  failed_logins: { failed_24h: number } | null;
  storage: { tb: number } | null;
  dmf: { measurements_7d: number; monitored_tables: number } | null;
}

export interface AccountHealth {
  chips: AccountHealthChips;
  degraded: Record<string, string> | null;
}

/** Endpoint absent on this environment (404/501) — degrade quietly. */
export class AccountHealthUnavailableError extends Error {
  constructor() {
    super('account-health endpoint not deployed');
    this.name = 'AccountHealthUnavailableError';
  }
}

/** Deduped: AccountHealthBlock (rail) + MaturityLadderStrip (account tab)
 *  both fetch this on the same load — one request serves both (120s TTL,
 *  matching the backend's 5-min shared cache). */
export async function getAccountHealth(): Promise<AccountHealth> {
  return dedupGet('admin:account-health', 120_000, () => fetchAccountHealth());
}

async function fetchAccountHealth(): Promise<AccountHealth> {
  try {
    const res = await apiClient.get(PATH, { timeout: 60_000 });
    const payload = (res.data?.data ?? res.data) as AccountHealth;
    return {
      chips: payload?.chips ?? {
        warehouses: null, credits: null, failed_queries: null,
        failed_logins: null, storage: null, dmf: null,
      },
      degraded: payload?.degraded ?? null,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404 || status === 501) throw new AccountHealthUnavailableError();
    }
    throw err;
  }
}
