'use client';

/**
 * ModelSelector — reusable Cortex completion model picker.
 *
 * Single source of truth for any AI feature that needs to surface the catalog
 * returned by `GET /cortex/models`. Used by the workflow AI wizard, the
 * upcoming `/cortex/code-generate` (G9) screen, and any other surface that
 * lets the user pick (or compare) a completion model.
 *
 * Modes:
 *   - grid    (default): responsive 3-col grid of model cards.
 *   - compact          : single dropdown — drop in headers / dense toolbars.
 *   - A/B              : two side-by-side selectors when `selectedB` is passed;
 *                        Cmd/Ctrl-click on a card flips selection B.
 *
 * The hook `useCortexModels()` is endpoint-aware: if `/cortex/models` 404s or
 * errors, it falls back to a curated list so the UI is never empty.
 */

import * as React from 'react';
import apiClient from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

export type ModelCapability =
  | 'code'
  | 'chat'
  | 'reasoning'
  | 'multilingual'
  | 'embedding';

export type ModelCostTier = 'cheap' | 'standard' | 'premium';

export type ModelFamily =
  | 'anthropic'
  | 'snowflake'
  | 'mistral'
  | 'meta'
  | 'deepseek'
  | (string & {}); // allow forward-compat without losing autocomplete

export interface ModelInfo {
  id: string;
  label?: string;
  family?: ModelFamily;
  size?: string;
  capabilities?: ModelCapability[];
  costTier?: ModelCostTier;
  badge?: string;
}

export interface ModelRecommendations {
  code?: string;
  cheap?: string;
  multilingual?: string;
  reasoning?: string;
}

export interface ModelSelectorProps {
  models: ModelInfo[];
  recommendations?: ModelRecommendations;
  /** Show only models whose `capabilities` include this entry. */
  filterCapability?: ModelCapability;
  selected: string;
  onChange: (modelId: string) => void;
  /** Second selection for QA A/B mode. When provided, renders a 2-col compare strip. */
  selectedB?: string;
  onChangeB?: (modelId: string) => void;
  /** Hide premium tier for non-orgadmin. */
  hidePremium?: boolean;
  /** Compact dropdown instead of grid (use in headers). */
  compact?: boolean;
  className?: string;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Fallback catalog — used when `/cortex/models` is unreachable.
 * ────────────────────────────────────────────────────────────────────────── */

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    family: 'anthropic',
    capabilities: ['code', 'chat', 'reasoning'],
    costTier: 'premium',
    badge: 'NEW',
  },
  {
    id: 'claude-sonnet-4-5',
    label: 'Claude Sonnet 4.5',
    family: 'anthropic',
    capabilities: ['code', 'chat', 'reasoning'],
    costTier: 'standard',
  },
  {
    id: 'mistral-large2',
    label: 'Mistral Large 2',
    family: 'mistral',
    capabilities: ['chat', 'multilingual'],
    costTier: 'standard',
  },
  {
    id: 'mistral-7b',
    label: 'Mistral 7B',
    family: 'mistral',
    size: '7B',
    capabilities: ['chat'],
    costTier: 'cheap',
  },
  {
    id: 'llama3.1-405b',
    label: 'Llama 3.1 405B',
    family: 'meta',
    size: '405B',
    capabilities: ['chat', 'reasoning'],
    costTier: 'premium',
  },
  {
    id: 'snowflake-llama3.3-405b',
    label: 'Snowflake Llama 3.3 405B',
    family: 'snowflake',
    size: '405B',
    capabilities: ['chat', 'reasoning'],
    costTier: 'premium',
  },
  {
    id: 'deepseek-r1',
    label: 'DeepSeek R1',
    family: 'deepseek',
    capabilities: ['reasoning', 'code'],
    costTier: 'standard',
  },
  {
    id: 'e5-base-v2',
    label: 'E5 Base v2',
    family: 'snowflake',
    capabilities: ['embedding'],
    costTier: 'cheap',
  },
];

export const FALLBACK_RECOMMENDATIONS: ModelRecommendations = {
  code: 'claude-opus-4-6',
  cheap: 'mistral-7b',
  multilingual: 'mistral-large2',
  reasoning: 'deepseek-r1',
};

/* ──────────────────────────────────────────────────────────────────────────
 * Hook
 * ────────────────────────────────────────────────────────────────────────── */

interface CortexModelsResponse {
  models?: ModelInfo[];
  recommendations?: ModelRecommendations;
}

