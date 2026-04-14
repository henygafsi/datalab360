'use client';

import { useState, useEffect, useCallback, memo } from 'react';
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
  PiDatabase,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

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

type SubTab = 'model-registry' | 'finetune' | 'classification' | 'document-ai' | 'top-insights';

const SUB_TABS = [
  { id: 'model-registry' as SubTab, label: 'Model Registry', icon: PiDatabase, color: 'from-purple-500 to-violet-600' },
  { id: 'finetune' as SubTab, label: 'Fine-tuning', icon: PiGearDuotone, color: 'from-amber-500 to-orange-600' },
  { id: 'classification' as SubTab, label: 'ML Classification', icon: PiChartBar, color: 'from-blue-500 to-indigo-600' },
  { id: 'document-ai' as SubTab, label: 'Document AI', icon: PiFilePdf, color: 'from-red-500 to-pink-600' },
  { id: 'top-insights' as SubTab, label: 'Top Insights', icon: PiTrendUp, color: 'from-green-500 to-emerald-600' },
];

function AdvancedMLContent() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('model-registry');

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

      {activeSubTab === 'model-registry' && <ModelRegistrySection />}
      {activeSubTab === 'finetune' && <FineTuningSection />}
      {activeSubTab === 'classification' && <ClassificationSection />}
      {activeSubTab === 'document-ai' && <DocumentAISection />}
      {activeSubTab === 'top-insights' && <TopInsightsSection />}
    </div>
  );
}

export default memo(AdvancedMLContent);

