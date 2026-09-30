/**
 * journey.ts — the Application Studio onboarding draft (resumable, local v1).
 *
 * Single source of the journey state across the six steps
 * (Need → Sources → Understanding → Preview → Automation → Activation).
 * Stored in localStorage for now (key `studio:journey:v1`); the backend
 * journey-draft contract (P1-3) replaces the storage layer later — this
 * module's API is the stable seam, so only these functions change.
 *
 * Dependency-aware invalidation lives in the flow (OnboardingFlow.onPatch):
 * changing the need does NOT purge sources; changing sources purges
 * understanding + preview (they were derived from the old selection).
 */

export type JourneyStep =
  | 'need'
  | 'sources'
  | 'understanding'
  | 'preview'
  | 'automation'
  | 'activation';

/**
 * BusinessContext — the backend contract (drafts + understand): persisted in
 * draft.context and fed to the AI prompt as the user's business context.
 * `hierarchy` is the drill order (max 8); `notes` carries the focus label
 * and preferred-display phrases composed by the industry selector.
 */
export interface NeedContext {
  industry_id?: string | null;
  category_id?: string | null;
  hierarchy?: string[];
  audience?: string | null;
  /** Plain display phrases (deduped) — stored verbatim by the backend and
   *  fed to the prompt; also recorded as a display_hint enrichment. */
  display_hints?: string[];
  notes?: string | null;
  /** Multi-domain selection (≤5) — datalake scan + merged packs. */
  domains?: string[];
}

export interface JourneyDraft {
  version: 1;
  /** Backend draft id — set by the flow once POST /studio/drafts succeeds;
   *  every /studio call passes it so the free-preview envelope is counted
   *  on THIS journey's draft, not the implicit one. */
  draftId?: string | null;
  startedAt: string;
  updatedAt: string;
  step: JourneyStep;
  need: { text: string; domainId?: string | null; context?: NeedContext | null };
  sources: {
    connectionIds: string[];
    objects: Array<{ connectionId: string; name: string }>;
  };
  understanding: {
    approvedPlanId?: string | null;
    decisions: Record<string, string>;
  };
  preview: { reportDraftId?: string | null };
}

/**
 * Backend persistence (user directive: no local business data). The draft
 * lives in POST/PUT /studio/drafts (PROJECTS type=application backend-side);
 * localStorage keeps ONLY the draft_id pointer for fast resume.
 */
import {
  createDraft,
  getDraft,
  listDrafts,
  updateDraft,
} from '@/app/services/studio/studio-api';

const PTR_KEY = 'studio:journey:draft-id';

function readPtr(): string | null {
  try {
    return window.localStorage.getItem(PTR_KEY);
  } catch {
    return null;
  }
}

function writePtr(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(PTR_KEY, id);
    else window.localStorage.removeItem(PTR_KEY);
  } catch {
    /* ignore */
  }
}

/** Resume: pointer first, else the most recent backend draft. */
export async function loadJourneyDraftRemote(): Promise<{
  draftId: string;
  draft: JourneyDraft;
} | null> {
  try {
    let id = readPtr();
    if (!id) {
      const all = await listDrafts();
      id = all[0]?.draft_id ?? null;
    }
    if (!id) return null;
    const payload = await getDraft(id);
    const journey = (payload as { journey?: JourneyDraft } | null)?.journey;
    if (!journey || journey.version !== 1) return null;
    writePtr(id);
    return { draftId: id, draft: journey };
  } catch {
    return null;
  }
}

/** Create the backend draft on journey start; returns its id. */
export async function createJourneyDraftRemote(d: JourneyDraft): Promise<string | null> {
  try {
    const id = await createDraft({
      title: d.need.text || 'New application',
      need: d.need.text || undefined,
      domain_id: d.need.domainId ?? undefined,
      // Backend-persisted business context (fed to the AI prompt).
      context: d.need.context ?? undefined,
      journey: d,
    });
    writePtr(id);
    return id;
  } catch {
    return null;
  }
}

/** Persist a patch — fire-and-forget from the flow's debounced saver. */
export async function saveJourneyDraftRemote(draftId: string, d: JourneyDraft): Promise<void> {
  await updateDraft(draftId, {
    title: d.need.text || 'New application',
    need: d.need.text || undefined,
    domain_id: d.need.domainId ?? undefined,
    context: d.need.context ?? undefined,
    step: d.step,
    journey: { ...d, updatedAt: new Date().toISOString() },
  });
}

export function clearJourneyDraft(): void {
  writePtr(null);
}

/** Point the resumable journey at a specific backend draft (e.g. from the
 *  settings page's "Continue" action) — /studio resumes it on next visit. */
export function pointJourneyTo(draftId: string): void {
  writePtr(draftId);
}

export function newJourneyDraft(seed?: {
  needText?: string;
  domainId?: string;
  context?: NeedContext | null;
  step?: JourneyStep;
}): JourneyDraft {
  const now = new Date().toISOString();
  return {
    version: 1,
    startedAt: now,
    updatedAt: now,
    step: seed?.step ?? 'need',
    need: {
      text: seed?.needText ?? '',
      domainId: seed?.domainId ?? null,
      context: seed?.context ?? null,
    },
    sources: { connectionIds: [], objects: [] },
    understanding: { approvedPlanId: null, decisions: {} },
    preview: { reportDraftId: null },
  };
}
