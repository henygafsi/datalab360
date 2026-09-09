'use client';

import { atom } from 'jotai';
import type { ReactNode } from 'react';
import type { AskRailSuggestion } from '@/app/shared/studio/AskRail';

/**
 * The wizard's single right rail (AskRail) is mounted once at the StudioHome
 * level, a level ABOVE the individual steps. A step that wants the rail to ACT
 * — run a request, not just show canned text — publishes its behaviour here;
 * StudioHome reads it and passes onAsk / suggestions / context through. Null
 * means the current step adds nothing and the rail keeps its defaults.
 *
 * Steps MUST clear this on unmount (return () => set(null)) so one step's
 * handler never leaks onto the next.
 */
export interface StepAskConfig {
  onAsk?: (text: string) => void;
  suggestions?: AskRailSuggestion[];
  context?: ReactNode;
}

export const stepAskAtom = atom<StepAskConfig | null>(null);
