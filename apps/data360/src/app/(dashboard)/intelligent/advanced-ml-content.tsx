'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Input, Loader, Badge, Modal, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiGearDuotone,
  PiRocketLaunch,
  PiFilePdf,
  PiChartBar,
  PiTrendUp,
  PiPlus,
  PiTrash,
  PiPlay,
  PiStop,
  PiInfo,
  PiEye,
  PiSparkle,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';

const PREFIX = '/cortex';

// Fine-Tuning API
async function createFineTuneJob(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/finetune`, body); return data; }
async function listFineTuneJobs() { const { data } = await apiClient.get(`${PREFIX}/ml/finetune/jobs`); return data; }
async function describeFineTuneJob(jobId: string) { const { data } = await apiClient.get(`${PREFIX}/ml/finetune/jobs/${encodeURIComponent(jobId)}`); return data; }
async function cancelFineTuneJob(jobId: string) { const { data } = await apiClient.post(`${PREFIX}/ml/finetune/jobs/${encodeURIComponent(jobId)}/cancel`); return data; }

// Document AI API
async function createDocumentAIModel(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/document-ai/models`, body); return data; }
async function listDocumentAIModels() { const { data } = await apiClient.get(`${PREFIX}/ml/document-ai/models`); return data; }
async function predictDocumentAI(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/document-ai/predict`, body); return data; }

// ML Classification API
async function trainClassification(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/classification/train`, body); return data; }
async function predictClassification(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/classification/predict`, body); return data; }
async function listClassificationModels() { const { data } = await apiClient.get(`${PREFIX}/ml/classification/models`); return data; }
async function getClassificationMetrics(model: string) { const { data } = await apiClient.get(`${PREFIX}/ml/classification/${encodeURIComponent(model)}/metrics`); return data; }
async function dropClassificationModel(model: string) { const { data } = await apiClient.delete(`${PREFIX}/ml/classification/${encodeURIComponent(model)}`); return data; }

// Top Insights API
async function createTopInsights(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/top-insights`, body); return data; }
async function analyzeTopInsights(name: string, body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/top-insights/${encodeURIComponent(name)}/analyze`, body); return data; }
async function listTopInsights() { const { data } = await apiClient.get(`${PREFIX}/ml/top-insights`); return data; }

type SubTab = 'finetune' | 'classification' | 'document-ai' | 'top-insights';

const SUB_TABS = [
  { id: 'finetune' as SubTab, label: 'Fine-tuning', icon: PiGearDuotone, color: 'from-amber-500 to-orange-600' },
  { id: 'classification' as SubTab, label: 'ML Classification', icon: PiChartBar, color: 'from-blue-500 to-indigo-600' },
  { id: 'document-ai' as SubTab, label: 'Document AI', icon: PiFilePdf, color: 'from-red-500 to-pink-600' },
  { id: 'top-insights' as SubTab, label: 'Top Insights', icon: PiTrendUp, color: 'from-green-500 to-emerald-600' },
];

export default function AdvancedMLContent() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('finetune');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
          <PiSparkle className="h-7 w-7 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Advanced ML</h2>
          <p className="text-slate-500 dark:text-slate-400">Fine-tuning, classification, document processing & contribution analysis</p>
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
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

      {activeSubTab === 'finetune' && <FineTuningSection />}
      {activeSubTab === 'classification' && <ClassificationSection />}
      {activeSubTab === 'document-ai' && <DocumentAISection />}
      {activeSubTab === 'top-insights' && <TopInsightsSection />}
    </div>
  );
}

// ===== Fine-Tuning Section =====
function FineTuningSection() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ model_name: '', base_model: 'mistral-7b', training_data: '', validation_data: '', max_epochs: 3 });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listFineTuneJobs();
      const raw = result?.data || result?.jobs || result;
      setJobs(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load fine-tune jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleCreate = async () => {
    if (!form.model_name || !form.training_data) { toast.error('Model name and training data are required'); return; }
    setCreating(true);
    try {
      await createFineTuneJob(form);
      toast.success('Fine-tuning job created');
      setShowCreate(false);
      setForm({ model_name: '', base_model: 'mistral-7b', training_data: '', validation_data: '', max_epochs: 3 });
      loadJobs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create job');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('Cancel this fine-tuning job?')) return;
    try {
      await cancelFineTuneJob(jobId);
      toast.success('Job cancelled');
      loadJobs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel job');
    }
  };

  const handleDescribe = async (jobId: string) => {
    try {
      const result = await describeFineTuneJob(jobId);
      setDetail(result.data || result);
      setShowDetail(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to describe job');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fine-Tuning Jobs</h3>
        <Button onClick={() => setShowCreate(true)} className="gap-2 bg-amber-600 text-white hover:bg-amber-700">
          <PiPlus className="w-4 h-4" /> New Fine-Tune Job
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader variant="spinner" size="lg" /></div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiGearDuotone className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No fine-tuning jobs found</p>
          <p className="text-sm mt-1">Create a new job to fine-tune a Cortex LLM</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white">{job.model_name || job.name || job.MODEL_NAME || 'Job'}</h4>
                <p className="text-sm text-slate-500 mt-0.5">Base: {job.base_model || job.BASE_MODEL || '-'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={job.status === 'COMPLETED' || job.STATUS === 'COMPLETED' ? 'bg-green-100 text-green-800' : job.status === 'RUNNING' || job.STATUS === 'RUNNING' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}>
                  {job.status || job.STATUS || 'UNKNOWN'}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => handleDescribe(job.id || job.job_id || job.JOB_ID)}>
                  <PiInfo className="w-4 h-4" />
                </Button>
                {(job.status === 'RUNNING' || job.STATUS === 'RUNNING') && (
                  <Button variant="outline" size="sm" onClick={() => handleCancel(job.id || job.job_id || job.JOB_ID)} className="text-red-600">
                    <PiStop className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Fine-Tuning Job</h3>
          <Input label="Model Name" placeholder="my_finetuned_model" value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} />
          <Input label="Base Model" placeholder="mistral-7b" value={form.base_model} onChange={(e) => setForm({ ...form, base_model: e.target.value })} />
          <Textarea label="Training Data (SQL or table ref)" placeholder="SELECT prompt, completion FROM training_data" value={form.training_data} onChange={(e) => setForm({ ...form, training_data: e.target.value })} rows={3} />
          <Input label="Validation Data (optional)" placeholder="SQL query or table reference" value={form.validation_data} onChange={(e) => setForm({ ...form, validation_data: e.target.value })} />
          <Input label="Max Epochs" type="number" value={String(form.max_epochs)} onChange={(e) => setForm({ ...form, max_epochs: parseInt(e.target.value) || 3 })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-amber-600 text-white hover:bg-amber-700">
              {creating ? <Loader variant="spinner" size="sm" /> : 'Start Training'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Job Details</h3>
          <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-96 text-slate-700 dark:text-slate-300">
            {JSON.stringify(detail, null, 2)}
          </pre>
          <Button variant="outline" onClick={() => setShowDetail(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

// ===== ML Classification Section =====
function ClassificationSection() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrain, setShowTrain] = useState(false);
  const [trainForm, setTrainForm] = useState({ model_name: '', training_table: '', target_column: '', database: '', schema: '' });
  const [training, setTraining] = useState(false);
  const [showPredict, setShowPredict] = useState(false);
  const [predictForm, setPredictForm] = useState({ model_name: '', input_table: '', database: '', schema: '' });
  const [metrics, setMetrics] = useState<any>(null);
  const [showMetrics, setShowMetrics] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listClassificationModels();
      const raw = result?.data || result?.models || result;
      setModels(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const handleTrain = async () => {
    if (!trainForm.model_name || !trainForm.training_table || !trainForm.target_column) {
      toast.error('Model name, training table, and target column are required');
      return;
    }
    setTraining(true);
    try {
      await trainClassification({
        ...trainForm,
        database: trainForm.database || undefined,
        schema: trainForm.schema || undefined,
        evaluate: true,
      });
      toast.success('Classification model training started');
      setShowTrain(false);
      loadModels();
    } catch (err: any) {
      toast.error(err.message || 'Training failed');
    } finally {
      setTraining(false);
    }
  };

  const handlePredict = async () => {
    if (!predictForm.model_name || !predictForm.input_table) { toast.error('Model name and input table are required'); return; }
    try {
      const result = await predictClassification({
        ...predictForm,
        database: predictForm.database || undefined,
        schema: predictForm.schema || undefined,
      });
      toast.success('Prediction complete');
      setShowPredict(false);
    } catch (err: any) {
      toast.error(err.message || 'Prediction failed');
    }
  };

  const handleViewMetrics = async (model: string) => {
    try {
      const result = await getClassificationMetrics(model);
      setMetrics(result.data || result);
      setShowMetrics(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load metrics');
    }
  };

  const handleDrop = async (model: string) => {
    if (!confirm(`Drop classification model "${model}"?`)) return;
    try {
      await dropClassificationModel(model);
      toast.success('Model dropped');
      loadModels();
    } catch (err: any) {
      toast.error(err.message || 'Failed to drop model');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">ML Classification Models</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPredict(true)} className="gap-2">
            <PiPlay className="w-4 h-4" /> Predict
          </Button>
          <Button onClick={() => setShowTrain(true)} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
            <PiPlus className="w-4 h-4" /> Train Model
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader variant="spinner" size="lg" /></div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiChartBar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No classification models found</p>
          <p className="text-sm mt-1">Train a new model from your data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white">{m.name || m.NAME || 'Model'}</h4>
                <p className="text-sm text-slate-500 mt-0.5">{m.created_on || m.CREATED_ON || ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handleViewMetrics(m.name || m.NAME)} className="gap-1">
                  <PiEye className="w-3.5 h-3.5" /> Metrics
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDrop(m.name || m.NAME)} className="gap-1 text-red-600 hover:bg-red-50">
                  <PiTrash className="w-3.5 h-3.5" /> Drop
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showTrain} onClose={() => setShowTrain(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Train Classification Model</h3>
          <Input label="Model Name" value={trainForm.model_name} onChange={(e) => setTrainForm({ ...trainForm, model_name: e.target.value })} />
          <Input label="Training Table" placeholder="DB.SCHEMA.TABLE" value={trainForm.training_table} onChange={(e) => setTrainForm({ ...trainForm, training_table: e.target.value })} />
          <Input label="Target Column" placeholder="label_column" value={trainForm.target_column} onChange={(e) => setTrainForm({ ...trainForm, target_column: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Database (optional)" value={trainForm.database} onChange={(e) => setTrainForm({ ...trainForm, database: e.target.value })} />
            <Input label="Schema (optional)" value={trainForm.schema} onChange={(e) => setTrainForm({ ...trainForm, schema: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowTrain(false)}>Cancel</Button>
            <Button onClick={handleTrain} disabled={training} className="bg-blue-600 text-white hover:bg-blue-700">
              {training ? <Loader variant="spinner" size="sm" /> : 'Train'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPredict} onClose={() => setShowPredict(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Run Prediction</h3>
          <Input label="Model Name" value={predictForm.model_name} onChange={(e) => setPredictForm({ ...predictForm, model_name: e.target.value })} />
          <Input label="Input Table" placeholder="DB.SCHEMA.TABLE" value={predictForm.input_table} onChange={(e) => setPredictForm({ ...predictForm, input_table: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowPredict(false)}>Cancel</Button>
            <Button onClick={handlePredict} className="bg-blue-600 text-white hover:bg-blue-700">Predict</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showMetrics} onClose={() => setShowMetrics(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Model Evaluation Metrics</h3>
          <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-96 text-slate-700 dark:text-slate-300">
            {JSON.stringify(metrics, null, 2)}
          </pre>
          <Button variant="outline" onClick={() => setShowMetrics(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

// ===== Document AI Section =====
function DocumentAISection() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ model_name: '', database: '', schema: '' });
  const [creating, setCreating] = useState(false);
  const [showPredict, setShowPredict] = useState(false);
  const [predictForm, setPredictForm] = useState({ model_name: '', stage: '', file_path: '', database: '', schema: '' });
  const [predictResult, setPredictResult] = useState<any>(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listDocumentAIModels();
      const raw = result?.data || result?.models || result;
      setModels(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const handleCreate = async () => {
    if (!createForm.model_name) { toast.error('Model name is required'); return; }
    setCreating(true);
    try {
      await createDocumentAIModel({ ...createForm, database: createForm.database || undefined, schema: createForm.schema || undefined });
      toast.success('Document AI model created');
      setShowCreate(false);
      setCreateForm({ model_name: '', database: '', schema: '' });
      loadModels();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create model');
    } finally {
      setCreating(false);
    }
  };

  const handlePredict = async () => {
    if (!predictForm.model_name || !predictForm.stage || !predictForm.file_path) {
      toast.error('Model, stage, and file path are required');
      return;
    }
    try {
      const result = await predictDocumentAI({ ...predictForm, database: predictForm.database || undefined, schema: predictForm.schema || undefined });
      setPredictResult(result.data || result);
      toast.success('Document processed');
    } catch (err: any) {
      toast.error(err.message || 'Prediction failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Document AI Models</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPredict(true)} className="gap-2">
            <PiEye className="w-4 h-4" /> Extract from Document
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-red-600 text-white hover:bg-red-700">
            <PiPlus className="w-4 h-4" /> Create Model
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader variant="spinner" size="lg" /></div>
      ) : models.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiFilePdf className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No Document AI models found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {models.map((m: any, i: number) => (
            <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <h4 className="font-medium text-slate-900 dark:text-white">{m.name || m.NAME || 'Model'}</h4>
              <p className="text-sm text-slate-500 mt-1">{m.created_on || m.CREATED_ON || ''}</p>
            </div>
          ))}
        </div>
      )}

      {predictResult && (
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <h4 className="font-medium text-slate-900 dark:text-white mb-2">Extraction Results</h4>
          <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-60 text-slate-700 dark:text-slate-300">
            {JSON.stringify(predictResult, null, 2)}
          </pre>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Create Document AI Model</h3>
          <Input label="Model Name" value={createForm.model_name} onChange={(e) => setCreateForm({ ...createForm, model_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Database (optional)" value={createForm.database} onChange={(e) => setCreateForm({ ...createForm, database: e.target.value })} />
            <Input label="Schema (optional)" value={createForm.schema} onChange={(e) => setCreateForm({ ...createForm, schema: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-red-600 text-white hover:bg-red-700">
              {creating ? <Loader variant="spinner" size="sm" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPredict} onClose={() => setShowPredict(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Extract from Document</h3>
          <Input label="Model Name" value={predictForm.model_name} onChange={(e) => setPredictForm({ ...predictForm, model_name: e.target.value })} />
          <Input label="Stage" placeholder="@my_stage" value={predictForm.stage} onChange={(e) => setPredictForm({ ...predictForm, stage: e.target.value })} />
          <Input label="File Path" placeholder="path/to/document.pdf" value={predictForm.file_path} onChange={(e) => setPredictForm({ ...predictForm, file_path: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowPredict(false)}>Cancel</Button>
            <Button onClick={handlePredict} className="bg-red-600 text-white hover:bg-red-700">Extract</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ===== Top Insights Section =====
function TopInsightsSection() {
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ instance_name: '', database: '', schema: '' });
  const [creating, setCreating] = useState(false);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const [analyzeForm, setAnalyzeForm] = useState({ instance_name: '', input_data: '', label_column: '', metric_column: '', database: '', schema: '' });
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const loadInstances = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTopInsights();
      const raw = result?.data || result?.instances || result;
      setInstances(Array.isArray(raw) ? raw : []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load instances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInstances(); }, [loadInstances]);

  const handleCreate = async () => {
    if (!createForm.instance_name) { toast.error('Instance name is required'); return; }
    setCreating(true);
    try {
      await createTopInsights({ ...createForm, database: createForm.database || undefined, schema: createForm.schema || undefined });
      toast.success('Top Insights instance created');
      setShowCreate(false);
      loadInstances();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create instance');
    } finally {
      setCreating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!analyzeForm.instance_name || !analyzeForm.input_data || !analyzeForm.label_column || !analyzeForm.metric_column) {
      toast.error('All fields are required');
      return;
    }
    try {
      const result = await analyzeTopInsights(analyzeForm.instance_name, {
        ...analyzeForm,
        database: analyzeForm.database || undefined,
        schema: analyzeForm.schema || undefined,
      });
      setAnalysisResult(result.data || result);
      toast.success('Analysis complete');
      setShowAnalyze(false);
    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Insights / Contribution Explorer</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAnalyze(true)} className="gap-2">
            <PiTrendUp className="w-4 h-4" /> Analyze
          </Button>
          <Button onClick={() => setShowCreate(true)} className="gap-2 bg-green-600 text-white hover:bg-green-700">
            <PiPlus className="w-4 h-4" /> New Instance
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader variant="spinner" size="lg" /></div>
      ) : instances.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiTrendUp className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No Top Insights instances found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {instances.map((inst: any, i: number) => (
            <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <h4 className="font-medium text-slate-900 dark:text-white">{inst.name || inst.NAME || 'Instance'}</h4>
              <p className="text-sm text-slate-500 mt-1">{inst.created_on || inst.CREATED_ON || ''}</p>
            </div>
          ))}
        </div>
      )}

      {analysisResult && (
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
          <h4 className="font-medium text-slate-900 dark:text-white mb-2">Analysis Results</h4>
          <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-60 text-slate-700 dark:text-slate-300">
            {JSON.stringify(analysisResult, null, 2)}
          </pre>
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Create Top Insights Instance</h3>
          <Input label="Instance Name" value={createForm.instance_name} onChange={(e) => setCreateForm({ ...createForm, instance_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Database (optional)" value={createForm.database} onChange={(e) => setCreateForm({ ...createForm, database: e.target.value })} />
            <Input label="Schema (optional)" value={createForm.schema} onChange={(e) => setCreateForm({ ...createForm, schema: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-green-600 text-white hover:bg-green-700">
              {creating ? <Loader variant="spinner" size="sm" /> : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAnalyze} onClose={() => setShowAnalyze(false)}>
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-semibold">Run Top Insights Analysis</h3>
          <Input label="Instance Name" value={analyzeForm.instance_name} onChange={(e) => setAnalyzeForm({ ...analyzeForm, instance_name: e.target.value })} />
          <Input label="Input Data" placeholder="DB.SCHEMA.TABLE or SQL query" value={analyzeForm.input_data} onChange={(e) => setAnalyzeForm({ ...analyzeForm, input_data: e.target.value })} />
          <Input label="Label Column" placeholder="Boolean column (FALSE=control, TRUE=test)" value={analyzeForm.label_column} onChange={(e) => setAnalyzeForm({ ...analyzeForm, label_column: e.target.value })} />
          <Input label="Metric Column" placeholder="Non-negative float metric" value={analyzeForm.metric_column} onChange={(e) => setAnalyzeForm({ ...analyzeForm, metric_column: e.target.value })} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowAnalyze(false)}>Cancel</Button>
            <Button onClick={handleAnalyze} className="bg-green-600 text-white hover:bg-green-700">Analyze</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
