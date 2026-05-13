'use client';

import { useState } from 'react';
import { Button, Input, Loader, Modal } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiTag,
  PiMagnifyingGlass,
  PiCheckCircle,
  PiPlus,
  PiCode,
  PiShieldCheck,
  PiArrowClockwise,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';
import { ObjectSelector } from './components/ObjectSelector';

const PREFIX = '/gouvernance/policies';

// Snowflake classification calls (EXTRACT_SEMANTIC_CATEGORIES / ASSOCIATE_SEMANTIC_CATEGORY_TAGS)
// can take several minutes on large tables — override the default timeout.
const CLASSIFICATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// All classification endpoints receive parameters as query strings (not JSON body).
// Backend signatures: `table_name: str = Query(...)`, `name: str = Query(...)`, etc.
async function classifyTable(params: { table_name: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classify`, null, {
    params,
    timeout: CLASSIFICATION_TIMEOUT_MS,
  });
  return data;
}

async function extractSemanticCategories(params: { table_name: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/extract-categories`, null, {
    params,
    timeout: CLASSIFICATION_TIMEOUT_MS,
  });
  return data;
}

async function applySemanticTags(params: { table_name: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/apply-tags`, null, {
    params,
    timeout: CLASSIFICATION_TIMEOUT_MS,
  });
  return data;
}

async function createCustomClassifier(params: { name: string; database?: string; schema?: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classifiers`, null, { params });
  return data;
}

async function addClassifierRegex(classifierName: string, params: {
  semantic_category: string;
  privacy_category: string;
  value_regex: string;
  col_name_regex?: string;
  threshold?: number;
}) {
  const { data } = await apiClient.post(
    `${PREFIX}/classification/classifiers/${encodeURIComponent(classifierName)}/regex`,
    null,
    { params },
  );
  return data;
}

// Normalize FastAPI error payloads. Validation errors come as
// `{ detail: [{ type, loc, msg, ... }, ...] }` — rendering that array
// directly causes the "Objects are not valid as a React child" crash.
function errorMessage(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e: any) => {
      const loc = Array.isArray(e?.loc) ? e.loc.join('.') : '';
      return loc ? `${loc}: ${e?.msg || ''}` : (e?.msg || JSON.stringify(e));
    }).join('; ');
  }
  if (detail && typeof detail === 'object') {
    try { return JSON.stringify(detail); } catch { /* ignore */ }
  }
  return err?.response?.data?.message || err?.message || fallback;
}

type ActiveSection = 'classify' | 'extract' | 'apply' | 'classifiers';

// Helper: DB.SCHEMA.TABLE picker — returns fully-qualified name + allows
// each level to update independently. Resets downstream selections when a
// parent changes.
type Target = { database: string; schema: string; table: string };

function TablePicker({
  value,
  onChange,
  accent,
}: {
  value: Target;
  onChange: (next: Target) => void;
  accent: string; // tailwind token e.g. "violet" / "blue" / "green"
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <ObjectSelector
        level="database"
        value={value.database}
        onSelect={(db) => onChange({ database: db, schema: '', table: '' })}
        label="Database"
      />
      <ObjectSelector
        level="schema"
        database={value.database}
        value={value.schema}
        onSelect={(sc) => onChange({ ...value, schema: sc, table: '' })}
        label="Schema"
        disabled={!value.database}
      />
      <ObjectSelector
        level="table"
        database={value.database}
        schema={value.schema}
        value={value.table}
        onSelect={(tb) => onChange({ ...value, table: tb })}
        label="Table"
        disabled={!value.database || !value.schema}
      />
    </div>
  );
}

function fqn(t: Target): string | null {
  if (!t.database || !t.schema || !t.table) return null;
  return `${t.database}.${t.schema}.${t.table}`;
}

// ─── Classification result renderer ──────────────────────────────────────
// Snowflake EXTRACT_SEMANTIC_CATEGORIES / SYSTEM$CLASSIFY shape:
//   { "<COLUMN>": { semantic_category, privacy_category, alternates: [...], ...}, ... }
// We normalize both nested and flat response shapes.

type ColumnRow = {
  column: string;
  semantic_category?: string | null;
  privacy_category?: string | null;
  confidence?: string | null;
  coverage?: number | null;
  valid_value_ratio?: number | null;
  alternates?: any[];
  extra?: Record<string, any>;
};

