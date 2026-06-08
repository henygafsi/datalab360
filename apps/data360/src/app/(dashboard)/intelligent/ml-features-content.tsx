'use client';

import { useState, useEffect } from 'react';
import { Button, Textarea, Loader, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  PiRobotDuotone,
  PiSmileyDuotone,
  PiTranslateDuotone,
  PiTextAlignLeftDuotone,
  PiCopySimple,
  PiArrowsLeftRightBold,
  PiSparkle,
  PiLightningDuotone,
  PiShieldCheckDuotone,
  PiWarningCircle,
} from 'react-icons/pi';

// ── Shared inline error display — replaces error toasts so the failed state
// stays visible next to the action that produced it. ──
function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <PiWarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
      <p className="flex-1 text-sm text-red-700 dark:text-red-300">{message}</p>
      {onRetry && (
        <Button variant="text" size="sm" className="shrink-0" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
import {
  generateCompletion,
  analyzeSentiment,
  translateText,
  summarizeText,
  LLM_MODELS,
  LANGUAGES,
  LLMModel,
  LanguageCode,
  SentimentResult,
  getSentimentColor,
  getSentimentEmoji,
} from '@/app/services/cortex/ml-features';
import { getCortexModels } from '@/app/services/cortex/ai';
import AiCostBadge from './components/AiCostBadge';
import { useTrackAiCharge } from './store/ai-store';
import { useAiCostEstimate } from '@/hooks/useAiCostEstimate';

type TabId = 'ai-assistant' | 'sentiment' | 'translate' | 'summarize';

// ── Dynamic completion-model picker ─────────────────────────────────────────
// House rule: never surface raw vendor model ids. We map the platform's
// *recommended* model per semantic role (resolved live from GET /cortex/models)
// to a friendly label, so the picker tracks the backend catalog (no drift) while
// the customer only ever sees "Fast / Balanced / Reasoning…". Falls back to the
// static LLM_MODELS labels if the catalog is unreachable.
interface ModelOption { value: string; label: string; description: string }

const MODEL_ROLE_LABELS: { role: 'cheap' | 'narrative' | 'reasoning' | 'multilingual' | 'code'; label: string; description: string }[] = [
  { role: 'cheap', label: 'Fast', description: 'Quick answers, lowest cost' },
  { role: 'narrative', label: 'Balanced', description: 'Strong general-purpose quality' },
  { role: 'reasoning', label: 'Reasoning', description: 'Deep reasoning & long context' },
  { role: 'multilingual', label: 'Multilingual', description: 'Best quality across languages' },
  { role: 'code', label: 'Coding', description: 'Optimised for code & structured output' },
];

const STATIC_MODEL_OPTIONS: ModelOption[] = LLM_MODELS.map((m) => ({
  value: m.value,
  label: m.label,
  description: m.description,
}));

function useCompletionModels(): { options: ModelOption[]; loading: boolean } {
  const [options, setOptions] = useState<ModelOption[]>(STATIC_MODEL_OPTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getCortexModels()
      .then((res) => {
        if (!alive) return;
        const rec = res?.data?.recommendations;
        if (!rec) return;
        const seen = new Set<string>();
        const dynamic: ModelOption[] = [];
        for (const { role, label, description } of MODEL_ROLE_LABELS) {
          const id = rec[role];
          if (id && !seen.has(id)) {
            seen.add(id);
            dynamic.push({ value: id, label, description });
          }
        }
        if (dynamic.length) setOptions(dynamic);
      })
      .catch(() => {
        /* keep the static fallback — never block the UI on the catalog */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { options, loading };
}

const TABS = [
  { id: 'ai-assistant' as TabId, label: 'AI Assistant', icon: PiRobotDuotone, color: 'from-purple-500 to-indigo-600' },
  { id: 'sentiment' as TabId, label: 'Sentiment', icon: PiSmileyDuotone, color: 'from-green-500 to-emerald-600' },
  { id: 'translate' as TabId, label: 'Translator', icon: PiTranslateDuotone, color: 'from-blue-500 to-cyan-600' },
  { id: 'summarize' as TabId, label: 'Summarizer', icon: PiTextAlignLeftDuotone, color: 'from-orange-500 to-amber-600' },
];

export default function MLFeaturesContent() {
  const [activeTab, setActiveTab] = useState<TabId>('ai-assistant');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/25">
          <PiLightningDuotone className="h-7 w-7 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI ML Features
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            AI-powered text analysis, translation, and summarization
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-md`
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        {activeTab === 'ai-assistant' && <AIAssistantTab />}
        {activeTab === 'sentiment' && <SentimentTab />}
        {activeTab === 'translate' && <TranslatorTab />}
        {activeTab === 'summarize' && <SummarizerTab />}
      </div>
    </div>
  );
}

// ============================================
// AI ASSISTANT TAB
// ============================================

function AIAssistantTab() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const { options: modelOptions, loading: loadingModels } = useCompletionModels();
  const [model, setModel] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardrails, setGuardrails] = useState(false);
  const trackCharge = useTrackAiCharge();
  const estimate = useAiCostEstimate('cortex_complete', { prompt_chars: prompt.length, model });

  // Default to the first (recommended) model once the catalog resolves; keep the
  // user's choice if they already picked, and re-anchor if it leaves the catalog.
  useEffect(() => {
    if (modelOptions.length === 0) return;
    if (!model || !modelOptions.some((m) => m.value === model)) {
      setModel(modelOptions[0].value);
    }
  }, [modelOptions, model]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await generateCompletion({ prompt, model: model as LLMModel, guardrails });
      setResponse(result.response);
      trackCharge('cortex_complete', estimate.credits, model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate response');
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(response);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
          <PiRobotDuotone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">AI Assistant</h3>
          <p className="text-sm text-slate-500">Ask questions, generate content, and more</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Model Selection */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            Model
            {loadingModels && <Loader className="h-3 w-3 animate-spin text-slate-400" />}
          </label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {modelOptions.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setModel(m.value)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  model === m.value
                    ? 'border-purple-500 bg-purple-50 dark:border-purple-500 dark:bg-purple-900/20'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500'
                }`}
              >
                <div className={`text-sm font-medium ${model === m.value ? 'text-purple-700 dark:text-purple-300' : 'text-slate-700 dark:text-slate-300'}`}>
                  {m.label}
                </div>
                <div className="text-xs text-slate-500">{m.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Cortex Guard Toggle */}
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <button
            type="button"
            onClick={() => setGuardrails(!guardrails)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              guardrails ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              guardrails ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <div className="flex items-center gap-2">
            <PiShieldCheckDuotone className={`h-5 w-5 ${guardrails ? 'text-green-600' : 'text-slate-400'}`} />
            <div>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Content Guard</span>
              <p className="text-xs text-slate-500">{guardrails ? 'Content safety filtering enabled' : 'No content filtering'}</p>
            </div>
          </div>
        </div>

        {/* Prompt Input */}
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Your Prompt
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask anything... e.g., 'Explain data governance in simple terms'"
            rows={4}
            className="w-full"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
          >
            {loading ? (
              <>
                <Loader className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <PiSparkle className="mr-2 h-4 w-4" />
                Generate Response
              </>
            )}
          </Button>
          <AiCostBadge
            featureKey="cortex_complete"
            params={{ prompt_chars: prompt.length, model }}
            size="md"
            showSource
          />
        </div>
      </form>

      {error && <InlineError message={error} onRetry={() => handleSubmit()} />}

      {/* Response */}
      {response && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Response ({modelOptions.find((m) => m.value === model)?.label ?? 'AI'})
            </span>
            <Button size="sm" variant="outline" onClick={copyToClipboard}>
              <PiCopySimple className="mr-1 h-4 w-4" />
              Copy
            </Button>
          </div>
          <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {response}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SENTIMENT TAB
// ============================================

function SentimentTab() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<SentimentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackCharge = useTrackAiCharge();
  const rowCount = input.split('\n').filter((t) => t.trim()).length;
  const estimate = useAiCostEstimate('cortex_sentiment', { rows: rowCount });

  async function handleAnalyze() {
    if (!input.trim()) return;

    const texts = input.split('\n').filter((t) => t.trim());
    if (texts.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const sentiments = await analyzeSentiment(texts);
      setResults(sentiments);
      trackCharge('cortex_sentiment', estimate.credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze sentiment');
    } finally {
      setLoading(false);
    }
  }

  const positiveCount = results.filter((r) => r.sentiment > 0.3).length;
  const negativeCount = results.filter((r) => r.sentiment < -0.3).length;
  const neutralCount = results.length - positiveCount - negativeCount;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + r.sentiment, 0) / results.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
          <PiSmileyDuotone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Sentiment Analysis</h3>
          <p className="text-sm text-slate-500">Analyze text sentiment (one per line for batch)</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Enter text to analyze (one per line for batch analysis)
          </label>
        </div>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="I love this product! It's amazing!&#10;This is terrible, worst experience ever.&#10;It's okay, nothing special."
          rows={6}
          className="w-full"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleAnalyze}
          disabled={loading || !input.trim()}
          className="bg-gradient-to-r from-green-500 to-emerald-600 text-white"
        >
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <PiSmileyDuotone className="mr-2 h-4 w-4" />
              Analyze Sentiment
            </>
          )}
        </Button>
        <AiCostBadge
          featureKey="cortex_sentiment"
          params={{ rows: rowCount }}
          size="md"
          showSource
        />
      </div>

      {error && <InlineError message={error} onRetry={handleAnalyze} />}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl bg-green-50 p-4 dark:bg-green-900/20">
              <div className="text-2xl font-bold text-green-600">{positiveCount}</div>
              <div className="text-sm text-green-700 dark:text-green-400">Positive 😄</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-900/20">
              <div className="text-2xl font-bold text-amber-600">{neutralCount}</div>
              <div className="text-sm text-amber-700 dark:text-amber-400">Neutral 😐</div>
            </div>
            <div className="rounded-xl bg-red-50 p-4 dark:bg-red-900/20">
              <div className="text-2xl font-bold text-red-600">{negativeCount}</div>
              <div className="text-sm text-red-700 dark:text-red-400">Negative 😞</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-700">
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-200">
                {avgScore.toFixed(2)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">Avg Score</div>
            </div>
          </div>

          {/* Individual Results */}
          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700"
              >
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                  {result.text}
                </span>
                <div className="ml-4 flex items-center gap-2">
                  <span className="text-xl">{getSentimentEmoji(result.sentiment)}</span>
                  <Badge
                    style={{ backgroundColor: getSentimentColor(result.sentiment) }}
                    className="text-white"
                  >
                    {result.sentiment.toFixed(2)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// TRANSLATOR TAB
// ============================================

function TranslatorTab() {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [fromLang, setFromLang] = useState<LanguageCode>('en');
  const [toLang, setToLang] = useState<LanguageCode>('fr');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackCharge = useTrackAiCharge();
  const estimate = useAiCostEstimate('cortex_translate', { prompt_chars: sourceText.length });

  async function handleTranslate() {
    if (!sourceText.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await translateText({
        text: sourceText,
        from_language: fromLang,
        to_language: toLang,
      });
      setTranslatedText(result.translated);
      trackCharge('cortex_translate', estimate.credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to translate');
    } finally {
      setLoading(false);
    }
  }

  function swapLanguages() {
    setFromLang(toLang);
    setToLang(fromLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  }

  function copyTranslation() {
    navigator.clipboard.writeText(translatedText);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
          <PiTranslateDuotone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">AI Translator</h3>
          <p className="text-sm text-slate-500">Translate text between languages</p>
        </div>
      </div>

      {/* Language Selector */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            From
          </label>
          <select
            value={fromLang}
            onChange={(e) => setFromLang(e.target.value as LanguageCode)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={swapLanguages}
          className="mt-6 rounded-full bg-slate-100 p-2.5 text-slate-600 transition-all hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        >
          <PiArrowsLeftRightBold className="h-5 w-5" />
        </button>

        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            To
          </label>
          <select
            value={toLang}
            onChange={(e) => setToLang(e.target.value as LanguageCode)}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Text Areas */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Source Text
            </label>
          </div>
          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Enter text to translate..."
            rows={8}
            className="w-full"
          />
          <div className="mt-1 text-xs text-slate-500">
            {sourceText.length} characters
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Translation
          </label>
          <div className="relative">
            <Textarea
              value={translatedText}
              readOnly
              placeholder="Translation will appear here..."
              rows={8}
              className="w-full bg-slate-50 dark:bg-slate-900"
            />
            {translatedText && (
              <button
                onClick={copyTranslation}
                className="absolute right-2 top-2 rounded-lg bg-white p-2 shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <PiCopySimple className="h-4 w-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleTranslate}
          disabled={loading || !sourceText.trim()}
          className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white"
        >
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Translating...
            </>
          ) : (
            <>
              <PiTranslateDuotone className="mr-2 h-4 w-4" />
              Translate
            </>
          )}
        </Button>
        <AiCostBadge
          featureKey="cortex_translate"
          params={{ prompt_chars: sourceText.length }}
          size="md"
          showSource
        />
      </div>

      {error && <InlineError message={error} onRetry={handleTranslate} />}
    </div>
  );
}

// ============================================
// SUMMARIZER TAB
// ============================================

function SummarizerTab() {
  const [inputText, setInputText] = useState('');
  const [maxLength, setMaxLength] = useState(150);
  const [summary, setSummary] = useState<{ text: string; compression: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackCharge = useTrackAiCharge();
  const estimate = useAiCostEstimate('cortex_summarize', { prompt_chars: inputText.length });

  async function handleSummarize() {
    if (!inputText.trim() || inputText.length < 100) {
      setError('Please enter at least 100 characters');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await summarizeText({ text: inputText, max_length: maxLength });
      setSummary({ text: result.summary, compression: result.compression_ratio || '0' });
      trackCharge('cortex_summarize', estimate.credits);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to summarize');
    } finally {
      setLoading(false);
    }
  }

  function copySummary() {
    if (summary) {
      navigator.clipboard.writeText(summary.text);
      toast.success('Copied to clipboard');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
          <PiTextAlignLeftDuotone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Text Summarizer</h3>
          <p className="text-sm text-slate-500">Generate concise summaries of long texts</p>
        </div>
      </div>

      {/* Max Length Control */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Maximum Summary Length: {maxLength} characters
        </label>
        <input
          type="range"
          min={50}
          max={500}
          step={10}
          value={maxLength}
          onChange={(e) => setMaxLength(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>50 (short)</span>
          <span>500 (long)</span>
        </div>
      </div>

      {/* Input */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Original Text
        </label>
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste long text here (minimum 100 characters)..."
          rows={10}
          className="w-full"
        />
        <div className="mt-1 text-xs text-slate-500">
          {inputText.length} characters
          {inputText.length < 100 && inputText.length > 0 && (
            <span className="text-amber-600"> (minimum 100 required)</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSummarize}
          disabled={loading || inputText.length < 100}
          className="bg-gradient-to-r from-orange-500 to-amber-600 text-white"
        >
          {loading ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Summarizing...
            </>
          ) : (
            <>
              <PiTextAlignLeftDuotone className="mr-2 h-4 w-4" />
              Generate Summary
            </>
          )}
        </Button>
        <AiCostBadge
          featureKey="cortex_summarize"
          params={{ prompt_chars: inputText.length }}
          size="md"
          showSource
        />
      </div>

      {error && <InlineError message={error} onRetry={handleSummarize} />}

      {/* Summary Result */}
      {summary && (
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                Summary
              </span>
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                {summary.compression}% compressed
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={copySummary}>
              <PiCopySimple className="mr-1 h-4 w-4" />
              Copy
            </Button>
          </div>
          <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {summary.text}
          </div>
        </div>
      )}
    </div>
  );
}
