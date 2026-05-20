'use client';

/**
 * Cortex prompt-to-code drawer for the SQL/Python script blocks.
 *
 * Isolated in its own file so its heavy deps (`react-hot-toast`, the Cortex
 * `generateCompletion` service) only land in the chunks of the two forms that
 * use it instead of being inlined into all 75 form chunks via `_shared.tsx`.
 */

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X, Loader2, Sparkles, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { generateCompletion } from '@/app/services/cortex/ml-features';

interface AIGenerateDrawerProps {
  open: boolean;
  onClose: () => void;
  language: 'sql' | 'python';
  onGenerated: (code: string) => void;
}

const buildAiPrompt = (language: 'sql' | 'python', userPrompt: string): string => {
  if (language === 'sql') {
    return `Generate ONLY a Snowflake SQL snippet (no markdown, no explanation) for: ${userPrompt}. The block receives upstream CTE as \`{{ input }}\` and writes to \`{{ output }}\`.`;
  }
  return `Generate ONLY a Snowpark Python snippet (no markdown, no explanation) for: ${userPrompt}. The block receives a Snowpark DataFrame named \`df\` and must return a DataFrame.`;
};

// Strip common LLM artefacts (markdown fences, leading prose)
const sanitizeAiCode = (raw: string, language: 'sql' | 'python'): string => {
  let out = (raw || '').trim();
  // Strip ```sql ... ``` or ```python ... ``` or generic ``` fences
  const fence = new RegExp('^```(?:' + language + '|sql|python|snowflake)?\\s*\\n?([\\s\\S]*?)\\n?```\\s*$', 'i');
  const m = out.match(fence);
  if (m && m[1]) out = m[1].trim();
  // Strip stray leading backticks
  if (out.startsWith('```')) out = out.replace(/^```\w*\s*/, '');
  if (out.endsWith('```')) out = out.replace(/```\s*$/, '');
  return out.trim();
};

export const AIGenerateDrawer: React.FC<AIGenerateDrawerProps> = ({ open, onClose, language, onGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPrompt('');
      setGapError(null);
      setIsGenerating(false);
    }
  }, [open]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setGapError(null);
    try {
      const fullPrompt = buildAiPrompt(language, prompt.trim());
      const result = await generateCompletion({ prompt: fullPrompt, model: 'mistral-7b' });
      const code = sanitizeAiCode(result.response, language);
      if (!code) {
        setGapError('Cortex returned an empty response. Try a more specific prompt.');
        return;
      }
      onGenerated(code);
      toast.success('Generated · review before testing');
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cortex unreachable';
      setGapError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Generate ${language.toUpperCase()} with AI`}
      className="mt-2 p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-900/20 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300">
          <Sparkles className="h-4 w-4" />
          Describe what this block should do
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI drawer"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder={
          language === 'sql'
            ? "e.g., 'extract last 24h of orders by store, sum revenue'"
            : "e.g., 'filter rows where status = ACTIVE and add a normalized_email column'"
        }
        className={cn(
          'w-full px-3 py-2 rounded-md border text-sm',
          'bg-white dark:bg-slate-800',
          'text-slate-800 dark:text-slate-100',
          'border-slate-200 dark:border-slate-700',
          'placeholder:text-slate-400',
          'focus:outline-none focus:ring-2 focus:ring-purple-500'
        )}
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            isGenerating || !prompt.trim()
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
        >
          {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {isGenerating ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {gapError && (
        <div className="mt-1 p-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Info className="h-3.5 w-3.5" />
            Backend Gap · Cortex unreachable
          </div>
          <pre className="mt-1 text-[11px] text-amber-700/90 dark:text-amber-200 whitespace-pre-wrap font-mono">
{`Error: ${gapError}

Planned endpoint (G9):
  POST /cortex/code-generate
  body: { language: '${language}', prompt: string, context?: Record<string, unknown> }
  resp: { code: string, model: string, tokens?: number }`}
          </pre>
        </div>
      )}
    </div>
  );
};
