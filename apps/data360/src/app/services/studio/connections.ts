/**
 * connections.ts — the SOURCES first-class client (backend tranche
 * 2026-09-08, schema_version studio.connections.v1 /
 * studio.source_objects.v1).
 *
 * Connections are first-class, reusable objects with their own identity,
 * permissions, persisted dated test proof, versioned sensitive DRAFT
 * (active config untouched, empty secret = unchanged), dependency-checked
 * deletion; objects exist through their VERSIONED attachment to an
 * application. GETs go through apiClient; every mutation rides
 * studioMutate (the serialized fetch transport). Refusals that the UI must
 * render (409 version/in-use, 422 validation) are RETURNED as values, not
 * thrown — a refusal is a product answer.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { studioMutate } from '@/app/services/studio/studio-api';

/* ── shared refusal shape ──────────────────────────────────────────── */

export interface Refusal {
  status?: number;
  code?: string;
  message?: string;
  /** the structured payload of the refusal (dependencies, options, impact…) */
  detail?: Record<string, unknown>;
}

function refusalOf(e: unknown): Refusal {
  const resp = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const d = resp?.data?.detail;
  if (d && typeof d === 'object') {
    const obj = d as Record<string, unknown>;
    return {
      status: resp?.status,
      code: typeof obj.code === 'string' ? obj.code : (obj.error_code as string | undefined),
      message: typeof obj.message === 'string' ? obj.message : undefined,
      detail: obj,
    };
  }
  if (typeof d === 'string') return { status: resp?.status, message: d };
  return { message: e instanceof Error ? e.message : 'The request failed.' };
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

async function outcome<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    return { ok: false, refusal: refusalOf(e) };
  }
}

/* ── connection types (form schemas) ───────────────────────────────── */

export interface ConnectionTypeField {
  name: string;
  type?: string;
  required?: boolean;
  secret?: boolean;
  scope?: 'connection' | 'object' | string;
  /** the backend's own words: "empty = unchanged" */
  edit_semantics?: string;
  label?: string;
  placeholder?: string;
}

export interface ConnectionTypeInfo {
  type: string;
  catalog_id?: string;
  label?: string;
  integrated?: boolean;
  usable?: boolean;
  auth_modes?: string[];
  fields?: ConnectionTypeField[];
  steps?: string[];
  capabilities?: { configured?: string[]; native?: string[]; missing?: string[] };
  note?: string;
}

export async function getConnectionTypes(): Promise<{
  types: ConnectionTypeInfo[];
  usable: string[];
}> {
  const { data } = await apiClient.get<{ types?: ConnectionTypeInfo[]; usable?: string[] }>(
    API.studio.connections.types(),
    { timeout: 30_000 },
  );
  return {
    types: Array.isArray(data?.types) ? data.types : [],
    usable: Array.isArray(data?.usable) ? data.usable : [],
  };
}

/* ── the connections list ──────────────────────────────────────────── */

export interface ConnectionTestCheck {
  check?: string; // network|auth|execution_context|metadata_discovery|read_selected_objects|write
  status?: 'pass' | 'fail' | 'skipped' | 'not_tested' | string;
  ms?: number;
  /** words OR a structured payload (auth/context/discovery return k:v) —
   *  never hand this to JSX directly */
  detail?: string | Record<string, unknown> | null;
  error_class?: string | null; // dns|network_unreachable|timeout|auth_failed|user_disabled|permission_denied|object_not_found|driver_missing|unknown
  fix?: string | null;
}

export interface ConnectionTestResult {
  overall?: 'pass' | 'degraded' | 'fail' | 'inconclusive' | string;
  identity?: Record<string, unknown> & { svc_proof?: boolean };
  config_version?: number;
  checks?: ConnectionTestCheck[];
  at?: string;
  by?: string;
  stale?: boolean;
}

export interface ConnectionListItem {
  connection_id: string;
  name?: string;
  type?: string;
  catalog_id?: string;
  environment?: string;
  owner?: string;
  version?: number;
  managed_by?: 'connect' | 'studio_rest' | 'studio' | 'auth' | string;
  auth?: {
    method?: string;
    identity?: Record<string, unknown>;
    secret_ref?: Record<string, 'set' | 'missing'>;
  };
  capabilities?: { configured?: string[]; verified?: string[] };
  last_test?: ConnectionTestResult | null;
  draft?: Record<string, unknown> | null;
  usage?: { known?: boolean; applications?: number; objects?: number; jobs?: number };
  permissions?: {
    use?: boolean;
    read_metadata?: boolean;
    read_data?: boolean;
    configure?: boolean;
    manage_secrets?: boolean;
    write?: boolean;
    note?: string;
  };
  actions?: string[];
}

