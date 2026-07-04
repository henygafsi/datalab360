'use client';

/**
 * AskLanding — chat-first home for the Intelligent Analytics module.
 *
 * Rendered when the page is opened WITHOUT a ?tab= deep-link: instead of a
 * wall of tab cards, the user gets the persisted AI chat (CortexChatContent,
 * the variant wired to /chat conversations so history survives refreshes)
 * plus one-click "Suggestions" built ONLY from cheap, already-wired reads
 * scoped to what the caller can access:
 *
 *   projects        — GET /projects/unified?mine_only=true (own / contributed)
 *   semantic models — the same listing the chat itself uses
 *   recommendations — GET /api/recommendations (same scope keys as AI Advisor)
 *
 * Every suggestion is a ready-to-send prompt; clicking one queues it into the
 * chat (which stays RBAC-gated on the send action). Sources that error or
 * return nothing are silently skipped — no fake cards, no placeholder zeros.
 */

import { useCallback, useMemo, useState } from 'react';
import type { IconType } from 'react-icons';
import { PiDatabase, PiFolderOpen, PiLightbulb } from 'react-icons/pi';

import { getUnifiedProjects, type UnifiedProject } from '@/app/services/api/projectsApi';
import { listSemanticModels, type SemanticModel } from '@/app/services/cortex/semantic-models';
import {
  listRecommendations,
  type Recommendation,
  type RecoStatus,
} from '@/app/services/recommendations';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import CortexChatContent, { type QueuedPrompt } from '../cortex-chat-content';

// Same scope keys as the AI Advisor tab / cockpit so the lists line up.
const RECO_PAGE = 'intelligent';
const RECO_MODULE = 'intelligence';
const ACTIVE_STATUSES: RecoStatus[] = ['open', 'acknowledged', 'snoozed'];
const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Rotating prompt templates so three project cards don't read identically. */
const PROJECT_PROMPTS: ReadonlyArray<(name: string) => string> = [
  (name) => `Analyze the key metrics of the "${name}" project and highlight the main trends.`,
  (name) => `Explain the data quality of the "${name}" project and where it can improve.`,
  (name) => `Summarize the recent activity in the "${name}" project — what changed lately?`,
];

interface Suggestion {
  key: string;
  kind: 'project' | 'model' | 'recommendation';
  caption: string;
  prompt: string;
  /** Semantic model to preselect in the chat before sending (model cards only). */
  model?: string;
  icon: IconType;
}

function toTime(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default function AskLanding() {
  const { trackFeatureClick } = useTrackEvent();
  const [queued, setQueued] = useState<QueuedPrompt | null>(null);

  // ── Cheap wired reads (all cached; failures degrade to "no cards") ──────
  const fetchProjects = useCallback(async () => {
    const res = await getUnifiedProjects({ mine_only: true, limit: 12, offset: 0 });
    return res.projects ?? [];
  }, []);
  const projectsQ = useCacheAwareQuery<UnifiedProject[]>(fetchProjects, {
    cacheKeys: [CACHE_KEYS.PROJECTS],
    initialData: [],
  });

  const fetchModels = useCallback(async () => {
    const data = await listSemanticModels();
    return Array.isArray(data) ? data : [];
  }, []);
  const modelsQ = useCacheAwareQuery<SemanticModel[]>(fetchModels, {
    cacheKeys: [CACHE_KEYS.SEMANTIC_MODELS],
    initialData: [],
  });

  const fetchRecos = useCallback(async () => {
    const res = await listRecommendations({
      page: RECO_PAGE,
      module: RECO_MODULE,
      statuses: ACTIVE_STATUSES,
      limit: 20,
    });
    return res.items ?? [];
  }, []);
  const recosQ = useCacheAwareQuery<Recommendation[]>(fetchRecos, {
    cacheKeys: [CACHE_KEYS.CORTEX, CACHE_KEYS.AI_SUGGESTIONS],
    initialData: [],
  });

  // ── Build the suggestion cards (max 3 projects + 3 models + 2 recos) ────
  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];

    [...(projectsQ.data ?? [])]
      .filter((p) => Boolean(p.name))
      .sort((a, b) => toTime(b.updated_at ?? b.created_at) - toTime(a.updated_at ?? a.created_at))
      .slice(0, 3)
      .forEach((p, i) => {
        out.push({
          key: `project-${p.project_id}`,
          kind: 'project',
          caption: p.type ? `Project · ${p.type}` : 'Project',
          prompt: PROJECT_PROMPTS[i % PROJECT_PROMPTS.length](p.name),
          icon: PiFolderOpen,
        });
      });

    (modelsQ.data ?? []).slice(0, 3).forEach((m) => {
      const name = m.name.replace('.yaml', '');
      out.push({
        key: `model-${m.name}`,
        kind: 'model',
        caption: 'Semantic model',
        prompt: `What questions can I ask about "${name}"? List its main measures and dimensions.`,
        model: name,
        icon: PiDatabase,
      });
    });

    [...(recosQ.data ?? [])]
      .sort(
        (a, b) =>
          (SEVERITY_RANK[(a.severity || '').toLowerCase()] ?? 9) -
          (SEVERITY_RANK[(b.severity || '').toLowerCase()] ?? 9),
      )
      .slice(0, 2)
      .forEach((r) => {
        out.push({
          key: `reco-${r.reco_id}`,
          kind: 'recommendation',
          caption: `Recommendation · ${r.severity || '—'}`,
          prompt: `Explain the recommendation "${r.title}" and propose a concrete action plan.`,
          icon: PiLightbulb,
        });
      });

    return out;
  }, [projectsQ.data, modelsQ.data, recosQ.data]);

  const loading =
    suggestions.length === 0 && (projectsQ.loading || modelsQ.loading || recosQ.loading);

  const onSuggestion = useCallback(
    (s: Suggestion) => {
      setQueued({ text: s.prompt, model: s.model, ts: Date.now() });
      trackFeatureClick(`intelligent_ask_suggestion_${s.kind}`);
    },
    [trackFeatureClick],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* The persisted chat — conversation history survives; sidebar togglable */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <CortexChatContent variant="landing" queuedPrompt={queued} />
      </div>

      {/* Suggestions — one-click prompts from data the caller already has */}
      <section aria-label="Suggested questions">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Suggestions
          </h3>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            one-click prompts from your projects, semantic models &amp; AI recommendations
          </span>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : suggestions.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            No suggestions yet — cards appear automatically from your projects, semantic models and
            active AI recommendations.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onSuggestion(s)}
                  className="group flex w-full flex-col items-start gap-1.5 rounded-lg border border-gray-200 bg-white p-3 text-left transition-all hover:border-purple hover:shadow-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    <Icon className="h-3.5 w-3.5 text-purple" aria-hidden />
                    {s.caption}
                  </span>
                  <span className="text-[13px] leading-snug text-gray-700 group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white">
                    {s.prompt}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