export function useCortexModels(): {
  models: ModelInfo[];
  recommendations: ModelRecommendations;
  loading: boolean;
  error: string | null;
} {
  const [models, setModels] = React.useState<ModelInfo[]>(FALLBACK_MODELS);
  const [recommendations, setRecommendations] = React.useState<ModelRecommendations>(
    FALLBACK_RECOMMENDATIONS
  );
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiClient.get<CortexModelsResponse | ModelInfo[]>('/cortex/models');
        if (cancelled) return;

        // Backend may return either `{ models, recommendations }` or a bare array.
        const data = res.data;
        const list = Array.isArray(data) ? data : data?.models;
        const recs = Array.isArray(data) ? undefined : data?.recommendations;

        if (Array.isArray(list) && list.length > 0) {
          setModels(list);
          if (recs) setRecommendations(recs);
          setError(null);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        // 404 is expected while G9 is in flight — silently use fallback.
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status !== 404) {
          setError(
            err instanceof Error ? err.message : 'Failed to load Cortex models'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { models, recommendations, loading, error };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Visual primitives
 * ────────────────────────────────────────────────────────────────────────── */

const COST_DOT: Record<ModelCostTier, string> = {
  cheap: 'bg-emerald-500',
  standard: 'bg-amber-500',
  premium: 'bg-rose-500',
};

const COST_LABEL: Record<ModelCostTier, string> = {
  cheap: 'Cheap',
  standard: 'Standard',
  premium: 'Premium',
};

function CostDot({ tier }: { tier?: ModelCostTier }): React.ReactElement | null {
  if (!tier) return null;
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', COST_DOT[tier])}
      aria-label={`${COST_LABEL[tier]} cost tier`}
      title={`${COST_LABEL[tier]} cost`}
    />
  );
}

function CapabilityChip({ cap }: { cap: ModelCapability }): React.ReactElement {
  return (
    <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {cap}
    </span>
  );
}

function modelDisplay(m: ModelInfo): string {
  return m.label ?? m.id;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Card (grid mode tile)
 * ────────────────────────────────────────────────────────────────────────── */

interface CardProps {
  model: ModelInfo;
  isSelected: boolean;
  isSelectedB: boolean;
  isRecommended: boolean;
  onPick: (modelId: string, ab: 'A' | 'B') => void;
  abEnabled: boolean;
}

function ModelCard({
  model,
  isSelected,
  isSelectedB,
  isRecommended,
  onPick,
  abEnabled,
}: CardProps): React.ReactElement {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    const ab: 'A' | 'B' = abEnabled && (e.metaKey || e.ctrlKey) ? 'B' : 'A';
    onPick(model.id, ab);
  };

  const ariaPressed = isSelected || isSelectedB;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={ariaPressed}
      className={cn(
        'group relative flex h-full flex-col gap-2 rounded-lg border p-3 text-left transition-all',
        isSelected
          ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-200 dark:border-purple-500 dark:bg-purple-900/20 dark:ring-purple-900/40'
          : isSelectedB
            ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200 dark:border-sky-500 dark:bg-sky-900/20 dark:ring-sky-900/40'
            : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
      )}
    >
      {isRecommended && (
        <span className="absolute -top-2 right-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 shadow-sm">
          Recommended
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              'truncate text-sm font-medium',
              isSelected
                ? 'text-purple-700 dark:text-purple-300'
                : isSelectedB
                  ? 'text-sky-700 dark:text-sky-300'
                  : 'text-slate-700 dark:text-slate-200'
            )}
            title={model.id}
          >
            {modelDisplay(model)}
          </div>
          <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {model.id}
            {model.size ? ` · ${model.size}` : ''}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <CostDot tier={model.costTier} />
          {model.badge && (
            <Badge variant="secondary" className="text-[10px]">
              {model.badge}
            </Badge>
          )}
        </div>
      </div>

      {model.capabilities && model.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {model.capabilities.map((c) => (
            <CapabilityChip key={c} cap={c} />
          ))}
        </div>
      )}

      {isSelected && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
          Selected · A
        </span>
      )}
      {isSelectedB && !isSelected && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
          Selected · B
        </span>
      )}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Compact dropdown
 * ────────────────────────────────────────────────────────────────────────── */

interface CompactProps {
  models: ModelInfo[];
  selected: string;
  onChange: (modelId: string) => void;
  ariaLabel?: string;
}