export interface ConnectionsPage {
  items: ConnectionListItem[];
  total?: number;
  has_more?: boolean;
  registry?: string;
}

export async function listConnections(p?: {
  q?: string;
  type?: string;
  environment?: string;
  sort?: string;
  offset?: number;
  limit?: number;
}): Promise<ConnectionsPage> {
  const { data } = await apiClient.get<Partial<ConnectionsPage>>(
    API.studio.connections.list({ ...p, withUsage: true }),
    { timeout: 60_000 },
  );
  return { ...data, items: Array.isArray(data?.items) ? data.items : [] };
}

/* ── the sheet ─────────────────────────────────────────────────────── */

export interface ConnectionDetail extends ConnectionListItem {
  description?: string;
  dependencies?: {
    known?: boolean;
    /** objects arrives as a COUNT or as the list of fqns, name as name|title */
    applications?: Array<{
      draft_id?: string;
      name?: string;
      title?: string;
      owner?: string;
      objects?: number | string[];
      jobs?: number;
    }>;
    shown?: number;
    visible_applications?: number;
    /** counted, never named — another user's applications stay private */
    hidden_applications?: number;
    objects?: number;
    jobs?: number;
    total_applications?: number;
    truncated?: boolean;
  };
  history?: Array<{ at?: string; by?: string; action?: string; version?: number; [k: string]: unknown }>;
  last_test_detail?: ConnectionTestResult | null;
  form?: { fields?: ConnectionTypeField[]; auth_modes?: string[] };
}

export async function getConnection(id: string): Promise<ConnectionDetail> {
  const { data } = await apiClient.get<ConnectionDetail>(API.studio.connections.detail(id), {
    timeout: 60_000,
  });
  return data ?? ({ connection_id: id } as ConnectionDetail);
}

export async function createConnection(body: {
  type: string;
  name: string;
  environment?: string;
  params?: Record<string, unknown>;
  secrets?: Record<string, string>;
}): Promise<Outcome<ConnectionDetail & { created?: boolean; next?: Record<string, unknown> }>> {
  return outcome(() => studioMutate('POST', API.studio.connections.create(), body, 60_000));
}

/** NON-sensitive edits only — params/secrets go through the draft. */
export async function updateConnection(
  id: string,
  body: { expected_version: number; name?: string; environment?: string; description?: string },
): Promise<Outcome<ConnectionDetail>> {
  return outcome(() => studioMutate('PUT', API.studio.connections.update(id), body, 30_000));
}

export async function deleteConnection(id: string, confirm: boolean): Promise<Outcome<{
  deleted?: boolean;
  dependencies?: ConnectionDetail['dependencies'];
}>> {
  return outcome(() => studioMutate('DELETE', API.studio.connections.remove(id, confirm), undefined, 30_000));
}

/* ── the sensitive draft: edit → test → impact → apply ─────────────── */

export interface ConnectionDraftState {
  draft?: {
    params_changed?: string[];
    secrets_changed?: string[];
    base_version?: number;
    last_test?: ConnectionTestResult | null;
  } | null;
  active_untouched?: boolean;
  next?: Record<string, unknown>;
  discarded?: boolean;
}

export async function putConnectionDraft(
  id: string,
  body: {
    expected_version: number;
    params?: Record<string, unknown>;
    secrets?: Record<string, string>;
    clear_secrets?: string[];
  },
): Promise<Outcome<ConnectionDraftState>> {
  return outcome(() => studioMutate('PUT', API.studio.connections.draft(id), body, 30_000));
}

export async function discardConnectionDraft(id: string): Promise<Outcome<ConnectionDraftState>> {
  return outcome(() => studioMutate('DELETE', API.studio.connections.draft(id), undefined, 30_000));
}

/** The explicit bounded diagnostic (20 s budget, 8 s per check) — distinct
 *  checks, write ALWAYS not_tested, proof persisted server-side. */
export async function testConnection(
  id: string,
  body: { target?: 'active' | 'draft'; objects?: string[]; budget_s?: number } = {},
): Promise<Outcome<ConnectionTestResult>> {
  return outcome(() => studioMutate('POST', API.studio.connections.test(id), body, 60_000));
}

