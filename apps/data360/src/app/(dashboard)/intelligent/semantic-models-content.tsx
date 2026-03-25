'use client';

import { useState, useEffect, memo } from 'react';
import { Button, Input, Modal, Badge, Loader, Select } from 'rizzui';
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
} from 'react-icons/hi2';
import {
  PiDatabase,
  PiFileCode,
  PiDownload,
  PiMagicWand,
} from 'react-icons/pi';
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
  type SemanticModel,
  type SemanticModelContent,
} from '@/app/services/cortex/semantic-models';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';

interface SelectOption {
  value: string;
  label: string;
}

function SemanticModelsContent() {
  const [models, setModels] = useState<SemanticModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState<SemanticModel | null>(null);
  const [modelContent, setModelContent] = useState<SemanticModelContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    loadModels();
  }, []);

  // Load databases when modal opens
  useEffect(() => {
    if (showCreateModal && dbOptions.length === 0) {
      getDatabases()
        .then((dbs) => setDbOptions(dbs.map((d) => ({ value: d, label: d }))))
        .catch(() => {});
    }
  }, [showCreateModal]);

  // Load schemas when database changes
  useEffect(() => {
    if (!database) {
      setSchemaOptions([]);
      return;
    }
    getSchemas(database)
      .then((schemas) => setSchemaOptions(schemas.map((s) => ({ value: s, label: s }))))
      .catch(() => setSchemaOptions([]));
  }, [database]);

  // Load tables when schema changes
  useEffect(() => {
    if (!database || !schema) {
      setTableOptions([]);
      return;
    }
    getTables(database, schema)
      .then((tables) => setTableOptions((Array.isArray(tables) ? tables : []).map((t) => ({ value: t, label: t }))))
      .catch(() => setTableOptions([]));
  }, [database, schema]);

  const loadModels = async () => {
    try {
      setLoading(true);
      const data = await listSemanticModels();
      const modelsArray = Array.isArray(data) ? data : [];
      setModels(modelsArray);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load semantic models');
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewModel = async (model: SemanticModel) => {
    setSelectedModel(model);
    setShowViewModal(true);
    setLoadingContent(true);
    setModelContent(null);

    try {
      const content = await getSemanticModelContent(model.name.replace('.yaml', ''));
      setModelContent(content);
    } catch (error: any) {
      console.error('Error loading model content:', error);
      toast.error(error.message || 'Failed to load model content');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleCreate = async () => {
    if (!modelName.trim()) {
      toast.error('Please provide a model name');
      return;
    }

    if (!yamlContent.trim()) {
      toast.error('Please provide YAML content');
      return;
    }

    // Validate YAML content
    const validation = validateSemanticModelYaml(yamlContent);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid YAML content');
      return;
    }

    setCreating(true);
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
    } catch (error: any) {
      console.error('Error creating semantic model:', error);
      toast.error(error.message || 'Failed to create semantic model');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (model: SemanticModel) => {
    if (!confirm(`Delete semantic model "${model.name}"? This action cannot be undone.`)) return;

    try {
      await deleteSemanticModel(model.name.replace('.yaml', ''));
      toast.success('Model deleted successfully');
      loadModels();
    } catch (error: any) {
      console.error('Error deleting semantic model:', error);
      toast.error(error.message || 'Failed to delete model');
    }
  };

  const handleGenerate = async () => {
    if (!database || !schema) {
      toast.error('Please select a database and schema first');
      return;
    }
    setGenerating(true);
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
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate semantic model');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateAndSave = async () => {
    if (!database || !schema) {
      toast.error('Please select a database and schema first');
      return;
    }
    setGenerating(true);
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
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate and save model');
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
      toast.error(validation.error || 'Invalid YAML');
      return;
    }
    setSaving(true);
    try {
      const modelName = selectedModel.name.replace('.yaml', '');
      await updateSemanticModel(modelName, editContent);
      toast.success('Semantic model updated successfully!');
      setEditing(false);
      // Refresh content
      const content = await getSemanticModelContent(modelName);
      setModelContent(content);
      loadModels();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update model');
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

  // Helper function to format error messages from API responses
  const formatErrorMessage = (error: any, defaultMessage: string): string => {
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;
      if (Array.isArray(detail)) {
        return detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      } else if (typeof detail === 'string') {
        return detail;
      }
    }
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.message) {
      return error.message;
    }
    return defaultMessage;
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PiDatabase className="w-7 h-7 text-violet-600" />
            Semantic Models
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Define YAML-based semantic models for Cortex Analyst natural language queries
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
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/25"
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            Create Model
          </Button>
        </div>
      </div>

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
      ) : models.length === 0 ? (
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
              Create your first semantic model to enable natural language queries with Cortex Analyst.
              Models define your data structure, relationships, and business terminology.
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
            >
              <HiOutlinePlus className="w-5 h-5 mr-2" />
              Create Your First Model
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
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
                      <Badge
                        variant="flat"
                        className="bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs"
                      >
                        YAML Model
                      </Badge>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(model)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    title="Delete model"
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>

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
                    title="Use in Cortex Chat"
                  >
                    <HiOutlineSparkles className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={async () => {
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
                      } catch { toast.error('Failed to download'); }
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

      {/* Create Model Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="xl"
      >
        <div className="p-6 space-y-6">
          {/* Stepper Header */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <HiOutlineCloudArrowUp className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Create Semantic Model
              </h2>
              <div className="flex items-center gap-2 mt-1">
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
                      {createStep > s.step ? '\u2713' : s.step}
                    </div>
                    <span className={`text-xs ${createStep >= s.step ? 'text-violet-600 dark:text-violet-400 font-medium' : 'text-slate-400'}`}>{s.label}</span>
                    {idx < 2 && <span className="text-slate-300 dark:text-slate-600 mx-1">&rarr;</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
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
                  disabled={!database || !schema || generating}
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
                  disabled={!database || !schema || generating}
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
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              variant="outline"
              onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
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
                disabled={creating || !modelName || !yamlContent}
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
          </div>
        </div>
      </Modal>

      {/* View Model Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => { setShowViewModal(false); setEditing(false); }}
        size="xl"
      >
        <div className="p-6 space-y-6">
          {/* Modal Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <HiOutlineDocumentText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {selectedModel?.name.replace('.yaml', '')}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Semantic Model Definition
                </p>
              </div>
            </div>
            {modelContent && (
              <div className="flex gap-2">
                {!editing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStartEdit}
                    className="border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  >
                    <HiOutlineDocumentDuplicate className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={saving}
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
          </div>

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
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500">
              <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p>No content available</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowViewModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default memo(SemanticModelsContent);
