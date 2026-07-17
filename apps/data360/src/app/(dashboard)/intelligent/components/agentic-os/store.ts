/**
 * Agentic OS — conversation/session store (Jotai).
 *
 * This is the previously-missing "conversation backbone": session-scoped atoms
 * (no persistence in v1 — a refresh starts a clean run), consumed by the three
 * panes so the discussion, the step strip and the validation rail stay in sync
 * without prop-drilling through the shell.
 */
import { atom } from 'jotai';
import type { AgentMessage, LifecycleStage, PendingApproval } from './types';

/** Active lifecycle step (drives left picker, center routing, right capabilities). */
export const activeStageAtom = atom<LifecycleStage>('sources');

/** Grounding context: table FQNs picked in the left rail (max 5 — coco limit). */
export const groundingTablesAtom = atom<string[]>([]);

/** Active project (grounds /cortex/agent/propose); '' = none selected. */
export const activeProjectIdAtom = atom<string>('');

/** The center-canvas conversation, oldest first. */
export const messagesAtom = atom<AgentMessage[]>([]);

/** Mutating proposals awaiting a human decision in the right rail. */
export const approvalsAtom = atom<PendingApproval[]>([]);

/** Stages the user has interacted with (visited or produced a result on). */
export const touchedStagesAtom = atom<Partial<Record<LifecycleStage, 'active' | 'done'>>>({});

let seq = 0;
/** Monotonic id — Date.now alone collides when two cards land in the same ms. */
export function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}
