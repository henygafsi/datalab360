'use client';

/**
 * AI Prompt Console — docked NL->SQL analyst.
 *
 * Replaces the popup-driven AI helpers with one docked, three-pane console:
 *   - Left dock:  semantic-model picker (select / generate / validate)
 *   - Center:     prompt -> queryCortex -> SQL + result table + suggestion chips
 *   - Right rail: Recommend | Embeddings demo | History
 *
 * All actions wire EXISTING /cortex/* endpoints; nothing is fictive.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Textarea, Loader, Badge } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  HiOutlinePaperAirplane,
  HiOutlineClipboard,
  HiOutlineSparkles,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineCpuChip,
} from 'react-icons/hi2';
import { PiDatabase, PiCode, PiMagicWand, PiVectorThree, PiClockCounterClockwise, PiLightbulb, PiFlask, PiLightning } from 'react-icons/pi';
import {
  queryCortex,
  type CortexQueryResult,
  getCortexRecommend,
  listCortexConversations,
  getCortexConversation,
  type CortexConversation,
  analystQuery,
  synthesizeRows,
} from '@/app/services/cortex';
import {
  listSemanticModels,
  getSemanticModelContent,
  generateSemanticModel,
  generateAndSaveSemanticModel,
  validateSemanticModelYaml,
  type SemanticModel,
} from '@/app/services/cortex/semantic-models';
import {
  generateEmbeddings,
  listDatabases,
  listSchemas,
  listTables,
  type EmbeddingResult,
  type TableInfo,
} from '@/app/services/cortex/ml-features';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCanPerform } from '@/hooks/useCanPerform';

// ── Types ──────────────────────────────────────────────────────────────

interface ConsoleExchange {
  id: string;
  prompt: string;
  loading: boolean;
  error?: string;
  results?: CortexQueryResult[];
  model?: string;
}

type RightTab = 'recommend' | 'embeddings' | 'synthesize' | 'history';

// ── Helpers ────────────────────────────────────────────────────────────

function uid() {
  return `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Request failed';
}

/** Pull the SQL string from a Cortex result regardless of field naming. */
function resultSql(r: CortexQueryResult): string | undefined {
  return r.query ?? (typeof r.text === 'string' && r.type === 'sql' ? r.text : undefined);
}

/**
 * Map a Cortex Analyst response (executed NL->SQL) into the console's
 * CortexQueryResult[] shape so it flows through the existing renderers.
 * Analyst returns real generated SQL + executed sample rows + columns.
 */
function analystToResults(resp: {
  sql: string | null;
  results?: Array<Record<string, unknown>>;
  text?: string | null;
  method?: string;
}): CortexQueryResult[] {
  const out: CortexQueryResult[] = [];
  if (resp.sql) {
    out.push({ type: 'sql', query: resp.sql, data: Array.isArray(resp.results) ? resp.results : [] });
  } else if (resp.text) {
    out.push({ type: 'text', text: resp.text });
  } else if (Array.isArray(resp.results) && resp.results.length > 0) {
    out.push({ type: 'text', text: resp.method ? `Executed (${resp.method}).` : 'Executed.', data: resp.results });
  }
  return out;
}

/** Cosine similarity between two equal-length vectors. */
function cosine(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ── Result renderer ────────────────────────────────────────────────────

function ResultBlock({
  result,
  onSuggest,
}: {
  result: CortexQueryResult;
  onSuggest: (text: string) => void;
}) {
  const sql = resultSql(result);

  if (sql) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-900 dark:border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-700 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-300">
            <PiCode className="h-3.5 w-3.5" /> Generated SQL
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(sql);
              toast.success('SQL copied');
            }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
          >
            <HiOutlineClipboard className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed text-green-300">{sql}</pre>
      </div>
    );
  }

  if (result.type === 'suggestions' && Array.isArray(result.suggestions)) {
    return (
      <div className="flex flex-wrap gap-2">
        {result.suggestions.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSuggest(s)}
            className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs text-purple-700 hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
          >
            {s}
          </button>
        ))}
      </div>
    );
  }

  if (result.text) {
    return <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{result.text}</p>;
  }

  return null;
}

function DataTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
          <tr>
            {cols.map((c) => (
              <th key={c} className="border-b border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, ri) => (
            <tr key={ri} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
              {cols.map((c) => (
                <td key={c} className="border-b border-gray-100 px-2 py-1 text-gray-700 dark:border-gray-800 dark:text-gray-300">
                  {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function AiPromptConsoleContent() {
  const generatePerm = useCanPerform('cortex', 'generate');
  const canGenerate = generatePerm.allowed || generatePerm.loading;

  // Semantic models
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Validation
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);

  // Generate sub-form
  const [genOpen, setGenOpen] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [genDb, setGenDb] = useState('');
  const [genSchema, setGenSchema] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genYaml, setGenYaml] = useState<string | null>(null);

  // Save-generated-model (close the create loop)
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Console
  const [prompt, setPrompt] = useState('');
  const [exchanges, setExchanges] = useState<ConsoleExchange[]>([]);
  // Analyst mode: when on (and a model is picked), execute NL->SQL and return
  // real generated SQL + sample rows via POST /cortex/analyst/query.
  const [analystMode, setAnalystMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Right rail
  const [rightTab, setRightTab] = useState<RightTab>('recommend');

  // Load semantic models on mount
  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await listSemanticModels();
      setModels(list);
    } catch (e) {
      setModelsError(errMessage(e));
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Auto-scroll console to bottom on new exchange
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [exchanges]);

  // ── Validate selected model (fetch YAML -> client validation) ──
  const handleValidate = useCallback(async () => {
    if (!selectedModel) {
      toast.error('Select a semantic model first');
      return;
    }
    setValidating(true);
    setValidation(null);
    try {
      const content = await getSemanticModelContent(selectedModel);
      const res = validateSemanticModelYaml(content.content);
      setValidation(res);
      if (res.valid) toast.success('Semantic model is valid');
    } catch (e) {
      setValidation({ valid: false, error: errMessage(e) });
    } finally {
      setValidating(false);
    }
  }, [selectedModel]);

  // ── Generate sub-form ──
  const openGenerate = useCallback(async () => {
    setGenOpen((o) => !o);
    if (databases.length === 0) {
      try {
        const dbs = await listDatabases();
        setDatabases(dbs.map((d) => d.name));
      } catch (e) {
        toast.error(errMessage(e));
      }
    }
  }, [databases.length]);

  const onPickDb = useCallback(async (db: string) => {
    setGenDb(db);
    setGenSchema('');
    setSchemas([]);
    if (!db) return;
    try {
      const sc = await listSchemas(db);
      setSchemas(sc.map((s) => s.name));
    } catch (e) {
      toast.error(errMessage(e));
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!genDb || !genSchema) {
      toast.error('Pick a database and schema');
      return;
    }
    setGenerating(true);
    setGenYaml(null);
    try {
      const res = await generateSemanticModel({ database: genDb, schema: genSchema });
      setGenYaml(res.yaml_content ?? '');
      const v = validateSemanticModelYaml(res.yaml_content ?? '');
      setValidation(v);
      toast.success(`Generated model with ${res.tables_count ?? 0} table(s)`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setGenerating(false);
    }
  }, [genDb, genSchema]);

  // ── Save the generated YAML to the stage (close the create loop) ──
  const handleSaveModel = useCallback(async () => {
    if (!genDb || !genSchema) return;
    setSaving(true);
    try {
      const res = await generateAndSaveSemanticModel({ database: genDb, schema: genSchema });
      toast.success(`Saved model "${res.model_name}" to stage`);
      setSaveOpen(false);
      await loadModels();
      if (res.model_name) {
        setSelectedModel(res.model_name);
        setValidation(null);
      }
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setSaving(false);
    }
  }, [genDb, genSchema, loadModels]);

  // ── Run prompt -> queryCortex (interpret) or analystQuery (execute SQL) ──
  const runPrompt = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) return;
      const id = uid();
      const useAnalyst = analystMode && !!selectedModel;
      setExchanges((prev) => [...prev, { id, prompt: q, loading: true, model: selectedModel || undefined }]);
      setPrompt('');
      try {
        if (useAnalyst) {
          const res = await analystQuery({ question: q, semantic_model_file: selectedModel });
          const mapped = analystToResults(res);
          setExchanges((prev) =>
            prev.map((ex) => (ex.id === id ? { ...ex, loading: false, results: mapped } : ex)),
          );
        } else {
          const res = await queryCortex({ prompt: q, semantic_model: selectedModel || undefined });
          setExchanges((prev) =>
            prev.map((ex) => (ex.id === id ? { ...ex, loading: false, results: res.results ?? [] } : ex)),
          );
        }
      } catch (e) {
        setExchanges((prev) =>
          prev.map((ex) => (ex.id === id ? { ...ex, loading: false, error: errMessage(e) } : ex)),
        );
      }
    },
    [selectedModel, analystMode],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runPrompt(prompt);
    }
  };

  const modelOptions = useMemo(() => models.map((m) => m.name), [models]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_320px]">
      {/* ── Left dock: semantic-model picker ── */}
      <aside className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <PiDatabase className="h-4 w-4 text-purple-600" /> Semantic Model
          </h3>
          <button type="button" onClick={loadModels} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Refresh">
            <HiOutlineArrowPath className="h-4 w-4" />
          </button>
        </div>

        {modelsLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
            <Loader size="sm" /> Loading models...
          </div>
        ) : modelsError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{modelsError}</p>
        ) : modelOptions.length === 0 ? (
          <p className="text-xs text-gray-500">— No semantic models. Generate one below.</p>
        ) : (
          <select
            value={selectedModel}
            onChange={(e) => {
              setSelectedModel(e.target.value);
              setValidation(null);
            }}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">No model (free-form)</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={handleValidate} isLoading={validating} disabled={!selectedModel}>
            <HiOutlineCheckCircle className="mr-1.5 h-4 w-4" /> Validate
          </Button>
          {validation && (
            <div
              className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                validation.valid
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              }`}
            >
              {validation.valid ? (
                <HiOutlineCheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <HiOutlineExclamationCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>{validation.valid ? 'Valid semantic model' : validation.error}</span>
            </div>
          )}

          <Button size="sm" variant="flat" onClick={openGenerate}>
            <PiMagicWand className="mr-1.5 h-4 w-4" /> Generate from schema
          </Button>
        </div>

        {genOpen && (
          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
            <select
              value={genDb}
              onChange={(e) => onPickDb(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select database...</option>
              {databases.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={genSchema}
              onChange={(e) => setGenSchema(e.target.value)}
              disabled={!genDb}
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Select schema...</option>
              {schemas.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="w-full"
              onClick={handleGenerate}
              isLoading={generating}
              disabled={!genDb || !genSchema || !canGenerate}
            >
              <HiOutlineSparkles className="mr-1.5 h-4 w-4" /> Generate YAML
            </Button>
            {!canGenerate && !generatePerm.loading && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Your role cannot generate models.</p>
            )}
            {genYaml != null && (
              <pre className="max-h-40 overflow-auto rounded border border-gray-200 bg-white p-2 text-[10px] leading-tight text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                {genYaml || '— empty result'}
              </pre>
            )}
            {genYaml != null && genYaml.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setSaveOpen(true)}
                disabled={!canGenerate}
              >
                <PiDatabase className="mr-1.5 h-4 w-4" /> Save to stage
              </Button>
            )}
          </div>
        )}
      </aside>

      {/* ── Center: console ── */}
      <section className="flex min-h-[520px] flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-gray-700">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
            <HiOutlineCpuChip className="h-4 w-4 text-fuchsia-600" /> AI Prompt Console
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAnalystMode((m) => !m)}
              disabled={!selectedModel}
              title={selectedModel ? 'Execute the generated SQL and return sample rows' : 'Pick a semantic model to enable analyst execution'}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                analystMode && selectedModel
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'border-gray-300 text-gray-500 hover:text-gray-800 dark:border-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <PiLightning className="h-3 w-3" /> Analyst{analystMode && selectedModel ? ' on' : ''}
            </button>
            {selectedModel ? (
              <Badge size="sm" color="primary" variant="flat">
                {selectedModel}
              </Badge>
            ) : (
              <Badge size="sm" variant="flat">
                free-form
              </Badge>
            )}
            {exchanges.length > 0 && (
              <button
                type="button"
                onClick={() => setExchanges([])}
                className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {exchanges.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <HiOutlineCpuChip className="h-10 w-10 opacity-40" />
              <p className="text-sm">Ask a question in natural language.</p>
              <p className="text-xs">Pick a semantic model on the left for grounded SQL, or ask free-form.</p>
            </div>
          ) : (
            exchanges.map((ex) => (
              <div key={ex.id} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-purple-600 px-3 py-2 text-sm text-white">
                    {ex.prompt}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="w-full max-w-[95%] space-y-2 rounded-lg rounded-tl-sm border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                    {ex.loading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Loader size="sm" /> Analyzing...
                      </div>
                    ) : ex.error ? (
                      <p className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                        <HiOutlineExclamationCircle className="h-4 w-4 shrink-0" /> {ex.error}
                      </p>
                    ) : ex.results && ex.results.length > 0 ? (
                      ex.results.map((r, i) => (
                        <div key={i} className="space-y-2">
                          <ResultBlock result={r} onSuggest={(t) => setPrompt(t)} />
                          {Array.isArray(r.data) && r.data.length > 0 && (
                            <DataTable rows={r.data as Array<Record<string, unknown>>} />
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">— No result returned.</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <div className="flex items-end gap-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your data... (Cmd/Ctrl+Enter to run)"
              className="flex-1"
              rows={2}
            />
            <Button onClick={() => runPrompt(prompt)} disabled={!prompt.trim()} aria-label="Send prompt" className="shrink-0">
              <HiOutlinePaperAirplane className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Right rail: recommend / embeddings / history ── */}
      <aside className="flex min-h-[520px] flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {([
            { id: 'recommend' as RightTab, label: 'Advisor', icon: PiLightbulb },
            { id: 'embeddings' as RightTab, label: 'Embeddings', icon: PiVectorThree },
            { id: 'synthesize' as RightTab, label: 'Synthesize', icon: PiFlask },
            { id: 'history' as RightTab, label: 'History', icon: PiClockCounterClockwise },
          ]).map((t) => {
            const Icon = t.icon;
            const active = rightTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setRightTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs font-medium ${
                  active
                    ? 'border-b-2 border-purple-600 text-purple-700 dark:text-purple-300'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {rightTab === 'recommend' && <RecommendPanel />}
          {rightTab === 'embeddings' && <EmbeddingsPanel />}
          {rightTab === 'synthesize' && <SynthesizePanel canGenerate={canGenerate} />}
          {rightTab === 'history' && <HistoryPanel onReplay={(p) => setPrompt(p)} />}
        </div>
      </aside>

      {/* ── Confirm: save generated semantic model to stage ── */}
      <ConfirmDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        variant="warning"
        title="Save semantic model to stage"
        confirmLabel="Generate & save"
        loading={saving}
        onConfirm={handleSaveModel}
        onCancel={() => setSaveOpen(false)}
        body={
          <p className="text-sm">
            Regenerate the semantic model for{' '}
            <span className="font-mono font-semibold">
              {genDb}.{genSchema}
            </span>{' '}
            and write it to the semantic stage. It will then be selectable for grounded NL-to-SQL.
          </p>
        }
      />
    </div>
  );
}

// ── Right-rail: Recommend ──────────────────────────────────────────────

function RecommendPanel() {
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setOut(null);
    try {
      const res = await getCortexRecommend(context.trim() ? { error_context: context.trim() } : {});
      setOut(res.response || '— No recommendation returned.');
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [context]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Paste an error or leave blank for general platform health tips.</p>
      <Textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Optional: paste error context..."
        rows={3}
      />
      <Button size="sm" className="w-full" onClick={run} isLoading={loading}>
        <PiLightbulb className="mr-1.5 h-4 w-4" /> Recommend
      </Button>
      {out != null && (
        <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
          {out}
        </div>
      )}
    </div>
  );
}

// ── Right-rail: Embeddings demo ────────────────────────────────────────

function EmbeddingsPanel() {
  const [text, setText] = useState('annual recurring revenue\nmonthly recurring revenue\ncustomer churn rate');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EmbeddingResult[] | null>(null);

  const run = useCallback(async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast.error('Enter at least one line of text');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const res = await generateEmbeddings(lines);
      setResults(res);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [text]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">One phrase per line. Shows vector size + pairwise similarity.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      <Button size="sm" className="w-full" onClick={run} isLoading={loading}>
        <PiVectorThree className="mr-1.5 h-4 w-4" /> Embed
      </Button>
      {results != null && results.length === 0 && <p className="text-xs text-gray-500">— No embeddings returned.</p>}
      {results != null && results.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] text-gray-500">
            {results.length} vectors x {results[0]?.embedding?.length ?? 0} dims
          </div>
          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-[10px]">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-1.5 py-1 text-left font-semibold text-gray-500">sim</th>
                  {results.map((_, j) => (
                    <th key={j} className="px-1.5 py-1 text-center font-semibold text-gray-500">
                      {j + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((ri, i) => (
                  <tr key={i}>
                    <td className="max-w-[90px] truncate px-1.5 py-1 text-gray-600 dark:text-gray-300" title={ri.text}>
                      {i + 1}. {ri.text}
                    </td>
                    {results.map((rj, j) => {
                      const sim = cosine(ri.embedding, rj.embedding);
                      const intensity = Math.max(0, Math.min(1, sim));
                      return (
                        <td
                          key={j}
                          className="px-1.5 py-1 text-center text-gray-700 dark:text-gray-200"
                          style={{ backgroundColor: `rgba(147, 51, 234, ${intensity * 0.35})` }}
                        >
                          {sim.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Right-rail: Synthesize sample rows ─────────────────────────────────

function SynthesizePanel({ canGenerate }: { canGenerate: boolean }) {
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [db, setDb] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');
  const [nRows, setNRows] = useState(10);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, unknown>> | null>(null);

  // Lazy-load databases on first render
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const dbs = await listDatabases();
        if (active) setDatabases(dbs.map((d) => d.name));
      } catch (e) {
        toast.error(errMessage(e));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onPickDb = useCallback(async (v: string) => {
    setDb(v);
    setSchema('');
    setTable('');
    setSchemas([]);
    setTables([]);
    if (!v) return;
    try {
      const sc = await listSchemas(v);
      setSchemas(sc.map((s) => s.name));
    } catch (e) {
      toast.error(errMessage(e));
    }
  }, []);

  const onPickSchema = useCallback(
    async (v: string) => {
      setSchema(v);
      setTable('');
      setTables([]);
      if (!v || !db) return;
      try {
        const tb = await listTables(db, v);
        setTables(tb);
      } catch (e) {
        toast.error(errMessage(e));
      }
    },
    [db],
  );

  const run = useCallback(async () => {
    if (!db || !schema || !table) {
      toast.error('Pick a database, schema and table');
      return;
    }
    setLoading(true);
    setRows(null);
    try {
      const res = await synthesizeRows({ n_rows: nRows, database: db, schema, table });
      setRows(res.data?.rows ?? []);
      toast.success(`Generated ${res.data?.returned ?? 0} synthetic row(s)`);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [db, schema, table, nRows]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">AI-generate synthetic rows that match a real table's schema. Read-only — nothing is written.</p>
      <select
        value={db}
        onChange={(e) => onPickDb(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">Select database...</option>
        {databases.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        value={schema}
        onChange={(e) => onPickSchema(e.target.value)}
        disabled={!db}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">Select schema...</option>
        {schemas.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={table}
        onChange={(e) => setTable(e.target.value)}
        disabled={!schema}
        className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      >
        <option value="">Select table...</option>
        {tables.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Rows</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={nRows}
          onChange={(e) => setNRows(Math.max(1, Math.min(1000, parseInt(e.target.value, 10) || 1)))}
          className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <Button
        size="sm"
        className="w-full"
        onClick={run}
        isLoading={loading}
        disabled={!db || !schema || !table || !canGenerate}
      >
        <PiFlask className="mr-1.5 h-4 w-4" /> Synthesize rows
      </Button>
      {!canGenerate && <p className="text-[11px] text-amber-600 dark:text-amber-400">Your role cannot generate data.</p>}
      {rows != null && rows.length === 0 && <p className="text-xs text-gray-500">— No rows returned.</p>}
      {rows != null && rows.length > 0 && <DataTable rows={rows} />}
    </div>
  );
}

// ── Right-rail: History ────────────────────────────────────────────────

function HistoryPanel({ onReplay }: { onReplay: (prompt: string) => void }) {
  const [items, setItems] = useState<CortexConversation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCortexConversations(25);
      setItems(res);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      const d = await getCortexConversation(id);
      setDetail(d.response || d.sql || '— No saved response.');
    } catch (e) {
      setDetail(errMessage(e));
    }
  }, [openId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Your recent AI exchanges</span>
        <button type="button" onClick={load} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Refresh">
          <HiOutlineArrowPath className="h-3.5 w-3.5" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
          <Loader size="sm" /> Loading...
        </div>
      ) : error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : !items || items.length === 0 ? (
        <p className="text-xs text-gray-500">— No saved conversations yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li key={c.id} className="rounded-md border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => openDetail(c.id)}
                className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
              >
                <PiClockCounterClockwise className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                <span className="line-clamp-2">{c.preview || c.prompt || c.id}</span>
              </button>
              {openId === c.id && (
                <div className="space-y-1.5 border-t border-gray-100 px-2 py-1.5 dark:border-gray-800">
                  <p className="whitespace-pre-wrap text-[11px] text-gray-600 dark:text-gray-400">
                    {detail === null ? 'Loading...' : detail}
                  </p>
                  {c.prompt && (
                    <button
                      type="button"
                      onClick={() => onReplay(c.prompt)}
                      className="text-[11px] font-medium text-purple-600 hover:underline dark:text-purple-300"
                    >
                      Replay prompt
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
