'use client';

/**
 * ConnectorPromptBar — prompt-first, inline (no popup) entry point to create
 * a connection. Describe the source in plain language; the backend wizard
 * (POST /connect/wizard/suggest — Cortex with an honest keyword fallback)
 * picks the best connector, prefills its config and estimates cost. One click
 * routes into that connector's stepped form. Every suggestion is evented
 * backend-side (CONNECT / WIZARD_SUGGEST).
 *
 * Responsive-first: single fluid column, full-width inputs, wraps on 13"
 * @100% zoom and below — no fixed widths, no modal.
 */

import { useState, FormEvent } from 'react';
import { Button, Text, Badge } from 'rizzui';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { wizardSuggestConnector, type WizardSuggestion } from './connectionServices';

/** Catalog connector_type → picker card id (only families with a live form). */
const TYPE_TO_PICKER: Record<string, string> = {
  snowflake: 'snowflake',
  s3: 'aws',
  azure_blob: 'azure',
  gcs: 'gcs',
  postgresql: 'postgres',
  mysql: 'mysql',
  oracle: 'oracle',
  databricks: 'databricks',
  iceberg: 'iceberg',
  rest_api: 'custom_api',
};

interface Props {
  onUse: (pickerId: string, suggestion: WizardSuggestion) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export default function ConnectorPromptBar({ onUse, disabled, disabledReason }: Props) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<WizardSuggestion | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const desc = description.trim();
    if (!desc || loading) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      setSuggestion(await wizardSuggestConnector(desc));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suggestion failed');
    } finally {
      setLoading(false);
    }
  };

  const pickerId = suggestion ? TYPE_TO_PICKER[suggestion.connector_type] : undefined;
  const cost = suggestion?.cost_estimate;
  const costLabel =
    cost && cost.est_credits_low != null && cost.est_credits_high != null
      ? `~${cost.est_credits_low}–${cost.est_credits_high} credits`
      : null;

  return (
    <div className="w-full rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 to-blue-50/60 p-4 backdrop-blur-sm dark:border-indigo-800/40 dark:from-indigo-950/40 dark:to-blue-950/30 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Describe your source — get the right connector
        </Text>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={disabled || loading}
          placeholder='e.g. "real-time weather from an open API for my dashboards" or "our Postgres orders database"'
          aria-label="Describe your data source"
          className="min-h-[3rem] w-full flex-1 resize-y rounded-lg border border-slate-300 bg-white/90 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100"
        />
        <Button
          type="submit"
          disabled={disabled || loading || !description.trim()}
          title={disabled ? disabledReason : undefined}
          className="w-full shrink-0 sm:w-auto"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Analyzing…
            </span>
          ) : (
            'Suggest connector'
          )}
        </Button>
      </form>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {suggestion && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-white/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/70">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-indigo-600 text-white">{suggestion.label || suggestion.connector_type}</Badge>
            <Badge variant="outline" className="capitalize">{suggestion.confidence} confidence</Badge>
            {costLabel && <Badge variant="outline">{costLabel}</Badge>}
            {suggestion.fallback_used && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-400">keyword match</Badge>
            )}
          </div>
          <Text className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{suggestion.reason}</Text>
          {suggestion.catalog_steps.length > 0 && (
            <Text className="text-[11px] text-slate-500 dark:text-slate-400">
              Steps: {suggestion.catalog_steps.join(' → ')}
            </Text>
          )}
          {pickerId ? (
            <Button
              size="sm"
              className="w-full sm:w-fit"
              disabled={disabled}
              title={disabled ? disabledReason : undefined}
              onClick={() => onUse(pickerId, suggestion)}
            >
              <span className="flex items-center gap-1.5">
                Configure {suggestion.label || suggestion.connector_type}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Button>
          ) : (
            <Text className="text-xs text-amber-700 dark:text-amber-400">
              This connector has no no-code form yet — the families below are ready today.
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