// Snowflake's EXTRACT_SEMANTIC_CATEGORIES returns a VARIANT like:
//   {
//     "<COLUMN_NAME>": {
//       "alternates": [...],                          // list of alternate matches
//       "recommendation": {                           // best match (may be absent)
//         "confidence": "HIGH",
//         "coverage": 1,
//         "details": [],
//         "privacy_category": "IDENTIFIER",
//         "semantic_category": "URL"
//       },
//       "valid_value_ratio": 1
//     },
//     ...
//   }
// We flatten the nested "recommendation" so the table can show categories.
function extractColumnMeta(column: string, meta: any): ColumnRow {
  if (!meta || typeof meta !== 'object') {
    return { column, semantic_category: null, privacy_category: null, alternates: [] };
  }
  const rec = (meta.recommendation && typeof meta.recommendation === 'object') ? meta.recommendation : {};
  return {
    column,
    // Prefer nested "recommendation.*" (real Snowflake shape), fall back to flat.
    semantic_category: rec.semantic_category ?? meta.semantic_category ?? null,
    privacy_category: rec.privacy_category ?? meta.privacy_category ?? null,
    confidence: rec.confidence ?? meta.confidence ?? null,
    coverage: typeof rec.coverage === 'number' ? rec.coverage : (typeof meta.coverage === 'number' ? meta.coverage : null),
    valid_value_ratio: typeof meta.valid_value_ratio === 'number' ? meta.valid_value_ratio : null,
    alternates: Array.isArray(meta.alternates) ? meta.alternates : [],
    extra: {},
  };
}

function normalizeColumns(result: any): ColumnRow[] {
  // Unwrap { result: {...} } (classify endpoint) or { categories: [...] } (extract endpoint)
  const body = result?.result ?? result?.categories ?? result;
  if (!body) return [];

  // Case A: already a list (extract endpoint returns Array)
  if (Array.isArray(body)) {
    return body.map((row: any) => {
      const column = row?.column ?? row?.COLUMN_NAME ?? row?.column_name ?? '';
      // Frontend's backend flattener already unwrapped keys at top level in some cases.
      // Still handle nested recommendation the same way.
      return extractColumnMeta(column, row);
    });
  }

  // Case B: dict keyed by column name (classify endpoint)
  if (typeof body === 'object') {
    return Object.entries(body).map(([column, meta]) => extractColumnMeta(column, meta));
  }
  return [];
}

