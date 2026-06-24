/**
 * Frontend Service Layer for Governance Posture
 *
 * Read-only getters for two account-level governance posture endpoints:
 *   - GET /gouvernance/compliance/score        (weighted masking/row-access/tagging score)
 *   - GET /gouvernance/access-review/summary    (mfa gaps, expiring policies, orphan grants)
 *
 * Honesty contract: both getters degrade gracefully (try/catch) so the UI never
 * crashes. On failure they return a neutral shape with `available: false` — the
 * caller MUST gate on `available` and render "—" (undetermined), never a fake 0.
 *
 * Location: apps/data360/src/app/services/governance/posture.ts
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

// ============= COMPLIANCE SCORE =============

export interface ComplianceMaskingBreakdown {
  score: number;
  weight: number;
  masked_sensitive_columns: number;
  unprotected_sensitive_columns: number;
}

export interface ComplianceRowAccessBreakdown {
  score: number;
  weight: number;
}

export interface ComplianceTaggingBreakdown {
  score: number;
  weight: number;
  tagged_objects: number;
  total_tables: number;
}

export interface ComplianceBreakdown {
  masking: ComplianceMaskingBreakdown;
  row_access: ComplianceRowAccessBreakdown;
  tagging: ComplianceTaggingBreakdown;
}

export interface ComplianceScore {
  /** Frontend honesty sentinel — false when the fetch failed (render "—", not 0). */
  available: boolean;
  score: number;
  scope: string;
  breakdown: ComplianceBreakdown;
  warnings: string[];
  computed_at?: string;
  execution_time_ms?: number;
}

const NEUTRAL_COMPLIANCE: ComplianceScore = {
  available: false,
  score: 0,
  scope: '',
  breakdown: {
    masking: { score: 0, weight: 0, masked_sensitive_columns: 0, unprotected_sensitive_columns: 0 },
    row_access: { score: 0, weight: 0 },
    tagging: { score: 0, weight: 0, tagged_objects: 0, total_tables: 0 },
  },
  warnings: [],
};

/** GET /gouvernance/compliance/score — degrades to `{ available: false }` on error. */
export async function getComplianceScore(): Promise<ComplianceScore> {
  try {
    const { data } = await apiClient.get<Omit<ComplianceScore, 'available'>>(
      API.gouvernance.complianceScore(),
    );
    return { available: true, ...data };
  } catch {
    return NEUTRAL_COMPLIANCE;
  }
}

// ============= ACCESS-REVIEW SUMMARY =============

export interface AccessReviewMfaGap {
  username: string;
  default_role: string | null;
  login_name: string | null;
}

export interface AccessReviewExpiringPolicy {
  name?: string;
  policy_type?: string;
  expiration_date?: string | null;
}

export interface AccessReviewOrphanGrant {
  grantee?: string;
  privilege?: string;
  object?: string;
}

export interface AccessReviewOrphanScan {
  scanned_users: number;
  user_cap: number;
}

export interface AccessReviewSummary {
  /** Frontend honesty sentinel — false when the fetch failed (render "—", not 0). */
  available: boolean;
  expiring_policies: AccessReviewExpiringPolicy[];
  mfa_gaps: AccessReviewMfaGap[];
  orphan_grants: AccessReviewOrphanGrant[];
  orphan_scan: AccessReviewOrphanScan;
  window_days: number;
  generated_at?: string;
}

const NEUTRAL_ACCESS_REVIEW: AccessReviewSummary = {
  available: false,
  expiring_policies: [],
  mfa_gaps: [],
  orphan_grants: [],
  orphan_scan: { scanned_users: 0, user_cap: 0 },
  window_days: 0,
};

/** GET /gouvernance/access-review/summary — degrades to `{ available: false }` on error. */
export async function getAccessReviewSummary(): Promise<AccessReviewSummary> {
  try {
    const { data } = await apiClient.get<Omit<AccessReviewSummary, 'available'>>(
      API.gouvernance.accessReviewSummary(),
    );
    return { available: true, ...data };
  } catch {
    return NEUTRAL_ACCESS_REVIEW;
  }
}

/** Count of items needing attention (mfa gaps + expiring policies + orphan grants). */
export function countNeedsAttention(s: AccessReviewSummary): number {
  return s.mfa_gaps.length + s.expiring_policies.length + s.orphan_grants.length;
}
