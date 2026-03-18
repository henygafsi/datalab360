import { atom } from 'jotai';
import type { FullDashboard } from '@/app/services/api/types';
import type { TimeIntelligenceState } from '../components/TimeIntelligenceBar';
import { createDefaultTimeState } from '../components/TimeIntelligenceBar';

/** Currently selected dashboard project ID */
export const selectedDashboardIdAtom = atom<string | null>(null);

/** Active page ID within the current dashboard */
export const activePageIdAtom = atom<string | null>(null);

/** Full dashboard data from GET /bi-dashboard/{id} */
export const dashboardDataAtom = atom<FullDashboard | null>(null);

/** Execution results: widgetId → data rows */
export const widgetResultsAtom = atom<Record<string, Record<string, unknown>[]>>({});

/** Whether widget data execution is in progress */
export const executingAtom = atom(false);

/** Time intelligence state — range, compare toggle, auto-refresh */
export const timeIntelligenceAtom = atom<TimeIntelligenceState>(createDefaultTimeState());

/** Previous-period execution results for comparison: widgetId → data rows */
export const previousWidgetResultsAtom = atom<Record<string, Record<string, unknown>[]>>({});