function CompactPicker({
  models,
  selected,
  onChange,
  ariaLabel,
}: CompactProps): React.ReactElement {
  const current = models.find((m) => m.id === selected);
  return (
    <Select value={selected} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel ?? 'Select model'} className="min-w-[200px]">
        <SelectValue placeholder="Select a model">
          {current && (
            <span className="inline-flex items-center gap-2">
              <CostDot tier={current.costTier} />
              <span className="truncate">{modelDisplay(current)}</span>
              {current.badge && (
                <Badge variant="secondary" className="text-[10px]">
                  {current.badge}
                </Badge>
              )}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="inline-flex items-center gap-2">
              <CostDot tier={m.costTier} />
              <span>{modelDisplay(m)}</span>
              {m.badge && (
                <Badge variant="secondary" className="text-[10px]">
                  {m.badge}
                </Badge>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * ModelSelector
 * ────────────────────────────────────────────────────────────────────────── */

function recommendedFor(
  recs: ModelRecommendations | undefined,
  filter: ModelCapability | undefined
): string | undefined {
  if (!recs || !filter) return recs?.code ?? recs?.reasoning ?? recs?.cheap;
  if (filter === 'code') return recs.code;
  if (filter === 'reasoning') return recs.reasoning;
  if (filter === 'multilingual') return recs.multilingual;
  return recs.code ?? recs.reasoning ?? recs.cheap;
}

export function ModelSelector({
  models,
  recommendations,
  filterCapability,
  selected,
  onChange,
  selectedB,
  onChangeB,
  hidePremium,
  compact,
  className,
}: ModelSelectorProps): React.ReactElement {
  const [showFiltered, setShowFiltered] = React.useState(false);

  const abEnabled = typeof selectedB === 'string' && typeof onChangeB === 'function';

  // Apply premium gating first (policy), then capability filter (UX).
  const allowedByPolicy = React.useMemo(
    () => (hidePremium ? models.filter((m) => m.costTier !== 'premium') : models),
    [models, hidePremium]
  );

  const matchesCapability = React.useCallback(
    (m: ModelInfo) =>
      !filterCapability ? true : (m.capabilities ?? []).includes(filterCapability),
    [filterCapability]
  );

  const visible = React.useMemo(
    () =>
      showFiltered
        ? allowedByPolicy
        : allowedByPolicy.filter(matchesCapability),
    [allowedByPolicy, matchesCapability, showFiltered]
  );

  const hiddenCount = allowedByPolicy.length - visible.length;
  const recommendedId = recommendedFor(recommendations, filterCapability);

  // Pre-select the recommendation if nothing is currently selected.
  React.useEffect(() => {
    if (!selected && recommendedId) {
      const exists = allowedByPolicy.some((m) => m.id === recommendedId);
      if (exists) onChange(recommendedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedId, selected]);

  const handlePick = React.useCallback(
    (id: string, ab: 'A' | 'B') => {
      if (ab === 'B' && abEnabled) {
        onChangeB!(id);
      } else {
        onChange(id);
      }
    },
    [onChange, onChangeB, abEnabled]
  );

  /* ── A/B compare strip ──────────────────────────────────────────────── */
  if (abEnabled) {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
              Model A
            </div>
            <ModelSelector
              models={models}
              recommendations={recommendations}
              filterCapability={filterCapability}
              selected={selected}
              onChange={onChange}
              hidePremium={hidePremium}
              compact={compact}
            />
          </div>
          <div className="hidden items-center justify-center md:flex">
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-200">
              vs
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
              Model B
            </div>
            <ModelSelector
              models={models}
              recommendations={recommendations}
              filterCapability={filterCapability}
              selected={selectedB!}
              onChange={onChangeB!}
              hidePremium={hidePremium}
              compact={compact}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Tip: in single mode, Cmd/Ctrl-click a card to set it as Model B.
        </p>
      </div>
    );
  }

  /* ── Compact dropdown ───────────────────────────────────────────────── */
  if (compact) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <CompactPicker models={visible} selected={selected} onChange={onChange} />
        {hiddenCount > 0 && !showFiltered && (
          <button
            type="button"
            onClick={() => setShowFiltered(true)}
            className="self-start text-[11px] text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            [{hiddenCount} hidden] show all
          </button>
        )}
      </div>
    );
  }

  /* ── Grid (default) ─────────────────────────────────────────────────── */
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => (
          <ModelCard
            key={m.id}
            model={m}
            isSelected={m.id === selected}
            isSelectedB={abEnabled && m.id === selectedB}
            isRecommended={m.id === recommendedId}
            onPick={handlePick}
            abEnabled={abEnabled}
          />
        ))}
      </div>
      {visible.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No models match the current filter.
        </div>
      )}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowFiltered((v) => !v)}
          className="self-start text-[11px] text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {showFiltered ? 'Hide non-matching models' : `[${hiddenCount} hidden] show all`}
        </button>
      )}
    </div>
  );
}

export default ModelSelector;