export interface ConnectionImpact {
  dependencies?: ConnectionDetail['dependencies'];
  active_runs?: { count?: number; known?: boolean };
  sessions?: { pooled?: number; note?: string };
  rollback?: Record<string, unknown>;
  blocking?: unknown[];
}

export async function getConnectionImpact(id: string): Promise<ConnectionImpact> {
  const { data } = await apiClient.get<ConnectionImpact>(API.studio.connections.impact(id), {
    timeout: 30_000,
  });
  return data ?? {};
}

export async function applyConnectionDraft(
  id: string,
  body: { expected_version: number; confirm: boolean; allow_untested?: boolean; wait_active_runs?: boolean },
): Promise<Outcome<{
  applied?: { from_version?: number; to_version?: number; verification?: ConnectionTestResult };
}>> {
  return outcome(() => studioMutate('POST', API.studio.connections.apply(id), body, 60_000));
}

/* ── discovery + preview under the connection's identity ───────────── */

export interface DiscoveredObject {
  ref: string;
  fqn?: string;
  kind?: string;
  database?: string;
  schema?: string;
  name?: string;
  type?: string;
  approx_row_count?: number | null;
  bytes?: number | null;
  last_altered?: string | null;
  selected?: boolean;
}

export interface DiscoveryPage {
  objects: DiscoveredObject[];
  has_more?: boolean;
  cursor?: string | null;
  identity?: Record<string, unknown>;
  ms?: number;
}

export async function discoverConnectionObjects(
  id: string,
  p?: { schema?: string; q?: string; limit?: number; cursor?: string; selected?: string[] },
): Promise<Outcome<DiscoveryPage>> {
  return outcome(async () => {
    const { data } = await apiClient.get<Partial<DiscoveryPage>>(
      API.studio.connections.objects(id, {
        schema: p?.schema,
        q: p?.q,
        limit: p?.limit,
        cursor: p?.cursor,
        selected: p?.selected?.length ? p.selected.join(',') : undefined,
      }),
      { timeout: 60_000 },
    );
    return { ...data, objects: Array.isArray(data?.objects) ? data.objects : [] };
  });
}

export interface ConnectionPreview {
  columns?: string[];
  rows?: unknown[][];
  row_count?: number;
  profile?: Record<string, unknown>;
  method?: string;
  scope?: {
    bounded?: boolean;
    rows_requested?: number;
    is_production_total?: boolean;
    freshness?: string;
    note?: string;
  };
  usage?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  ms?: number;
}

export async function previewConnectionObject(
  id: string,
  body: { ref: string; rows?: number; draft_id?: string },
): Promise<Outcome<ConnectionPreview>> {
  return outcome(() => studioMutate('POST', API.studio.connections.preview(id), body, 60_000));
}

/* ── versioned attachments (Objects in use) ────────────────────────── */

export interface AttachedSourceItem {
  attachment_id?: string;
  ref: string;
  fqn?: string;
  connection_id?: string;
  business_name?: string;
  physical_name?: string;
  /** words OR {connection_id, database} — never hand it to JSX directly */
  origin?: string | { connection_id?: string; database?: string } | null;
  type?: string;
  binding_version?: number;
  volume?: { rows?: number | null; method?: string; state?: string };
  quality?: { state?: 'evaluated' | 'not_evaluated' | string; checks?: number; verdicts?: unknown[] };
  understanding?: { state?: 'known' | 'stale' | 'not_analysed' | string; columns?: number };
  usage?: {
    targets?: number;
    jobs?: number;
    kpis?: number;
    charts?: number;
    lineage_known?: boolean;
  };
  open?: Record<string, unknown>;
}

export interface DraftSourcesView {
  sources_version?: number;
  items: AttachedSourceItem[];
  total?: number;
  has_more?: boolean;
  stale_for?: string[];
}

export async function getDraftSources(
  draftId: string,
  p?: { q?: string; sort?: string; offset?: number; limit?: number },
): Promise<DraftSourcesView> {
  const { data } = await apiClient.get<Partial<DraftSourcesView>>(
    API.studio.draftSources(draftId, p),
    { timeout: 60_000 },
  );
  return { ...data, items: Array.isArray(data?.items) ? data.items : [] };
}

export interface AttachResult {
  added?: string[];
  already_attached?: string[];
  prepared?: Array<{ ref?: string; words_known?: boolean; columns_known?: boolean; understanding?: string }>;
  to_activate?: Array<{ step?: string; why?: string }>;
  published?: { model?: boolean; jobs?: boolean };
  sources_version?: number;
}

