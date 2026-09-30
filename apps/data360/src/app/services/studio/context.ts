/**
 * context.ts — the ApplicationContext client (convergence 2026-09-08).
 *
 * ONE versioned context per application, read here and only here: the 7
 * questions (why/data/trust/model/insight/action/control), a common TRUTH
 * status on every artifact, the SERVER lifecycle (the only true rule —
 * publish stays internal), the Intelligence Brief, the detection registry
 * (Detect → Explain → Recommend → Act → Verify) and continuous knowledge.
 * PROJECT_STATE remains the single store; nothing here invents state.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { studioMutate } from '@/app/services/studio/studio-api';

/* ── the common truth matrix — read `truth`, never re-map raw statuses ── */

export type TruthStatus =
  | 'observed'
  | 'inferred'
  | 'confirmed'
  | 'applied'
  | 'verified'
  | 'stale'
  | 'failed';

/* ── the server lifecycle (the only true rule) ─────────────────────── */

export interface ServerLifecycle {
  state?: 'draft' | 'ready' | 'active' | 'paused' | 'degraded' | string | null;
  since?: string;
  reasons?: string[];
  next?: { step?: string; why?: string } | null;
  blockers?: unknown[];
  degraded?: unknown[];
  checks?: Array<{ check?: string; status?: string; detail?: string }>;
  needs_activation?: unknown[];
  internal?: { activation_status?: string; active_version?: number; publish_is_internal?: boolean };
  /** list projection only: false/absent until the app was rewritten since
   *  the deployment — a null state is « not recomputed yet », never guessed */
  persisted?: boolean;
}

/* ── the Intelligence Brief (context?view=overview) ────────────────── */

export interface ContextAttention {
  severity?: 'critical' | 'warning' | 'info' | string;
  kind?: string;
  what?: string;
  /** the check rule (e.g. 'referential_integrity'); ABSENT on the lifecycle
   *  "quality gate failing" item — filter on it to tell the two apart. */
  rule?: string;
  object?: string;
  /** the entities involved (2 for a relationship check) */
  objects?: Array<{ entity_id?: string; name?: string; fqn?: string }>;
  column?: string | null;
  check_ids?: string[];
  /** identical (rule, object, column) failures are grouped server-side into
   *  ONE item carrying this count — never the number of rows the FE saw. */
  count?: number;
  open?: string;
  resolve?: string;
}

export interface ContextOverview {
  title?: string;
  goal?: string;
  lifecycle?: ServerLifecycle;
  data?: Record<string, unknown>;
  model?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  insights?: Record<string, unknown>;
  automation?: Record<string, unknown>;
  access?: Record<string, unknown>;
  attention?: ContextAttention[];
  next_best_action?: { action?: string; why?: string } | null;
  questions?: Record<string, boolean>;
}

export interface ApplicationContext {
  why?: unknown;
  data?: unknown;
  trust?: unknown;
  model?: unknown;
  insight?: unknown;
  action?: unknown;
  control?: unknown;
  versions?: {
    context_version?: number;
    data_version?: number;
    definition_version?: number;
    active_version?: number;
    sources_version?: number;
    sections?: Record<string, unknown>;
  };
  overview?: ContextOverview;
  lifecycle?: ServerLifecycle;
  [k: string]: unknown;
}

export async function getApplicationContext(
  draftId: string,
  p?: { view?: 'full' | 'overview' | 'llm'; module?: string; withKnowledge?: boolean },
): Promise<ApplicationContext | null> {
  try {
    const { data } = await apiClient.get<ApplicationContext>(
      API.studio.draftContext(draftId, p),
      { timeout: 60_000 },
    );
    return data ?? null;
  } catch {
    // the brief degrades to client-composed rows — never a blank page
    return null;
  }
}

export interface ContextChanges {
  events?: unknown[];
  changed?: string[];
  invalidated?: string[];
  attached?: string[];
  detached?: string[];
  latest?: string;
  versions?: Record<string, unknown>;
  lifecycle?: ServerLifecycle;
}