// ===== Model Registry Section (unified view of all trained models) =====
function ModelRegistrySection() {
  const toArr = useCallback((v: any, ...keys: string[]) => { for (const k of keys) if (Array.isArray(v?.[k])) return v[k]; return Array.isArray(v) ? v : []; }, []);

  const fetchAllModels = useCallback(async () => {
    const results = await Promise.allSettled([
      listFineTuneJobs(),
      listClassificationModels(),
      listDocumentAIModels(),
      listTopInsights(),
    ]);
    return {
      finetuneJobs: results[0].status === 'fulfilled' ? toArr(results[0].value, 'jobs', 'data') : [],
      classificationModels: results[1].status === 'fulfilled' ? toArr(results[1].value, 'models', 'data') : [],
      documentAIModels: results[2].status === 'fulfilled' ? toArr(results[2].value, 'models', 'data') : [],
      topInsightsInstances: results[3].status === 'fulfilled' ? toArr(results[3].value, 'instances', 'data') : [],
    };
  }, [toArr]);

  const { data: registryData, loading } = useCacheAwareQuery(
    fetchAllModels,
    { cacheKeys: [CACHE_KEYS.ML_MODELS, CACHE_KEYS.FINE_TUNE_JOBS], initialData: { finetuneJobs: [], classificationModels: [], documentAIModels: [], topInsightsInstances: [] } }
  );

  const finetuneJobs = registryData?.finetuneJobs ?? [];
  const classificationModels = registryData?.classificationModels ?? [];
  const documentAIModels = registryData?.documentAIModels ?? [];
  const topInsightsInstances = registryData?.topInsightsInstances ?? [];

  if (loading) return (
    <div className="space-y-4 p-4">
      <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
      </div>
    </div>
  );

  const totalModels = finetuneJobs.length + classificationModels.length + documentAIModels.length + topInsightsInstances.length;

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-center">
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{finetuneJobs.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Fine-Tune Jobs</p>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{classificationModels.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Classification Models</p>
        </div>
        <div className="rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-4 text-center">
          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{documentAIModels.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Document AI Models</p>
        </div>
        <div className="rounded-xl border border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-950/20 p-4 text-center">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">{topInsightsInstances.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Top Insights</p>
        </div>
      </div>

      {totalModels === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-12 text-center">
          <PiDatabase className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-2">No ML models trained yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Use the Fine-tuning, Classification, or Document AI tabs to create your first model.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              All Models & Jobs
              <Badge size="sm" variant="flat" color="secondary" className="ml-2">{totalModels}</Badge>
            </h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {finetuneJobs.map((job: any, i: number) => (
              <div key={`ft-${i}`} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <PiGearDuotone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {job.name || job.model_name || job.JOB_NAME || `Fine-tune #${i + 1}`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fine-Tune | Base: {job.base_model || job.BASE_MODEL || '—'}
                  </p>
                </div>
                <Badge
                  size="sm"
                  variant="flat"
                  color={
                    (job.status || job.STATUS || '').toLowerCase() === 'completed' ? 'success'
                    : (job.status || job.STATUS || '').toLowerCase() === 'running' ? 'info'
                    : (job.status || job.STATUS || '').toLowerCase() === 'failed' ? 'danger'
                    : 'secondary'
                  }
                >
                  {job.status || job.STATUS || 'unknown'}
                </Badge>
              </div>
            ))}
            {classificationModels.map((m: any, i: number) => (
              <div key={`cls-${i}`} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <PiChartBar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {m.name || m.MODEL_NAME || `Classification #${i + 1}`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Classification Model</p>
                </div>
                <Badge size="sm" variant="flat" color="success">Active</Badge>
              </div>
            ))}
            {documentAIModels.map((m: any, i: number) => (
              <div key={`doc-${i}`} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <PiFilePdf className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {m.name || m.MODEL_NAME || `Document AI #${i + 1}`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Document AI Model</p>
                </div>
                <Badge size="sm" variant="flat" color="success">Active</Badge>
              </div>
            ))}
            {topInsightsInstances.map((m: any, i: number) => (
              <div key={`ti-${i}`} className="px-5 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <PiTrendUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {m.name || m.INSTANCE_NAME || `Top Insights #${i + 1}`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Top Insights Instance</p>
                </div>
                <Badge size="sm" variant="flat" color="success">Active</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Fine-Tuning Section =====
function FineTuningSection() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ model_name: '', base_model: 'mistral-7b', training_data: '', validation_data: '', max_epochs: 3 });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);

  const fetchJobs = useCallback(async () => {
    const result = await listFineTuneJobs();
    const raw = result?.data || result?.jobs || result;
    return Array.isArray(raw) ? raw : [];
  }, []);
  const { data: jobs, loading, refetch: loadJobs } = useCacheAwareQuery<any[]>(
    fetchJobs,
    { cacheKeys: [CACHE_KEYS.FINE_TUNE_JOBS], initialData: [] }
  );

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
        <div className="space-y-4 p-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
          </div>
        </div>
      ) : (jobs ?? []).length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiGearDuotone className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No fine-tuning jobs found</p>
          <p className="text-sm mt-1">Create a new job to fine-tune a Cortex LLM</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(jobs ?? []).map((job: any, i: number) => (
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
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create Fine-Tuning Job</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setForm({
                model_name: `ft_support_${Date.now().toString(36)}`,
                base_model: 'mistral-7b',
                training_data: "SELECT QUESTION AS prompt, ANSWER AS completion FROM CP_DATA360.RETAIL_DW.SUPPORT_TICKETS WHERE RESOLUTION_STATUS = 'RESOLVED' LIMIT 500",
                validation_data: "SELECT QUESTION AS prompt, ANSWER AS completion FROM CP_DATA360.RETAIL_DW.SUPPORT_TICKETS WHERE RESOLUTION_STATUS = 'RESOLVED' LIMIT 50 OFFSET 500",
                max_epochs: 3,
              })}
              className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-900/30"
            >
              <PiSparkle className="w-3.5 h-3.5" />
              Use Sample Data
            </Button>
          </div>
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
  const [showTrain, setShowTrain] = useState(false);
  const [trainForm, setTrainForm] = useState({ model_name: '', training_table: '', target_column: '', database: '', schema: '' });
  const [training, setTraining] = useState(false);
  const [showPredict, setShowPredict] = useState(false);
  const [predictForm, setPredictForm] = useState({ model_name: '', input_table: '', database: '', schema: '' });
  const [metrics, setMetrics] = useState<any>(null);
  const [showMetrics, setShowMetrics] = useState(false);

  const fetchModels = useCallback(async () => {
    const result = await listClassificationModels();
    const raw = result?.data || result?.models || result;
    return Array.isArray(raw) ? raw : [];
  }, []);
  const { data: models, loading, refetch: loadModels } = useCacheAwareQuery<any[]>(
    fetchModels,
    { cacheKeys: [CACHE_KEYS.ML_MODELS], initialData: [] }
  );

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
        <div className="space-y-4 p-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
          </div>
        </div>
      ) : (models ?? []).length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiChartBar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No classification models found</p>
          <p className="text-sm mt-1">Train a new model from your data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(models ?? []).map((m: any, i: number) => (
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
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Train Classification Model</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTrainForm({
                model_name: `cls_retail_${Date.now().toString(36)}`,
                training_table: 'CP_DATA360.RETAIL_DW.DIM_CLIENTS',
                target_column: 'COD_SEGMENT',
                database: '',
                schema: '',
              })}
              className="gap-1.5 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/30"
            >
              <PiSparkle className="w-3.5 h-3.5" />
              Use Sample Data
            </Button>
          </div>
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
        <div className="p-6 space-y-4 max-w-2xl">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Model Evaluation Metrics</h3>

          {/* Visual KPI Cards */}
          {(() => {
            const m = metrics?.metrics || metrics;
            const global = m?.show_global_evaluation_metrics;
            const importance = m?.show_feature_importance;
            const confusion = m?.show_confusion_matrix;

            // Parse global metrics if string
            let globalData: any = null;
            try { globalData = typeof global === 'string' ? JSON.parse(global) : global; } catch { globalData = null; }

            // Parse feature importance if string
            let importanceData: any = null;
            try { importanceData = typeof importance === 'string' ? JSON.parse(importance) : importance; } catch { importanceData = null; }

            return (
              <div className="space-y-4">
                {/* Metric KPI Cards */}
                {globalData && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Accuracy', value: globalData?.accuracy ?? globalData?.ACCURACY, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
                      { label: 'Precision', value: globalData?.precision ?? globalData?.PRECISION, color: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
                      { label: 'Recall', value: globalData?.recall ?? globalData?.RECALL, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
                      { label: 'F1 Score', value: globalData?.f1 ?? globalData?.F1, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
                    ].filter(kpi => kpi.value != null).map((kpi, idx) => (
                      <div key={idx} className={`rounded-xl p-3 text-center ${kpi.color}`}>
                        <p className="text-xs font-medium opacity-80">{kpi.label}</p>
                        <p className="text-2xl font-bold mt-1">{typeof kpi.value === 'number' ? (kpi.value * 100).toFixed(1) + '%' : String(kpi.value)}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feature Importance */}
                {importanceData && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Feature Importance</h4>
                    <div className="space-y-2">
                      {(Array.isArray(importanceData) ? importanceData : Object.entries(importanceData).map(([k, v]) => ({ feature: k, importance: v }))).slice(0, 10).map((feat: any, idx: number) => {
                        const name = feat.feature || feat.FEATURE || feat.name || `Feature ${idx}`;
                        const val = Number(feat.importance || feat.IMPORTANCE || feat.score || 0);
                        const pct = Math.min(val * 100, 100);
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 dark:text-slate-400 w-32 truncate">{name}</span>
                            <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
                              <div className="bg-blue-500 rounded-full h-2.5" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-400 w-12 text-right">{(val * 100).toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Confusion Matrix */}
                {confusion && (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Confusion Matrix</h4>
                    <pre className="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded-lg overflow-auto max-h-40 text-slate-700 dark:text-slate-300">
                      {typeof confusion === 'string' ? confusion : JSON.stringify(confusion, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Fallback: raw JSON if no structured data */}
                {!globalData && !importanceData && !confusion && (
                  <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-96 text-slate-700 dark:text-slate-300">
                    {JSON.stringify(metrics, null, 2)}
                  </pre>
                )}
              </div>
            );
          })()}

          <Button variant="outline" onClick={() => setShowMetrics(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
}

// ===== Document AI Section =====
// Document AI Upload API
async function uploadDocumentFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post(`${PREFIX}/ml/document-ai/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
async function extractToTable(body: any) { const { data } = await apiClient.post(`${PREFIX}/ml/document-ai/extract-to-table`, body); return data; }
async function getDocumentTemplates() { const { data } = await apiClient.get(`${PREFIX}/ml/document-ai/templates`); return data; }

function DocumentAISection() {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ model_name: '', database: '', schema: '' });
  const [creating, setCreating] = useState(false);
  const [showPredict, setShowPredict] = useState(false);
  const [predictForm, setPredictForm] = useState({ model_name: '', stage: '', file_path: '', database: '', schema: '' });
  const [predictResult, setPredictResult] = useState<any>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; stage: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [saveTarget, setSaveTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDocModels = useCallback(async () => {
    const result = await listDocumentAIModels();
    const raw = result?.data || result?.models || result;
    return Array.isArray(raw) ? raw : [];
  }, []);
  const { data: models, loading, refetch: loadModels } = useCacheAwareQuery<any[]>(
    fetchDocModels,
    { cacheKeys: [CACHE_KEYS.ML_MODELS], initialData: [] }
  );

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadDocumentFile(file);
      const uploadData = result?.data || result;
      setUploadedFile({ name: uploadData.file_name || file.name, stage: uploadData.stage || '', path: uploadData.file_path || file.name });
      setPredictForm((prev) => ({ ...prev, stage: uploadData.stage || '', file_path: uploadData.file_path || file.name }));
      toast.success(`Uploaded: ${file.name}`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
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

  const handleSaveToTable = async () => {
    if (!predictForm.model_name || !saveTarget) { toast.error('Target table is required'); return; }
    setSaving(true);
    try {
      await extractToTable({
        model_name: predictForm.model_name,
        stage: predictForm.stage,
        file_path: predictForm.file_path,
        target_table: saveTarget,
      });
      toast.success(`Data saved to ${saveTarget}`);
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Load templates on mount
  useEffect(() => {
    getDocumentTemplates().then((r) => setTemplates(r?.data?.templates || r?.templates || [])).catch(() => {});
  }, []);

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
        <div className="space-y-4 p-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
          </div>
        </div>
      ) : (models ?? []).length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiFilePdf className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No Document AI models found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(models ?? []).map((m: any, i: number) => (
            <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
              <h4 className="font-medium text-slate-900 dark:text-white">{m.name || m.NAME || 'Model'}</h4>
              <p className="text-sm text-slate-500 mt-1">{m.created_on || m.CREATED_ON || ''}</p>
            </div>
          ))}
        </div>
      )}

      {predictResult && (
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-900 dark:text-white">Extraction Results</h4>
            {uploadedFile && <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">{uploadedFile.name}</Badge>}
          </div>

          {/* Structured key-value display */}
          {(() => {
            const result = predictResult?.result || predictResult;
            const entries = typeof result === 'object' && result !== null
              ? Object.entries(result).filter(([k]) => k !== '__metadata' && k !== '__type')
              : [];
            if (entries.length > 0) {
              return (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-2 px-3 text-slate-600 dark:text-slate-400 font-medium">Field</th>
                        <th className="text-left py-2 px-3 text-slate-600 dark:text-slate-400 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([key, val], idx) => (
                        <tr key={idx} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 px-3 font-mono text-xs text-slate-700 dark:text-slate-300">{key}</td>
                          <td className="py-2 px-3 text-slate-900 dark:text-white">
                            {typeof val === 'object' ? <pre className="text-xs">{JSON.stringify(val, null, 2)}</pre> : String(val)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return (
              <pre className="text-sm bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto max-h-60 text-slate-700 dark:text-slate-300">
                {JSON.stringify(predictResult, null, 2)}
              </pre>
            );
          })()}

          {/* Save to Table */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
            <Input
              placeholder="TARGET_DB.SCHEMA.TABLE"
              value={saveTarget}
              onChange={(e) => setSaveTarget(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSaveToTable} disabled={saving || !saveTarget} className="gap-2 bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
              {saving ? <Loader variant="spinner" size="sm" /> : <><PiDatabase className="w-4 h-4" /> Save to Table</>}
            </Button>
          </div>
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
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Extract from Document</h3>

          {/* File Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Upload Document</label>
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center hover:border-red-400 transition-colors">
              <PiFilePdf className="w-10 h-10 mx-auto mb-2 text-slate-400" />
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff"
                onChange={handleFileUpload}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 file:text-red-700 hover:file:bg-red-100 dark:file:bg-red-900/30 dark:file:text-red-300"
              />
              {uploading && <div className="mt-2"><Loader variant="spinner" size="sm" /></div>}
              {uploadedFile && (
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  Uploaded: {uploadedFile.name} to {uploadedFile.stage}
                </p>
              )}
            </div>
          </div>

          {/* Template Selector */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Document Template</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((tpl: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => toast.success(`Template: ${tpl.name} — ${tpl.fields?.length || 0} fields`)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ instance_name: '', database: '', schema: '' });
  const [creating, setCreating] = useState(false);
  const [showAnalyze, setShowAnalyze] = useState(false);
  const [analyzeForm, setAnalyzeForm] = useState({ instance_name: '', input_data: '', label_column: '', metric_column: '', database: '', schema: '' });
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const fetchInstances = useCallback(async () => {
    const result = await listTopInsights();
    const raw = result?.data || result?.instances || result;
    return Array.isArray(raw) ? raw : [];
  }, []);
  const { data: instances, loading, refetch: loadInstances } = useCacheAwareQuery<any[]>(
    fetchInstances,
    { cacheKeys: [CACHE_KEYS.ML_MODELS], initialData: [] }
  );

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
        <div className="space-y-4 p-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
          </div>
        </div>
      ) : (instances ?? []).length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <PiTrendUp className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No Top Insights instances found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(instances ?? []).map((inst: any, i: number) => (
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