export async function attachSources(
  draftId: string,
  body: {
    objects: Array<{ ref?: string; fqn?: string; connection_id?: string; business_name?: string; kind?: string }>;
    expected_version?: number;
  },
): Promise<Outcome<AttachResult>> {
  return outcome(() => studioMutate('POST', API.studio.draftSourcesAttach(draftId), body, 60_000));
}

/* ── the object & columns sheet ────────────────────────────────────── */

export interface ObjectSheetColumn {
  name: string;
  type?: string;
  nullable?: boolean;
  role?: string;
  key?: Record<string, unknown> | null;
  description?: string | null;
  profile?: { state?: string; [k: string]: unknown };
  anomalies?: Array<Record<string, unknown> | string>;
  quality?: { state?: string };
  mapping?: {
    target_id?: string;
    target?: string;
    column?: string;
    type?: string;
    expression?: string | null;
    rule?: Record<string, unknown> | null;
    responsible_job_id?: string;
  } | null;
  actions?: Record<string, unknown>;
}

export interface ObjectSheetView {
  header?: {
    business_name?: string;
    physical_path?: string;
    copyable?: boolean;
    type?: string;
    connection?: { connection_id?: string; open?: Record<string, unknown> };
    binding_version?: number;
  };
  synthesis?: {
    description?: string | null;
    business_terms?: string[];
    grain?: { key?: string[]; time_field?: string | null; status?: string };
    volume?: { rows?: number | null; method?: string; state?: string };
    freshness?: Record<string, unknown>;
    quality?: { state?: string; checks?: number; verdicts?: unknown[]; overall?: string };
    understanding?: { state?: string; stale?: boolean; run_id?: string };
  };
  columns?: { state?: 'known' | 'not_discovered' | string; items?: ObjectSheetColumn[] };
  preview?: { route?: string; body?: Record<string, unknown>; on_demand?: boolean };
  usage?: {
    lineage_known?: boolean;
    model_known?: boolean;
    targets?: unknown[];
    jobs?: unknown[];
    kpis?: unknown[];
    charts?: unknown[];
    measures?: unknown[];
    dq_checks?: number;
    relationships?: unknown[];
    count?: number;
    note?: string;
  };
  schema_observation?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  principle?: string;
}

export async function getObjectSheet(draftId: string, ref: string): Promise<ObjectSheetView> {
  const { data } = await apiClient.get<ObjectSheetView>(
    API.studio.draftSourceObject(draftId, ref),
    { timeout: 60_000 },
  );
  return data ?? {};
}

export async function patchAttachment(
  draftId: string,
  ref: string,
  body: {
    business_name?: string;
    binding?: { ref?: string; fqn?: string; connection_id?: string };
    confirm?: boolean;
  },
): Promise<Outcome<{ attachment?: AttachedSourceItem; changed?: string[]; impacts?: unknown; note?: string }>> {
  return outcome(() => studioMutate('PATCH', API.studio.draftSource(draftId, ref), body, 30_000));
}

export interface DetachResult {
  detached?: boolean;
  dependencies?: Record<string, unknown>;
  jobs_state?: Record<string, string>;
  source_deleted?: boolean;
  other_applications_affected?: boolean;
}

export async function detachSource(
  draftId: string,
  ref: string,
  p: { confirm?: boolean; resolution?: string; expectedVersion?: number },
): Promise<Outcome<DetachResult>> {
  return outcome(() =>
    studioMutate('DELETE', API.studio.draftSourceDetach(draftId, ref, p), undefined, 30_000),
  );
}

export interface SchemaCheckResult {
  added?: string[];
  removed?: string[];
  type_changed?: Array<{ name?: string; from?: string; to?: string }>;
  rename_candidates?: Array<{ from?: string; to?: string; confidence?: string; status?: string }>;
  impacts?: {
    targets?: Array<{ target_id?: string; name?: string; columns?: string[] }>;
    jobs?: unknown[];
    charts?: unknown[];
  };
  observation_version?: number;
  ai?: { available?: boolean };
}

export async function schemaCheck(draftId: string, ref: string): Promise<Outcome<SchemaCheckResult>> {
  return outcome(() =>
    studioMutate('POST', API.studio.draftSourceSchemaCheck(draftId, ref), undefined, 60_000),
  );
}
