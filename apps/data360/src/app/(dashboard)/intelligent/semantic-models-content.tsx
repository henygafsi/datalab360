'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Input, Badge, Loader, Select } from 'rizzui';
import { Database as DatabaseIcon, FileText as FileTextIcon } from 'lucide-react';
import { useCanPerform } from '@/hooks/useCanPerform';
import { toast } from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineDocumentText,
  HiOutlineCloudArrowUp,
  HiOutlineEye,
  HiOutlineClipboard,
  HiOutlineSparkles,
  HiOutlineCube,
  HiOutlineCalendar,
  HiOutlineDocumentDuplicate,
  HiOutlineArrowPath,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import {
  PiDatabase,
  PiFileCode,
  PiDownload,
  PiMagicWand,
  PiShieldCheck,
} from 'react-icons/pi';
import { toMessage } from '@/lib/error-messages';
import {
  listSemanticModels,
  getSemanticModelContent,
  createSemanticModel,
  deleteSemanticModel,
  updateSemanticModel,
  generateSemanticModel,
  generateAndSaveSemanticModel,
  formatFileSize,
  formatDate,
  validateSemanticModelYaml,
  checkSemanticModelHealth,
  type SemanticModel,
  type SemanticModelContent,
} from '@/app/services/cortex/semantic-models';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';

interface SelectOption {
  value: string;
  label: string;
}

// Versioned localStorage key for the docked smart-panel's active section.
const PANEL_STORAGE_KEY = 'data360.intelligent.smartPanel.v1';

// ── Inline error display — keeps the failure visible in-flow instead of a
// transient toast that disappears before the user can act on it. ──
function InlineError({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
      <p className="flex-1 text-sm text-red-700 dark:text-red-300">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 dark:hover:text-red-300">
          Dismiss
        </button>
      )}
    </div>
  );
}

