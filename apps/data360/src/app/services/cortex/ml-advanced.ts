/**
 * Cortex Advanced ML Service
 * Fine-tuning, Document AI, Classification models, and Top Insights
 *
 * Location: apps/data360/src/app/services/cortex/ml-advanced.ts
 */

import apiClient from '@/lib/api-client';

const PREFIX = '/cortex';

// =============================================================================
// TYPES
// =============================================================================

// Fine-Tune Types
export interface CreateFineTuneRequest {
  model_name: string;
  base_model?: string;
  training_data: string;
  validation_data?: string;
  max_epochs?: number;
}

export interface FineTuneJob {
  job_id: string;
  model_name: string;
  base_model?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  progress?: number;
  training_loss?: number;
  validation_loss?: number;
}

export interface FineTuneJobDescription {
  job_id: string;
  model_name: string;
  base_model?: string;
  status: string;
  created_at?: string;
  completed_at?: string;
  training_data: string;
  validation_data?: string;
  max_epochs?: number;
  current_epoch?: number;
  training_loss?: number;
  validation_loss?: number;
  error_message?: string;
}

// Document AI Types
export interface CreateDocumentAIModelRequest {
  model_name: string;
  database?: string;
  schema?: string;
}

export interface DocumentAIModel {
  model_name: string;
  database?: string;
  schema?: string;
  status?: string;
  created_on?: string;
}

export interface PredictDocumentAIRequest {
  model_name: string;
  stage: string;
  file_path: string;
  database?: string;
  schema?: string;
}

// Classification Model Types
export interface TrainClassificationRequest {
  model_name: string;
  training_table: string;
  target_column: string;
  database?: string;
  schema?: string;
  evaluate?: boolean;
}

export interface PredictClassificationRequest {
  model_name: string;
  input_table: string;
  database?: string;
  schema?: string;
}

export interface ClassificationModel {
  model_name: string;
  status?: string;
  created_on?: string;
  training_table?: string;
  target_column?: string;
}

export interface ClassificationMetrics {
  model_name: string;
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1_score?: number;
  confusion_matrix?: Record<string, unknown>;
  feature_importance?: Record<string, number>;
}

// Top Insights Types
export interface CreateTopInsightsRequest {
  instance_name: string;
  database?: string;
  schema?: string;
}

export interface AnalyzeTopInsightsRequest {
  instance_name: string;
  input_data: string;
  label_column: string;
  metric_column: string;
  database?: string;
  schema?: string;
}

export interface TopInsightsInstance {
  instance_name: string;
  database?: string;
  schema?: string;
  created_on?: string;
  status?: string;
}

// =============================================================================
// FINE-TUNE FUNCTIONS
// =============================================================================

/**
 * Create a new fine-tune job
 * POST /cortex/ml/finetune
 */
export async function createFineTuneJob(request: CreateFineTuneRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/finetune`, {
    model_name: request.model_name,
    base_model: request.base_model,
    training_data: request.training_data,
    validation_data: request.validation_data,
    max_epochs: request.max_epochs,
  });
  return data;
}

/**
 * List all fine-tune jobs
 * GET /cortex/ml/finetune/jobs
 */
export async function listFineTuneJobs() {
  const { data } = await apiClient.get(`${PREFIX}/ml/finetune/jobs`);
  return data;
}

/**
 * Get details of a specific fine-tune job
 * GET /cortex/ml/finetune/jobs/{job_id}
 */
export async function describeFineTuneJob(jobId: string) {
  const { data } = await apiClient.get(`${PREFIX}/ml/finetune/jobs/${encodeURIComponent(jobId)}`);
  return data;
}

/**
 * Cancel a running fine-tune job
 * POST /cortex/ml/finetune/jobs/{job_id}/cancel
 */
export async function cancelFineTuneJob(jobId: string) {
  const { data } = await apiClient.post(`${PREFIX}/ml/finetune/jobs/${encodeURIComponent(jobId)}/cancel`);
  return data;
}

// =============================================================================
// DOCUMENT AI FUNCTIONS
// =============================================================================

/**
 * Create a new Document AI model
 * POST /cortex/ml/document-ai/models
 */
export async function createDocumentAIModel(request: CreateDocumentAIModelRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/document-ai/models`, {
    model_name: request.model_name,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

/**
 * List all Document AI models
 * GET /cortex/ml/document-ai/models
 */
export async function listDocumentAIModels() {
  const { data } = await apiClient.get(`${PREFIX}/ml/document-ai/models`);
  return data;
}

/**
 * Run prediction using a Document AI model
 * POST /cortex/ml/document-ai/predict
 */
export async function predictDocumentAI(request: PredictDocumentAIRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/document-ai/predict`, {
    model_name: request.model_name,
    stage: request.stage,
    file_path: request.file_path,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

// =============================================================================
// CLASSIFICATION MODEL FUNCTIONS
// =============================================================================

/**
 * Train a classification model
 * POST /cortex/ml/classification/train
 */
export async function trainClassification(request: TrainClassificationRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/classification/train`, {
    model_name: request.model_name,
    training_table: request.training_table,
    target_column: request.target_column,
    database: request.database,
    schema: request.schema,
    evaluate: request.evaluate,
  });
  return data;
}

/**
 * Run predictions using a classification model
 * POST /cortex/ml/classification/predict
 */
export async function predictClassification(request: PredictClassificationRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/classification/predict`, {
    model_name: request.model_name,
    input_table: request.input_table,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

/**
 * List all classification models
 * GET /cortex/ml/classification/models
 */
export async function listClassificationModels() {
  const { data } = await apiClient.get(`${PREFIX}/ml/classification/models`);
  return data;
}

/**
 * Get evaluation metrics for a classification model
 * GET /cortex/ml/classification/{model}/metrics
 */
export async function getClassificationMetrics(model: string) {
  const { data } = await apiClient.get(`${PREFIX}/ml/classification/${encodeURIComponent(model)}/metrics`);
  return data;
}

/**
 * Drop (delete) a classification model
 * DELETE /cortex/ml/classification/{model}
 */
export async function dropClassificationModel(model: string) {
  const { data } = await apiClient.delete(`${PREFIX}/ml/classification/${encodeURIComponent(model)}`);
  return data;
}

// =============================================================================
// TOP INSIGHTS FUNCTIONS
// =============================================================================

/**
 * Create a Top Insights instance
 * POST /cortex/ml/top-insights
 */
export async function createTopInsights(request: CreateTopInsightsRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/top-insights`, {
    instance_name: request.instance_name,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

/**
 * Analyze data using a Top Insights instance
 * POST /cortex/ml/top-insights/{name}/analyze
 */
export async function analyzeTopInsights(name: string, request: AnalyzeTopInsightsRequest) {
  const { data } = await apiClient.post(`${PREFIX}/ml/top-insights/${encodeURIComponent(name)}/analyze`, {
    instance_name: request.instance_name,
    input_data: request.input_data,
    label_column: request.label_column,
    metric_column: request.metric_column,
    database: request.database,
    schema: request.schema,
  });
  return data;
}

/**
 * List all Top Insights instances
 * GET /cortex/ml/top-insights
 */
export async function listTopInsights() {
  const { data } = await apiClient.get(`${PREFIX}/ml/top-insights`);
  return data;
}
