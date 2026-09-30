/**
 * access-profiles.ts — the canonical draft-scoped access client
 * (« objet profil », backend 414/414).
 *
 * Application ROLES say what people can DO; data PROFILES say what data
 * they SEE. A profile compiles to ONE Snowflake role granted to the
 * app's access role, policies merged per (object, column) — no second
 * engine: mutations take the layered-plan shape, apply through the SAME
 * ACCOUNTADMIN gate and land in the SAME history (undo by run_id).
 * Refusals (409 version/in-use/plan-stale, 422 validation, 403 approval)
 * are RETURNED as values — a refusal is a product answer.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { studioMutate } from '@/app/services/studio/studio-api';
import type { Refusal } from '@/app/services/studio/connections';

export type ProfileOutcome<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

function refusalOf(e: unknown): Refusal {
  const resp = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const d = resp?.data?.detail;
  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>;
    return {
      status: resp?.status,
      code: (obj.code as string) ?? (obj.error_code as string | undefined),
      message: obj.message as string | undefined,
      detail: obj,
    };
  }
  if (typeof d === 'string') return { status: resp?.status, message: d };
  return { message: e instanceof Error ? e.message : 'The request failed.' };
}

async function outcome<T>(run: () => Promise<T>): Promise<ProfileOutcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    return { ok: false, refusal: refusalOf(e) };
  }
}

/* ── shapes ────────────────────────────────────────────────────────── */

export interface ProfileRow {
  column: string;
  operator?: 'in' | 'eq' | 'between' | 'like' | string;
  values?: string[] | null;
  values_by_binding?: Record<string, string[] | '*'> | null;
  validated?: boolean;
}

export interface AccessProfile {
  profile_id: string;
  name?: string;
  description?: string;
  version?: number;
  objects?: string[];
  rows?: ProfileRow[];
  columns_masked?: string[];
  bindings?: Record<string, { kind?: string }>;
  proofs?: unknown[];
  created_by?: string;
  updated_at?: string;
  state?: 'planned' | 'applied' | 'partially_applied' | string;
  stale?: boolean;
  role?: string;
  assignments?: number;
}

export interface ProfilesView {
  profiles: AccessProfile[];
  count?: number;
  max?: number;
  roles?: { app_key?: string; access_role?: string };
  compiled?: { run_id?: string; at?: string; mutations?: number; apply?: string } | null;
  operators?: string[];
  grant_types?: string[];
  principal_types?: string[];
  values?: Record<string, unknown>;
}

export interface ProfileMutation {
  mutation_id?: string;
  kind?: string;
  subject?: string;
  object?: string;
  sql?: string[];
  undo_sql?: string[];
  layer?: string;
  risk?: string;
  status?: string;
  apply_supported?: boolean;
  profile_id?: string;
  profiles?: string[];
  assignment_id?: string;
}

export interface CompileResult {
  run_id?: string;
  plan?: { question?: Record<string, unknown> };
  diff?: {
    model?: string;
    roles?: { access_role?: string; profiles?: Record<string, string> };
    mutations?: ProfileMutation[];
    summary?: Record<string, number> | string;
    nothing_to_change?: boolean;
    order?: string[];
  };
  status?: string;
}

export interface ApplyResult {
  run_id?: string;
  status?: 'dry_run' | 'applied' | 'partially_applied' | string;
  mutations?: ProfileMutation[];
  applied?: Array<{
    mutation_id?: string;
    kind?: string;
    status?: string;
    proofs?: Array<{ sql?: string; query_id?: string; duration_ms?: number }>;
    undo_sql?: string[];
  }>;
}

export interface AssignmentGrant {
  assignment_id?: string | null;
  grant_type?: string;
  profile_id?: string | null;
  legacy_access_role?: string | null;
  origin?: 'direct' | 'inherited' | string;
  via?: string;
  state?: 'planned' | 'applied' | 'revoked_outside' | 'applied_outside' | string;
  proofs?: unknown[];
  since?: string;
  roles?: { functional?: string; profile?: string; access?: string };
}

export interface AssignmentsView {
  items: Array<{ principal: { type?: string; name?: string }; grants: AssignmentGrant[] }>;
  total?: number;
  has_more?: boolean;
  cursor?: string | null;
  roles?: { access_role?: string; functional?: Record<string, string>; profiles?: Record<string, string> };
  grants_readable?: boolean;
  states?: Record<string, string>;
}

export interface ObservedValues {
  values: Array<{ value?: string; count?: number }>;
  count?: number;
  has_more?: boolean;
  cursor?: string | null;
  scope?: string;
  method?: { sample_rows?: number; note?: string };
  typed?: { value?: string; validated?: boolean; count_in_sample?: number; note?: string } | null;
}

