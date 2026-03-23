'use client';

import { useState } from 'react';
import { Button, Input, Loader, Badge, Modal, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiTag,
  PiMagnifyingGlass,
  PiCheckCircle,
  PiPlus,
  PiCode,
  PiShieldCheck,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';

const PREFIX = '/gouvernance/policies';

// API Functions
async function classifyTable(body: { table_name: string; config?: any }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classify`, body);
  return data;
}

async function extractSemanticCategories(body: { table_name: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/extract-categories`, body);
  return data;
}

async function applySemanticTags(body: { table_name: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/apply-tags`, body);
  return data;
}

async function createCustomClassifier(body: { name: string; database?: string; schema?: string }) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classifiers`, body);
  return data;
}

async function addClassifierRegex(classifierName: string, body: {
  semantic_category: string;
  privacy_category: string;
  regex: string;
  col_regex?: string;
  threshold?: number;
}) {
  const { data } = await apiClient.post(`${PREFIX}/classification/classifiers/${encodeURIComponent(classifierName)}/regex`, body);
  return data;
}

type ActiveSection = 'classify' | 'extract' | 'apply' | 'classifiers';

export default function ClassificationContent() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('classify');

  // Classify
  const [classifyTable_, setClassifyTable] = useState('');
  const [classifyResult, setClassifyResult] = useState<any>(null);
  const [classifying, setClassifying] = useState(false);

  // Extract
  const [extractTable, setExtractTable] = useState('');
  const [extractResult, setExtractResult] = useState<any>(null);
  const [extracting, setExtracting] = useState(false);

  // Apply
  const [applyTable, setApplyTable] = useState('');
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
    regex: '',
    col_regex: '',
    threshold: 0.8,
  });

  const handleClassify = async () => {
    if (!classifyTable_) { toast.error('Enter a table name'); return; }
    setClassifying(true);
    try {
      const result = await classifyTable({ table_name: classifyTable_ });
      setClassifyResult(result.data || result);
      toast.success('Classification complete');
    } catch (err: any) {
      toast.error(err.message || 'Classification failed');
    } finally {
      setClassifying(false);
    }
  };

  const handleExtract = async () => {
    if (!extractTable) { toast.error('Enter a table name'); return; }
    setExtracting(true);
    try {
      const result = await extractSemanticCategories({ table_name: extractTable });
      setExtractResult(result.data || result);
      toast.success('Categories extracted');
    } catch (err: any) {
      toast.error(err.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleApply = async () => {
    if (!applyTable) { toast.error('Enter a table name'); return; }
    setApplying(true);
    try {
      await applySemanticTags({ table_name: applyTable });
      toast.success('Semantic tags applied successfully');
      try { await apiClient.post('/cache/clear/pattern', { pattern: 'cache:*:list_policies_by_type:*' }); } catch {}
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply tags');
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
      try { await apiClient.post('/cache/clear/pattern', { pattern: 'cache:*:list_policies_by_type:*' }); } catch {}
    } catch (err: any) {
      toast.error(err.message || 'Failed to create classifier');
    } finally {
      setCreatingClassifier(false);
    }
  };

  const handleAddRegex = async () => {
    if (!regexForm.classifier_name || !regexForm.semantic_category || !regexForm.privacy_category || !regexForm.regex) {
      toast.error('All required fields must be filled');
      return;
    }
    try {
      await addClassifierRegex(regexForm.classifier_name, {
        semantic_category: regexForm.semantic_category,
        privacy_category: regexForm.privacy_category,
        regex: regexForm.regex,
        col_regex: regexForm.col_regex || undefined,
        threshold: regexForm.threshold,
      });
      toast.success('Regex rule added to classifier');
      setShowAddRegex(false);
      setRegexForm({ classifier_name: '', semantic_category: '', privacy_category: '', regex: '', col_regex: '', threshold: 0.8 });
    } catch (err: any) {
      toast.error(err.message || 'Failed to add regex');
    }
  };

  const SECTIONS = [
    { id: 'classify' as ActiveSection, name: 'Classify Table', icon: PiMagnifyingGlass, color: 'violet' },
    { id: 'extract' as ActiveSection, name: 'Extract Categories', icon: PiTag, color: 'blue' },
    { id: 'apply' as ActiveSection, name: 'Apply Tags', icon: PiCheckCircle, color: 'green' },
    { id: 'classifiers' as ActiveSection, name: 'Custom Classifiers', icon: PiCode, color: 'amber' },
  ];

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
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <PiMagnifyingGlass className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Classify Table</h3>
              <p className="text-sm text-slate-500">Automatically detect sensitive data and PII in table columns</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="DB.SCHEMA.TABLE_NAME"
              value={classifyTable_}
              onChange={(e) => setClassifyTable(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleClassify} disabled={classifying} className="gap-2 bg-violet-600 text-white hover:bg-violet-700">
              {classifying ? <Loader variant="spinner" size="sm" /> : <PiMagnifyingGlass className="w-4 h-4" />}
              Classify
            </Button>
          </div>
          {classifyResult && (
            <div className="mt-4">
              <h4 className="font-medium text-slate-900 dark:text-white mb-2">Classification Results</h4>
              <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-80 text-slate-700 dark:text-slate-300">
                {JSON.stringify(classifyResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Extract Categories Section */}
      {activeSection === 'extract' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <PiTag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Extract Semantic Categories</h3>
              <p className="text-sm text-slate-500">Extract category tags from table columns using Snowflake classification</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="DB.SCHEMA.TABLE_NAME"
              value={extractTable}
              onChange={(e) => setExtractTable(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleExtract} disabled={extracting} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
              {extracting ? <Loader variant="spinner" size="sm" /> : <PiTag className="w-4 h-4" />}
              Extract
            </Button>
          </div>
          {extractResult && (
            <div className="mt-4">
              <h4 className="font-medium text-slate-900 dark:text-white mb-2">Extracted Categories</h4>
              <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-80 text-slate-700 dark:text-slate-300">
                {JSON.stringify(extractResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Apply Tags Section */}
      {activeSection === 'apply' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <PiCheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Apply Semantic Tags</h3>
              <p className="text-sm text-slate-500">Apply extracted semantic category tags to table columns</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="DB.SCHEMA.TABLE_NAME"
              value={applyTable}
              onChange={(e) => setApplyTable(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleApply} disabled={applying} className="gap-2 bg-green-600 text-white hover:bg-green-700">
              {applying ? <Loader variant="spinner" size="sm" /> : <PiCheckCircle className="w-4 h-4" />}
              Apply Tags
            </Button>
          </div>
        </div>
      )}

      {/* Custom Classifiers Section */}
      {activeSection === 'classifiers' && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
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
          <Input label="Classifier Name" placeholder="e.g. my_pii_classifier" value={classifierName} onChange={(e) => setClassifierName(e.target.value)} />
          <Input label="Database (optional)" placeholder="Database" value={classifierDb} onChange={(e) => setClassifierDb(e.target.value)} />
          <Input label="Schema (optional)" placeholder="Schema" value={classifierSchema} onChange={(e) => setClassifierSchema(e.target.value)} />
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
          <Input label="Regex Pattern" placeholder="e.g. \\d{3}-\\d{2}-\\d{4}" value={regexForm.regex} onChange={(e) => setRegexForm({ ...regexForm, regex: e.target.value })} />
          <Input label="Column Name Regex (optional)" placeholder="e.g. .*ssn.*" value={regexForm.col_regex} onChange={(e) => setRegexForm({ ...regexForm, col_regex: e.target.value })} />
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