export async function getContextChanges(
  draftId: string,
  since?: string,
): Promise<ContextChanges | null> {
  try {
    const { data } = await apiClient.get<ContextChanges>(
      API.studio.contextChanges(draftId, since),
      { timeout: 30_000 },
    );
    return data ?? null;
  } catch {
    return null;
  }
}

/* ── detection registry — Detect → Explain → Recommend → Act → Verify ── */

export interface Detector {
  detector_id: string;
  kind?: string;
  signal?: string;
  explain?: string;
  evidence?: Record<string, unknown> | string | null;
  severity?: 'critical' | 'warning' | 'info' | string;
  affected?: Record<string, unknown> | string | null;
  recommended_action?: {
    label?: string;
    method?: string;
    route?: string;
    body?: Record<string, unknown>;
    requires?: string[];
    executable_here?: boolean;
  } | null;
  activation_state?: 'on_demand' | 'scheduled' | 'inactive' | 'requires_observation' | string;
  truth?: TruthStatus | string;
  acted?: Record<string, unknown> | null;
}

export interface DetectionsView {
  detectors: Detector[];
  by_severity?: Record<string, number>;
  loop?: string[];
  activation_legend?: Record<string, string>;
}

export async function getDetections(draftId: string): Promise<DetectionsView> {
  const { data } = await apiClient.get<Partial<DetectionsView>>(API.studio.detections(draftId), {
    timeout: 60_000,
  });
  return { ...data, detectors: Array.isArray(data?.detectors) ? data.detectors : [] };
}

export interface DetectionActResult {
  dry_run?: boolean;
  acted?: { result?: unknown; verify?: { resolved?: boolean; before?: unknown; after?: unknown } };
  manual?: { do?: string };
  [k: string]: unknown;
}

/** Only bounded reads execute here; anything costly answers manual{do}. */
export async function actOnDetection(
  draftId: string,
  detectorId: string,
  confirm: boolean,
): Promise<DetectionActResult> {
  return studioMutate<DetectionActResult>(
    'POST',
    API.studio.detectionAct(draftId, detectorId, confirm),
    undefined,
    60_000,
  );
}

/* ── continuous knowledge ──────────────────────────────────────────── */

export interface KnowledgeView {
  counts?: { confirmed?: number; proposed?: number; rejected?: number; stale?: number };
  items?: Record<string, unknown> | unknown[];
  updated_from?: {
    source_observations?: number;
    accepted_definitions?: number;
    reporting?: number;
    dq_findings?: number;
    decisions?: number;
  };
  at?: string;
  account_wide?: { count?: number; confirmed?: number };
  review?: Record<string, unknown>;
}

export async function getKnowledge(draftId: string): Promise<KnowledgeView | null> {
  try {
    const { data } = await apiClient.get<KnowledgeView>(API.studio.knowledge(draftId), {
      timeout: 30_000,
    });
    return data ?? null;
  } catch {
    return null;
  }
}

export async function syncKnowledge(
  draftId: string,
  force = false,
): Promise<{ status?: string; written?: number; stale_marked?: number }> {
  return studioMutate('POST', API.studio.knowledgeSync(draftId, force), undefined, 60_000);
}

/* ── the business glossary (words feed every AI step) ──────────────── */

export interface GlossaryTerm {
  term: string;
  meaning?: string;
  synonyms?: string[];
}

export async function getGlossary(draftId?: string): Promise<GlossaryTerm[]> {
  try {
    const { data } = await apiClient.get<{ terms?: GlossaryTerm[] }>(
      API.studio.glossary(draftId),
      { timeout: 30_000 },
    );
    return Array.isArray(data?.terms) ? data.terms : [];
  } catch {
    return [];
  }
}

/** MERGE-style: send the terms to write; an EMPTY meaning removes one. */
export async function putGlossary(
  terms: GlossaryTerm[],
  draftId?: string,
): Promise<Record<string, unknown>> {
  return studioMutate('PUT', API.studio.glossary(draftId), { terms }, 30_000);
}