function SemanticModelsContent() {
  const searchParams = useSearchParams();

  // System 2 Action-RBAC (module 'cortex', alias backend 'ai_intelligence').
  // Semantic-models registry actions: create, edit, delete, generate (all exist).
  // Fail-open while the allow-set loads (no flash of disabled).
  const createPerm = useCanPerform('cortex', 'create');
  const editPerm = useCanPerform('cortex', 'edit');
  const deletePerm = useCanPerform('cortex', 'delete');
  const generatePerm = useCanPerform('cortex', 'generate');
  const canCreateModel = createPerm.allowed || createPerm.loading;
  const canEditModel = editPerm.allowed || editPerm.loading;
  const canDeleteModel = deletePerm.allowed || deletePerm.loading;
  const canGenerateModel = generatePerm.allowed || generatePerm.loading;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SemanticModel | null>(null);
  const [modelContent, setModelContent] = useState<SemanticModelContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);

  // Inline error state (replaces error toasts)
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Form state for creating model
  const [modelName, setModelName] = useState('');
  const [modelDescription, setModelDescription] = useState('');
  const [yamlContent, setYamlContent] = useState('');

  // Data source picker state
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [dbOptions, setDbOptions] = useState<SelectOption[]>([]);
  const [schemaOptions, setSchemaOptions] = useState<SelectOption[]>([]);
  const [tableOptions, setTableOptions] = useState<SelectOption[]>([]);
  const [generating, setGenerating] = useState(false);
  const [createStep, setCreateStep] = useState(1); // Stepper: 1=Source, 2=Review, 3=Done

  // ── Models via useCacheAwareQuery ──
  const fetchModels = useCallback(async () => {
    const data = await listSemanticModels();
    return Array.isArray(data) ? data : [];
  }, []);
  const { data: models, loading, error: modelsErrorObj, refetch: loadModels } = useCacheAwareQuery<SemanticModel[]>(
    fetchModels,
    { cacheKeys: [CACHE_KEYS.SEMANTIC_MODELS], initialData: [] }
  );
  const modelsError = modelsErrorObj?.message ?? null;

  // ── Monitor: per-model Analyst-readiness (yaml validity + the
  // relationship-PK rule that silently broke retail_dwh_e2e for weeks) ──
  const [modelHealth, setModelHealth] = useState<Record<string, { status: 'ready' | 'broken'; problems: string[] }>>({});
  const [healthChecking, setHealthChecking] = useState(false);
  const handleCheckAllModels = useCallback(async () => {
    if (!models || models.length === 0) return;
    setHealthChecking(true);
    const next: Record<string, { status: 'ready' | 'broken'; problems: string[] }> = {};
    for (const m of models) {
      // One retry on read failure: a transient fetch hiccup during the rapid
      // check-all loop produced a false 'Broken' on first live run — an
      // unreadable model is still reported, but only after two attempts.
      let verdict: { status: 'ready' | 'broken'; problems: string[] } | null = null;
      for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
        try {
          const content = await getSemanticModelContent(m.name.replace('.yaml', ''));
          verdict = checkSemanticModelHealth(content.content ?? '');
        } catch (err) {
          if (attempt === 1) verdict = { status: 'broken', problems: [toMessage(err, 'could not read model')] };
          else await new Promise((r) => setTimeout(r, 800));
        }
      }
      next[m.name] = verdict!;
    }
    setModelHealth(next);
    setHealthChecking(false);
  }, [models]);

  // Load databases when modal opens
  useEffect(() => {
    if (showCreateModal && dbOptions.length === 0) {
      getDatabases()
        .then((dbs) => setDbOptions(dbs.map((d) => ({ value: d, label: d }))))
        .catch((err) => setCreateError(err instanceof Error ? `Could not load databases: ${err.message}` : 'Could not load databases'));
    }
  }, [showCreateModal, dbOptions.length]);

  // Pre-fill database/schema from URL params on first open (additive, defensive).
  // Callers that link to ?tab=semantic-models&database=X&schema=Y get the form
  // pre-seeded without any extra API calls being fired before the modal opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!showCreateModal) return;
    if (database) return; // already picked — do not override
    const urlDb = searchParams.get('database') ?? '';
    const urlSch = searchParams.get('schema') ?? '';
    if (urlDb) setDatabase(urlDb);
    if (urlDb && urlSch) setSchema(urlSch);
  }, [showCreateModal]);

  // Load schemas when database changes
  useEffect(() => {
    if (!database) {
      setSchemaOptions([]);
      return;
    }
    getSchemas(database)
      .then((schemas) => setSchemaOptions(schemas.map((s) => ({ value: s, label: s }))))
      .catch((err) => { setSchemaOptions([]); setCreateError(err instanceof Error ? `Could not load schemas: ${err.message}` : 'Could not load schemas'); });
  }, [database]);

  // Load tables when schema changes
  useEffect(() => {
    if (!database || !schema) {
      setTableOptions([]);
      return;
    }
    getTables(database, schema)
      .then((tables) => setTableOptions((Array.isArray(tables) ? tables : []).map((t) => ({ value: t, label: t }))))
      .catch((err) => { setTableOptions([]); setCreateError(err instanceof Error ? `Could not load tables: ${err.message}` : 'Could not load tables'); });
  }, [database, schema]);

  const handleViewModel = async (model: SemanticModel) => {
    // Mutually exclusive with the create panel — only one docked panel at a time.
    setShowCreateModal(false);
    setSelectedModel(model);
    setShowViewModal(true);
    setLoadingContent(true);
    setModelContent(null);
    setViewError(null);
    setEditError(null);

    try {
      const content = await getSemanticModelContent(model.name.replace('.yaml', ''));
      setModelContent(content);
    } catch (error) {
      setViewError(error instanceof Error ? error.message : 'Failed to load model content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleOpenCreate = () => {
    // Mutually exclusive with the view panel.
    setShowViewModal(false);
    setEditing(false);
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!modelName.trim()) {
      setCreateError('Please provide a model name');
      return;
    }

    if (!yamlContent.trim()) {
      setCreateError('Please provide YAML content');
      return;
    }

    // Validate YAML content
    const validation = validateSemanticModelYaml(yamlContent);
    if (!validation.valid) {
      setCreateError(validation.error || 'Invalid YAML content');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      await createSemanticModel({
        name: modelName.endsWith('.yaml') ? modelName : `${modelName}.yaml`,
        yaml_content: yamlContent,
        description: modelDescription,
      });
      toast.success('Semantic model created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      loadModels();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create semantic model');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (model: SemanticModel) => {
    setDeleteError(null);
    try {
      await deleteSemanticModel(model.name.replace('.yaml', ''));
      toast.success('Model deleted successfully');
      setConfirmDeleteModel(null);
      loadModels();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete model');
    }
  };

  const handleGenerate = async () => {
    if (!database || !schema) {
      setCreateError('Please select a database and schema first');
      return;
    }
    setGenerating(true);
    setCreateError(null);
    try {
      const result = await generateSemanticModel({
        database,
        schema,
        tables: selectedTables.length > 0 ? selectedTables : undefined,
        model_name: modelName || undefined,
        model_description: modelDescription || undefined,
      });
      setYamlContent(result.yaml_content);
      if (!modelName && result.model_name) {
        setModelName(result.model_name);
      }
      toast.success(`Generated from ${result.tables_count} table(s)`);
      setCreateStep(2); // Move to review step
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to generate semantic model');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAndSave = async () => {
    if (!database || !schema) {
      setCreateError('Please select a database and schema first');
      return;
    }
    setGenerating(true);
    setCreateError(null);
    try {
      const result = await generateAndSaveSemanticModel({
        database,
        schema,
        tables: selectedTables.length > 0 ? selectedTables : undefined,
        model_name: modelName || undefined,
        model_description: modelDescription || undefined,
      });
      setYamlContent(result.yaml_content);
      if (!modelName && result.model_name) {
        setModelName(result.model_name);
      }
      toast.success(`Model "${result.model_name}" generated and saved to stage (${result.tables_count} tables)`);
      setCreateStep(3); // Move to done step
      loadModels();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to generate and save model');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyContent = () => {
    if (modelContent?.content) {
      navigator.clipboard.writeText(editing ? editContent : modelContent.content);
      toast.success('YAML content copied to clipboard!');
    }
  };

  const handleStartEdit = () => {
    setEditContent(modelContent?.content || '');
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedModel || !editContent.trim()) return;
    const validation = validateSemanticModelYaml(editContent);
    if (!validation.valid) {
      setEditError(validation.error || 'Invalid YAML');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const name = selectedModel.name.replace('.yaml', '');
      await updateSemanticModel(name, editContent);
      toast.success('Semantic model updated successfully!');
      setEditing(false);
      // Refresh content
      const content = await getSemanticModelContent(name);
      setModelContent(content);
      loadModels();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update model');
    } finally {
      setSaving(false);
    }
  };

  const handleUseInChat = (model: SemanticModel) => {
    const modelName = model.name.replace('.yaml', '');
    window.location.href = `/intelligent?tab=cortex-chat&model=${encodeURIComponent(modelName)}`;
  };

  const resetCreateForm = () => {
    setModelName('');
    setModelDescription('');
    setYamlContent('');
    setDatabase('');
    setSchema('');
    setSelectedTables([]);
    setSchemaOptions([]);
    setTableOptions([]);
    setCreateStep(1);
  };

  const closeCreatePanel = () => { setShowCreateModal(false); resetCreateForm(); };
  const closeViewPanel = () => { setShowViewModal(false); setEditing(false); };

  // Which docked panel (if any) is open. Create takes precedence; the open
  // handlers above keep the two mutually exclusive.
  const panelMode: 'create' | 'view' | null = showCreateModal
    ? 'create'
    : showViewModal
      ? 'view'
      : null;

  // ── Create panel body (was a centered modal) — the whole build form lives in
  // one docked section so the form logic is preserved verbatim. ──
  const createSections: RightTabSection[] = [
    {
      id: 'build',
      icon: DatabaseIcon,
      label: 'Build Model',
      render: () => (
        <div className="space-y-4">
          {/* Stepper */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { step: 1, label: 'Select Source' },
              { step: 2, label: 'Review YAML' },
              { step: 3, label: 'Saved' },
            ].map((s, idx) => (
              <div key={s.step} className="flex items-center gap-1.5">
                <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  createStep >= s.step
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}>
                  {createStep > s.step ? '✓' : s.step}
                </div>
                <span className={`text-xs ${createStep >= s.step ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-slate-400'}`}>{s.label}</span>
                {idx < 2 && <span className="text-slate-300 dark:text-slate-600 mx-1">&rarr;</span>}
              </div>
            ))}
          </div>

          {/* Form */}
          <Input
            label="Model Name"
            placeholder="sales_semantic_model"
            value={modelName}
            onChange={(e) => setModelName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
            suffix=".yaml"
            className="font-mono"
          />

          <Input
            label="Description (Optional)"
            placeholder="Semantic model for sales data analysis"
            value={modelDescription}
            onChange={(e) => setModelDescription(e.target.value)}
          />

          {/* Data Source Pickers */}
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <PiDatabase className="w-4 h-4" />
              Generate from Data Source
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Database"
                options={dbOptions}
                value={database}
                onChange={(opt: any) => {
                  const val = opt?.value || '';
                  setDatabase(val);
                  setSchema('');
                  setSelectedTables([]);
                }}
                placeholder={dbOptions.length === 0 ? 'Loading...' : 'Select database'}
              />
              <Select
                label="Schema"
                options={schemaOptions}
                value={schema}
                onChange={(opt: any) => {
                  setSchema(opt?.value || '');
                  setSelectedTables([]);
                }}
                placeholder={!database ? 'Select database first' : schemaOptions.length === 0 ? 'Loading...' : 'Select schema'}
                disabled={!database}
              />
            </div>
            {database && schema && tableOptions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Tables (optional - leave empty to include all)
                </label>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">
                  {tableOptions.map((t) => {
                    const isSelected = selectedTables.includes(t.value);
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => {
                          setSelectedTables((prev) =>
                            isSelected
                              ? prev.filter((v) => v !== t.value)
                              : [...prev, t.value]
                          );
                        }}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300 font-medium'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-violet-200 dark:hover:border-violet-700'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {selectedTables.length > 0 && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                    {selectedTables.length} table(s) selected
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={!database || !schema || generating || !canGenerateModel}
                title={!canGenerateModel ? 'You lack the "generate" permission on intelligence. Ask an administrator to grant it.' : undefined}
                className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <PiMagicWand className="w-4 h-4 mr-2" />
                    Generate YAML
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateAndSave}
                disabled={!database || !schema || generating || !canGenerateModel}
                title={!canGenerateModel ? 'You lack the "generate" permission on intelligence. Ask an administrator to grant it.' : undefined}
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <HiOutlineCloudArrowUp className="w-4 h-4 mr-2" />
                    Generate & Save
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* YAML Content */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              YAML Content
            </label>
            <textarea
              className="w-full h-72 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              placeholder={`name: my_semantic_model
description: Describe your semantic model

tables:
  - name: MY_TABLE
    base_table:
      database: CP_DATA360
      schema: STAGING
      table: MY_TABLE
    dimensions:
      - name: id
        expr: ID
        data_type: NUMBER`}
            />
            <p className="text-xs text-slate-500 mt-1">
              Generate from a data source above, or write YAML manually
            </p>
          </div>

          {/* Info box */}
          <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/50 rounded-xl p-4">
            <div className="flex gap-3">
              <HiOutlineSparkles className="w-5 h-5 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-violet-900 dark:text-violet-200 mb-1">
                  Semantic Model Guidelines
                </p>
                <ul className="text-violet-700 dark:text-violet-300 space-y-1 text-xs">
                  <li>Define meaningful <strong>synonyms</strong> for columns to improve query understanding</li>
                  <li>Include <strong>descriptions</strong> for tables and columns</li>
                  <li>Specify <strong>data types</strong> for accurate SQL generation</li>
                  <li>Use <strong>time_dimensions</strong> for date/time fields</li>
                </ul>
              </div>
            </div>
          </div>

          {createError && <InlineError message={createError} onDismiss={() => setCreateError(null)} />}
        </div>
      ),
    },
  ];

  const createFooter = (
    <>
      <Button
        variant="outline"
        onClick={closeCreatePanel}
        disabled={creating}
      >
        {createStep === 3 ? 'Close' : 'Cancel'}
      </Button>
      {createStep === 3 && modelName && (
        <Button
          onClick={() => {
            setShowCreateModal(false);
            resetCreateForm();
            window.location.href = `/intelligent?tab=cortex-chat&model=${encodeURIComponent(modelName)}`;
          }}
          className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
        >
          <HiOutlineSparkles className="w-5 h-5 mr-2" />
          Use in Chat
        </Button>
      )}
      {createStep < 3 && (
        <Button
          onClick={handleCreate}
          disabled={creating || !modelName || !yamlContent || !canCreateModel}
          title={!canCreateModel ? 'You lack the "create" permission on intelligence. Ask an administrator to grant it.' : undefined}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
        >
          {creating ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <HiOutlineCloudArrowUp className="w-5 h-5 mr-2" />
              Save to Stage
            </>
          )}
        </Button>
      )}
    </>
  );

  // ── View / Edit panel body (was a centered modal) ──
  const viewSections: RightTabSection[] = [
    {
      id: 'definition',
      icon: FileTextIcon,
      label: 'Definition',
      render: () => (
        <div className="space-y-4">
          {/* Header actions */}
          {modelContent && (
            <div className="flex flex-wrap justify-end gap-2">
              {!editing ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStartEdit}
                  disabled={!canEditModel}
                  title={!canEditModel ? 'You lack the "edit" permission on intelligence. Ask an administrator to grant it.' : undefined}
                  className="border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                >
                  <HiOutlineDocumentDuplicate className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={saving || !canEditModel}
                  title={!canEditModel ? 'You lack the "edit" permission on intelligence. Ask an administrator to grant it.' : undefined}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                >
                  {saving ? <Loader className="w-4 h-4 mr-1 animate-spin" /> : <HiOutlineCloudArrowUp className="w-4 h-4 mr-1" />}
                  Save
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyContent}
                className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
              >
                <HiOutlineClipboard className="w-4 h-4 mr-1" />
                Copy
              </Button>
              {selectedModel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUseInChat(selectedModel)}
                  className="border-fuchsia-200 dark:border-fuchsia-700 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20"
                >
                  <HiOutlineSparkles className="w-4 h-4 mr-1" />
                  Use in Chat
                </Button>
              )}
            </div>
          )}

          {/* Content */}
          {loadingContent ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse" />
                <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-spin">
                  <HiOutlineSparkles className="w-6 h-6 text-white" />
                </div>
              </div>
              <p className="mt-4 text-slate-600 dark:text-slate-400">Loading model content...</p>
            </div>
          ) : modelContent ? (
            <div className="space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Path</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-white truncate" title={modelContent.path}>
                    {modelContent.path}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Size</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatFileSize(selectedModel?.size || 0)}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Last Modified</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {formatDate(selectedModel?.last_modified || '')}
                  </p>
                </div>
              </div>

              {/* YAML Content — Editable or Read-only */}
              <div>
                <label className="flex text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 items-center gap-2">
                  YAML Definition
                  {editing && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px]">Editing</Badge>}
                </label>
                {editing ? (
                  <textarea
                    className="w-full h-96 p-4 border border-violet-300 dark:border-violet-600 rounded-lg bg-slate-900 text-slate-100 font-mono text-sm resize-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                  />
                ) : (
                  <pre className="w-full h-96 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-900 text-slate-100 font-mono text-sm overflow-auto">
                    <code>{modelContent.content}</code>
                  </pre>
                )}
              </div>
              {editError && <InlineError message={editError} onDismiss={() => setEditError(null)} />}
            </div>
          ) : viewError ? (
            <div className="py-8">
              <InlineError message={viewError} onDismiss={() => setViewError(null)} />
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500">
              <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p>No content available</p>
            </div>
          )}
        </div>
      ),
    },
  ];

  const viewFooter = (
    <Button variant="outline" onClick={closeViewPanel}>
      Close
    </Button>
  );

  return (
    <div className="flex items-start gap-6">
      {/* ── Left column: header + list (stays visible alongside the docked panel) ── */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <PiDatabase className="w-7 h-7 text-violet-600" />
              Semantic Models
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Define YAML-based semantic models for natural-language queries
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={loadModels}
              className="border-slate-200 dark:border-slate-700"
            >
              <HiOutlineArrowPath className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={handleCheckAllModels}
              disabled={healthChecking || !models || models.length === 0}
              title="Read every stored model and verify Analyst-readiness (yaml validity + primary keys on relationship tables)"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
            >
              {healthChecking ? <HiOutlineArrowPath className="w-4 h-4 mr-2 animate-spin" /> : <PiShieldCheck className="w-4 h-4 mr-2" />}
              {healthChecking ? 'Checking…' : 'Check all models'}
            </Button>
            <Button
              onClick={handleOpenCreate}
              disabled={!canCreateModel}
              title={!canCreateModel ? 'You lack the "create" permission on intelligence. Ask an administrator to grant it.' : undefined}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25"
            >
              <HiOutlinePlus className="w-5 h-5 mr-2" />
              Create Model
            </Button>
          </div>
        </div>

        {/* List-level errors (delete / download / fetch) surfaced inline */}
        {deleteError && <InlineError message={deleteError} onDismiss={() => setDeleteError(null)} />}
        {downloadError && <InlineError message={downloadError} onDismiss={() => setDownloadError(null)} />}

        {/* Models List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-spin">
                <HiOutlineSparkles className="w-8 h-8 text-white" />
              </div>
            </div>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading semantic models...</p>
          </div>
        ) : modelsError ? (
          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-8 text-center">
            <HiOutlineExclamationTriangle className="w-10 h-10 mx-auto mb-3 text-red-500 dark:text-red-400" />
            <p className="text-sm text-red-700 dark:text-red-300 mb-4">{modelsError}</p>
            <Button variant="outline" onClick={loadModels} className="border-red-200 dark:border-red-800">
              <HiOutlineArrowPath className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (models ?? []).length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-12 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 to-purple-50/50 dark:from-violet-950/20 dark:to-purple-950/20" />
            <div className="relative z-10">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4">
                <PiFileCode className="w-8 h-8 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No Semantic Models Yet
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
                Create your first semantic model to enable natural-language queries.
                Models define your data structure, relationships, and business terminology.
              </p>
              <Button
                onClick={handleOpenCreate}
                disabled={!canCreateModel}
                title={!canCreateModel ? 'You lack the "create" permission on intelligence. Ask an administrator to grant it.' : undefined}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              >
                <HiOutlinePlus className="w-5 h-5 mr-2" />
                Create Your First Model
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(models ?? []).map((model) => (
              <div
                key={model.name}
                className="group relative overflow-hidden rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600 hover:shadow-lg hover:shadow-violet-500/10 transition-all duration-300"
              >
                {/* Card gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 to-purple-500/0 group-hover:from-violet-500/5 group-hover:to-purple-500/5 transition-all duration-300" />

                <div className="relative p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <PiFileCode className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3
                          className="font-semibold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 cursor-pointer transition-colors truncate max-w-[180px]"
                          onClick={() => handleViewModel(model)}
                          title={model.name}
                        >
                          {model.name.replace('.yaml', '')}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="flat"
                            className="bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs"
                          >
                            YAML Model
                          </Badge>
                          {modelHealth[model.name] && (
                            <Badge
                              variant="flat"
                              title={modelHealth[model.name].problems.join(' · ') || 'Analyst-ready'}
                              className={
                                modelHealth[model.name].status === 'ready'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-xs'
                              }
                            >
                              {modelHealth[model.name].status === 'ready' ? 'Analyst-ready' : 'Broken'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmDeleteModel(model.name)}
                      disabled={!canDeleteModel}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                      title={canDeleteModel ? 'Delete model' : 'You lack the "delete" permission on intelligence. Ask an administrator to grant it.'}
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inline delete confirmation */}
                  {confirmDeleteModel === model.name && (
                    <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 mb-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-red-700 dark:text-red-300 font-medium truncate">
                        Delete &ldquo;{model.name.replace('.yaml', '')}&rdquo;? This cannot be undone.
                      </span>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 px-2.5" onClick={() => handleDelete(model)}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2.5 border-red-200 dark:border-red-800" onClick={() => setConfirmDeleteModel(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <HiOutlineCube className="w-4 h-4 text-slate-400" />
                      <span>Size: {formatFileSize(model.size)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                      <HiOutlineCalendar className="w-4 h-4 text-slate-400" />
                      <span>Modified: {formatDate(model.last_modified)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                      onClick={() => handleViewModel(model)}
                    >
                      <HiOutlineEye className="w-4 h-4 mr-1" />
                      View / Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-fuchsia-200 dark:border-fuchsia-700 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20"
                      onClick={() => handleUseInChat(model)}
                      title="Use in AI Chat"
                    >
                      <HiOutlineSparkles className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={async () => {
                        setDownloadError(null);
                        try {
                          const content = await getSemanticModelContent(model.name.replace('.yaml', ''));
                          if (content?.content) {
                            const blob = new Blob([content.content], { type: 'text/yaml' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = model.name;
                            a.click();
                            URL.revokeObjectURL(url);
                          }
                        } catch (err) {
                          setDownloadError(err instanceof Error ? `Failed to download ${model.name}: ${err.message}` : 'Failed to download');
                        }
                      }}
                      title="Download YAML"
                    >
                      <PiDownload className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Docked smart panel (replaces the centered Create / View modals) ── */}
      {panelMode === 'create' && (
        <RightTabPanel
          key="create"
          title="Create Semantic Model"
          subtitle={modelName ? `${modelName}.yaml` : 'Define a YAML semantic model'}
          sections={createSections}
          activeSection="build"
          onSectionChange={() => { /* single section */ }}
          onClose={closeCreatePanel}
          storageKey={PANEL_STORAGE_KEY}
          footer={createFooter}
          widthClassName="w-[480px]"
        />
      )}
      {panelMode === 'view' && (
        <RightTabPanel
          key="view"
          title={selectedModel?.name.replace('.yaml', '') ?? 'Semantic Model'}
          subtitle="Semantic Model Definition"
          sections={viewSections}
          activeSection="definition"
          onSectionChange={() => { /* single section */ }}
          onClose={closeViewPanel}
          storageKey={PANEL_STORAGE_KEY}
          footer={viewFooter}
          widthClassName="w-[520px]"
        />
      )}
    </div>
  );
}

export default memo(SemanticModelsContent);