const PRIVACY_BADGE: Record<string, string> = {
  IDENTIFIER:        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  QUASI_IDENTIFIER:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SENSITIVE:         'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const CONFIDENCE_BADGE: Record<string, string> = {
  HIGH:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  LOW:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function ClassificationTable({ rows, emptyHint }: { rows: ColumnRow[]; emptyHint: string }) {
  if (!rows.length) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
        {emptyHint}
      </div>
    );
  }

  const classified = rows.filter((r) => r.semantic_category || r.privacy_category).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-slate-900 dark:text-white">{rows.length} columns analyzed</span>
        <span className="text-slate-400">·</span>
        <span className="text-emerald-600 dark:text-emerald-400">{classified} classified</span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500 dark:text-slate-400">{rows.length - classified} unclassified</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Column</th>
              <th className="px-4 py-3 font-semibold">Semantic Category</th>
              <th className="px-4 py-3 font-semibold">Privacy Category</th>
              <th className="px-4 py-3 font-semibold">Confidence</th>
              <th className="px-4 py-3 font-semibold">Coverage</th>
              <th className="px-4 py-3 font-semibold">Alternates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900">
            {rows.map((r) => {
              const hasClass = r.semantic_category || r.privacy_category;
              const privacyStyle = r.privacy_category ? (PRIVACY_BADGE[r.privacy_category] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300') : '';
              const confidenceStyle = r.confidence ? (CONFIDENCE_BADGE[r.confidence] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400') : '';
              const coveragePct = typeof r.coverage === 'number' ? Math.round(r.coverage * 100) : null;
              return (
                <tr key={r.column} className={hasClass ? '' : 'opacity-60'}>
                  <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-white">{r.column}</td>
                  <td className="px-4 py-3">
                    {r.semantic_category ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-xs font-medium">
                        {r.semantic_category}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.privacy_category ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${privacyStyle}`}>
                        {r.privacy_category}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.confidence ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${confidenceStyle}`}>
                        {r.confidence}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {coveragePct !== null ? (
                      <span className="text-xs text-slate-600 dark:text-slate-300">{coveragePct}%</span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.alternates && r.alternates.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r.alternates.slice(0, 3).map((alt: any, i: number) => {
                          const altLabel = typeof alt === 'string'
                            ? alt
                            : (alt?.semantic_category || alt?.recommendation?.semantic_category || JSON.stringify(alt));
                          return (
                            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs">
                              {altLabel}
                            </span>
                          );
                        })}
                        {r.alternates.length > 3 && (
                          <span className="text-xs text-slate-400">+{r.alternates.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ClassificationContent() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('classify');

  // Classify
  const [classifyTarget, setClassifyTarget] = useState<Target>({ database: '', schema: '', table: '' });
  const [classifyResult, setClassifyResult] = useState<any>(null);
  const [classifying, setClassifying] = useState(false);

  // Extract
  const [extractTarget, setExtractTarget] = useState<Target>({ database: '', schema: '', table: '' });
  const [extractResult, setExtractResult] = useState<any>(null);
  const [extracting, setExtracting] = useState(false);

  // Apply
  const [applyTarget, setApplyTarget] = useState<Target>({ database: '', schema: '', table: '' });
  const [applying, setApplying] = useState(false);

  // Custom Classifier
  const [showCreateClassifier, setShowCreateClassifier] = useState(false);
  const [classifierName, setClassifierName] = useState('');
  const [classifierDb, setClassifierDb] = useState('');
  const [classifierSchema, setClassifierSchema] = useState('');
  const [creatingClassifier, setCreatingClassifier] = useState(false);

  // Add Regex
  const [showAddRegex, setShowAddRegex] = useState(false);
  const [regexForm, setRegexForm] = useState({
    classifier_name: '',
    semantic_category: '',
    privacy_category: '',
    value_regex: '',
    col_name_regex: '',
    threshold: 0.8,
  });

  const handleClassify = async () => {
    const tbl = fqn(classifyTarget);
    if (!tbl) { toast.error('Select database, schema, and table'); return; }
    setClassifying(true);
    setClassifyResult(null);
    try {
      const result = await classifyTable({ table_name: tbl });
      const payload = result.data || result;
      // eslint-disable-next-line no-console
      console.log('[Classify] Raw backend response:', result);
      // eslint-disable-next-line no-console
      console.log('[Classify] Payload used by UI:', payload);
      // eslint-disable-next-line no-console
      console.log('[Classify] Normalized rows for table:', normalizeColumns(payload));
      setClassifyResult(payload);
      toast.success('Classification complete');
    } catch (err: any) {
      toast.error(errorMessage(err, 'Classification failed'));
    } finally {
      setClassifying(false);
    }
  };

  const handleExtract = async () => {
    const tbl = fqn(extractTarget);
    if (!tbl) { toast.error('Select database, schema, and table'); return; }
    setExtracting(true);
    setExtractResult(null);
    try {
      const result = await extractSemanticCategories({ table_name: tbl });
      const payload = result.data || result;
      // eslint-disable-next-line no-console
      console.log('[Extract] Raw backend response:', result);
      // eslint-disable-next-line no-console
      console.log('[Extract] Payload used by UI:', payload);
      // eslint-disable-next-line no-console
      console.log('[Extract] Normalized rows for table:', normalizeColumns(payload));
      setExtractResult(payload);
      toast.success('Categories extracted');
    } catch (err: any) {
      toast.error(errorMessage(err, 'Extraction failed'));
    } finally {
      setExtracting(false);
    }
  };

  const handleApply = async () => {
    const tbl = fqn(applyTarget);
    if (!tbl) { toast.error('Select database, schema, and table'); return; }
    setApplying(true);
    try {
      await applySemanticTags({ table_name: tbl });
      toast.success('Semantic tags applied successfully');
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to apply tags'));
    } finally {
      setApplying(false);
    }
  };

  const handleCreateClassifier = async () => {
    if (!classifierName) { toast.error('Name is required'); return; }
    setCreatingClassifier(true);
    try {
      await createCustomClassifier({
        name: classifierName,
        database: classifierDb || undefined,
        schema: classifierSchema || undefined,
      });
      toast.success('Custom classifier created');
      setShowCreateClassifier(false);
      setClassifierName('');
      setClassifierDb('');
      setClassifierSchema('');
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to create classifier'));
    } finally {
      setCreatingClassifier(false);
    }
  };

  const handleAddRegex = async () => {
    if (!regexForm.classifier_name || !regexForm.semantic_category || !regexForm.privacy_category || !regexForm.value_regex) {
      toast.error('All required fields must be filled');
      return;
    }
    try {
      await addClassifierRegex(regexForm.classifier_name, {
        semantic_category: regexForm.semantic_category,
        privacy_category: regexForm.privacy_category,
        value_regex: regexForm.value_regex,
        col_name_regex: regexForm.col_name_regex || undefined,
        threshold: regexForm.threshold,
      });
      toast.success('Regex rule added to classifier');
      setShowAddRegex(false);
      setRegexForm({ classifier_name: '', semantic_category: '', privacy_category: '', value_regex: '', col_name_regex: '', threshold: 0.8 });
    } catch (err: any) {
      toast.error(errorMessage(err, 'Failed to add regex'));
    }
  };

  const SECTIONS = [
    { id: 'classify' as ActiveSection, name: 'Classify Table', icon: PiMagnifyingGlass },
    { id: 'extract' as ActiveSection, name: 'Extract Categories', icon: PiTag },
    { id: 'apply' as ActiveSection, name: 'Apply Tags', icon: PiCheckCircle },
    { id: 'classifiers' as ActiveSection, name: 'Custom Classifiers', icon: PiCode },
  ];

  const TargetSummary = ({ target }: { target: Target }) => {
    const full = fqn(target);
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Target:</span>
        <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {full || '—'}
        </code>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Section Navigation */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Classify Section */}
      {activeSection === 'classify' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <PiMagnifyingGlass className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Classify Table</h3>
              <p className="text-sm text-slate-500">Automatically detect sensitive data and PII in table columns</p>
            </div>
          </div>

          <TablePicker value={classifyTarget} onChange={setClassifyTarget} accent="violet" />

          <div className="flex items-center justify-between">
            <TargetSummary target={classifyTarget} />
            <div className="flex items-center gap-2">
              {classifyResult && (
                <Button
                  variant="outline"
                  onClick={() => setClassifyResult(null)}
                  className="gap-2"
                >
                  <PiArrowClockwise className="w-4 h-4" /> Clear
                </Button>
              )}
              <Button
                onClick={handleClassify}
                disabled={classifying || !fqn(classifyTarget)}
                className="gap-2 bg-violet-600 text-white hover:bg-violet-700"
              >
                {classifying ? <Loader variant="spinner" size="sm" /> : <PiMagnifyingGlass className="w-4 h-4" />}
                Classify
              </Button>
            </div>
          </div>

          {classifyResult && (
            <div className="mt-2 space-y-2">
              <h4 className="font-medium text-slate-900 dark:text-white">Classification Results</h4>
              <ClassificationTable
                rows={normalizeColumns(classifyResult)}
                emptyHint="No column classifications returned for this table."
              />
            </div>
          )}
        </div>
      )}

      {/* Extract Categories Section */}
      {activeSection === 'extract' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <PiTag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Extract Semantic Categories</h3>
              <p className="text-sm text-slate-500">Extract category tags from table columns using Snowflake classification</p>
            </div>
          </div>

          <TablePicker value={extractTarget} onChange={setExtractTarget} accent="blue" />

          <div className="flex items-center justify-between">
            <TargetSummary target={extractTarget} />
            <div className="flex items-center gap-2">
              {extractResult && (
                <Button
                  variant="outline"
                  onClick={() => setExtractResult(null)}
                  className="gap-2"
                >
                  <PiArrowClockwise className="w-4 h-4" /> Clear
                </Button>
              )}
              <Button
                onClick={handleExtract}
                disabled={extracting || !fqn(extractTarget)}
                className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
              >
                {extracting ? <Loader variant="spinner" size="sm" /> : <PiTag className="w-4 h-4" />}
                Extract
              </Button>
            </div>
          </div>

          {extractResult && (
            <div className="mt-2 space-y-2">
              <h4 className="font-medium text-slate-900 dark:text-white">Extracted Categories</h4>
              <ClassificationTable
                rows={normalizeColumns(extractResult)}
                emptyHint="No semantic categories found for this table."
              />
            </div>
          )}
        </div>
      )}

      {/* Apply Tags Section */}
      {activeSection === 'apply' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <PiCheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Apply Semantic Tags</h3>
              <p className="text-sm text-slate-500">Apply extracted semantic category tags to table columns</p>
            </div>
          </div>

          <TablePicker value={applyTarget} onChange={setApplyTarget} accent="green" />

          <div className="flex items-center justify-between">
            <TargetSummary target={applyTarget} />
            <Button
              onClick={handleApply}
              disabled={applying || !fqn(applyTarget)}
              className="gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              {applying ? <Loader variant="spinner" size="sm" /> : <PiCheckCircle className="w-4 h-4" />}
              Apply Tags
            </Button>
          </div>
        </div>
      )}

      {/* Custom Classifiers Section */}
      {activeSection === 'classifiers' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <PiCode className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Custom Classifiers</h3>
                <p className="text-sm text-slate-500">Create custom classifiers with regex patterns for domain-specific PII</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAddRegex(true)} className="gap-2">
                <PiPlus className="w-4 h-4" /> Add Regex Rule
              </Button>
              <Button onClick={() => setShowCreateClassifier(true)} className="gap-2 bg-amber-600 text-white hover:bg-amber-700">
                <PiPlus className="w-4 h-4" /> New Classifier
              </Button>
            </div>
          </div>
          <div className="text-center py-8">
            <PiShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Create a custom classifier to define regex-based PII detection rules</p>
          </div>
        </div>
      )}

      {/* Create Classifier Modal */}
      <Modal isOpen={showCreateClassifier} onClose={() => setShowCreateClassifier(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Custom Classifier</h3>
          <Input
            label="Classifier Name"
            placeholder="e.g. my_pii_classifier"
            value={classifierName}
            onChange={(e) => setClassifierName(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ObjectSelector
              level="database"
              value={classifierDb}
              onSelect={(db) => { setClassifierDb(db); setClassifierSchema(''); }}
              label="Database (optional)"
            />
            <ObjectSelector
              level="schema"
              database={classifierDb}
              value={classifierSchema}
              onSelect={setClassifierSchema}
              label="Schema (optional)"
              disabled={!classifierDb}
            />
          </div>
          <p className="text-xs text-slate-500">
            Leave database/schema empty to use the governance default location.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreateClassifier(false)}>Cancel</Button>
            <Button onClick={handleCreateClassifier} disabled={creatingClassifier} className="bg-amber-600 text-white hover:bg-amber-700">
              {creatingClassifier ? <Loader variant="spinner" size="sm" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Regex Modal */}
      <Modal isOpen={showAddRegex} onClose={() => setShowAddRegex(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Regex Rule to Classifier</h3>
          <Input label="Classifier Name" placeholder="my_pii_classifier" value={regexForm.classifier_name} onChange={(e) => setRegexForm({ ...regexForm, classifier_name: e.target.value })} />
          <Input label="Semantic Category" placeholder="e.g. US_SSN" value={regexForm.semantic_category} onChange={(e) => setRegexForm({ ...regexForm, semantic_category: e.target.value })} />
          <Input label="Privacy Category" placeholder="e.g. IDENTIFIER" value={regexForm.privacy_category} onChange={(e) => setRegexForm({ ...regexForm, privacy_category: e.target.value })} />
          <Input label="Regex Pattern" placeholder="e.g. \\d{3}-\\d{2}-\\d{4}" value={regexForm.value_regex} onChange={(e) => setRegexForm({ ...regexForm, value_regex: e.target.value })} />
          <Input label="Column Name Regex (optional)" placeholder="e.g. .*ssn.*" value={regexForm.col_name_regex} onChange={(e) => setRegexForm({ ...regexForm, col_name_regex: e.target.value })} />
          <Input label="Threshold" type="number" placeholder="0.8" value={String(regexForm.threshold)} onChange={(e) => setRegexForm({ ...regexForm, threshold: parseFloat(e.target.value) || 0.8 })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowAddRegex(false)}>Cancel</Button>
            <Button onClick={handleAddRegex} className="bg-amber-600 text-white hover:bg-amber-700">Add Rule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
