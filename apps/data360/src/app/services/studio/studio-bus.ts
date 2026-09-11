/**
 * studio-bus — a tiny in-process notification bus for Studio.
 *
 * Why it exists: a model change (any applied `patchModel` — a renamed target,
 * a new column, an edited or removed job) can change what a WORKFLOW may do —
 * its `activable` verdict and its impacted KPIs/jobs are computed from the
 * model. But the two surfaces that show workflows (the Overview brief and the
 * Automation panel) load them once per draft and never again, so after a model
 * edit they kept showing the pre-edit state until a full reload. The audit
 * called this out as « model/patch → workflow invalidation » and it was real.
 *
 * The publishers (≈10 components) and the subscribers (2) don't know each
 * other, and every applied patch funnels through `patchModel`, so the honest
 * place to announce "this draft's model changed" is there — one emit, and any
 * surface that cares re-reads. This is deliberately NOT React state: it is a
 * cross-component signal, and keeping it out of the tree avoids threading a
 * revision counter through every prop path.
 *
 * Scope: applied patches only (a preview changes nothing). The signal carries
 * the draft id so a subscriber ignores changes to a draft it is not showing.
 */

import { useEffect } from 'react';

type ModelChangedHandler = (draftId: string) => void;

const handlers = new Set<ModelChangedHandler>();

/** Announce that DRAFT's model was changed by an applied patch. */
export function emitModelChanged(draftId: string): void {
  for (const h of [...handlers]) {
    try {
      h(draftId);
    } catch {
      /* a broken subscriber must not stop the others, nor the caller */
    }
  }
}

/** Subscribe to model changes; returns an unsubscribe. */
export function onModelChanged(handler: ModelChangedHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/**
 * Run `reload` whenever the given draft's model changes (applied patch).
 * Pass a STABLE `reload` (wrap it in useCallback) so the subscription is not
 * torn down and rebuilt on every render.
 */
export function useModelChanged(draftId: string | null | undefined, reload: () => void): void {
  useEffect(() => {
    if (!draftId) return;
    return onModelChanged((changed) => {
      if (changed === draftId) reload();
    });
  }, [draftId, reload]);
}

/* ── access-changed: same pattern, a SEPARATE channel ─────────────────────
 * An applied access change (a grant, an RLS/mask apply, a PII profile apply)
 * moves the summary counts — applied{}/staged{}/footprint{}. But the KPI strip
 * reads the summary ONCE on mount, so after an apply it kept showing the
 * pre-apply figures (the "counts stuck at 0" the user photographed). The apply
 * paths announce here and the strip re-reads. Separate from model-changed so a
 * governance apply doesn't churn the workflow surfaces and vice-versa. */

type AccessChangedHandler = (draftId: string) => void;
const accessHandlers = new Set<AccessChangedHandler>();

/** Announce that DRAFT's access state changed (an applied grant/policy/PII). */
export function emitAccessChanged(draftId: string): void {
  for (const h of [...accessHandlers]) {
    try {
      h(draftId);
    } catch {
      /* one broken subscriber must not stop the others */
    }
  }
}

/** Subscribe to access changes; returns an unsubscribe. */
export function onAccessChanged(handler: AccessChangedHandler): () => void {
  accessHandlers.add(handler);
  return () => {
    accessHandlers.delete(handler);
  };
}

/** Run `reload` whenever the given draft's access state changes. Pass a STABLE
 *  `reload` (useCallback) so the subscription is not rebuilt every render. */
export function useAccessChanged(draftId: string | null | undefined, reload: () => void): void {
  useEffect(() => {
    if (!draftId) return;
    return onAccessChanged((changed) => {
      if (changed === draftId) reload();
    });
  }, [draftId, reload]);
}