/* ── reads ─────────────────────────────────────────────────────────── */

export async function listProfiles(draftId: string): Promise<ProfilesView> {
  const { data } = await apiClient.get<Partial<ProfilesView>>(
    API.studio.accessProfiles(draftId),
    { timeout: 60_000 },
  );
  return { ...data, profiles: Array.isArray(data?.profiles) ? data.profiles : [] };
}

export async function getProfile(draftId: string, profileId: string): Promise<AccessProfile | null> {
  try {
    const { data } = await apiClient.get<AccessProfile & { profile?: AccessProfile }>(
      API.studio.accessProfile(draftId, profileId),
      { timeout: 30_000 },
    );
    return (data?.profile ?? data) || null;
  } catch {
    return null;
  }
}

export async function getAssignments(
  draftId: string,
  p?: { q?: string; limit?: number; cursor?: string; live?: boolean },
): Promise<AssignmentsView> {
  const { data } = await apiClient.get<Partial<AssignmentsView>>(
    API.studio.accessAssignments(draftId, p),
    { timeout: 60_000 },
  );
  return { ...data, items: Array.isArray(data?.items) ? data.items : [] };
}

/** Bounded observed values — NEVER call on mount; the sample_read
 *  envelope is consumed on each read. */
export async function getObservedValues(
  draftId: string,
  p: { fqn: string; column: string; q?: string; limit?: number; cursor?: string; validate?: string },
): Promise<ProfileOutcome<ObservedValues>> {
  return outcome(async () => {
    const { data } = await apiClient.get<Partial<ObservedValues>>(
      API.studio.sourceValues(draftId, { limit: 50, ...p }),
      { timeout: 60_000 },
    );
    return { ...data, values: Array.isArray(data?.values) ? data.values : [] };
  });
}

/* ── writes (studioMutate, refusals as values) ─────────────────────── */

export interface ProfilePayload {
  name?: string;
  description?: string;
  objects?: string[];
  rows?: ProfileRow[];
  columns_masked?: string[];
  bindings?: Record<string, { kind?: string }>;
}

export async function createProfile(
  draftId: string,
  body: ProfilePayload,
): Promise<ProfileOutcome<AccessProfile & { created?: boolean; next?: Record<string, unknown> }>> {
  return outcome(() => studioMutate('POST', API.studio.accessProfiles(draftId), body, 30_000));
}

export async function updateProfile(
  draftId: string,
  profileId: string,
  body: ProfilePayload & { expected_version: number },
): Promise<ProfileOutcome<AccessProfile>> {
  return outcome(() => studioMutate('PUT', API.studio.accessProfile(draftId, profileId), body, 30_000));
}

export async function deleteProfile(
  draftId: string,
  profileId: string,
  confirm = false,
): Promise<ProfileOutcome<{ deleted?: boolean }>> {
  return outcome(() =>
    studioMutate(
      'DELETE',
      `${API.studio.accessProfile(draftId, profileId)}${confirm ? '?confirm=true' : ''}`,
      undefined,
      30_000,
    ),
  );
}

export async function compileProfiles(draftId: string): Promise<ProfileOutcome<CompileResult>> {
  return outcome(() => studioMutate('POST', API.studio.accessProfilesCompile(draftId), {}, 60_000));
}

export async function applyProfiles(
  draftId: string,
  body: { mutation_ids?: string[]; confirm: boolean },
): Promise<ProfileOutcome<ApplyResult>> {
  return outcome(() => studioMutate('POST', API.studio.accessProfilesApply(draftId), body, 120_000));
}

export async function createAssignment(
  draftId: string,
  body: {
    principal: { type: string; name: string };
    grant_type: string;
    profile_id?: string;
    confirm: boolean;
  },
): Promise<ProfileOutcome<Record<string, unknown>>> {
  return outcome(() => studioMutate('POST', API.studio.accessAssignments(draftId), body, 60_000));
}

export async function removeAssignment(
  draftId: string,
  assignmentId: string,
  confirm: boolean,
): Promise<ProfileOutcome<Record<string, unknown>>> {
  return outcome(() =>
    studioMutate(
      'DELETE',
      API.studio.accessAssignmentDelete(draftId, { assignmentId, confirm }),
      undefined,
      60_000,
    ),
  );
}

export async function undoAccessRun(
  draftId: string,
  runId: string,
): Promise<ProfileOutcome<Record<string, unknown>>> {
  return outcome(() => studioMutate('POST', API.studio.accessUndo(draftId), { run_id: runId }, 120_000));
}
