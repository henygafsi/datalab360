export { queryCortex } from './query';
export type { CortexQueryRequest, CortexQueryResponse, CortexQueryResult } from './query';
export { getCortexRecommend } from './recommend';
export type { RecommendRequest, RecommendResponse } from './recommend';
export { getCortexKpis } from './kpis';
export type { CortexKpis } from './kpis';

// Semantic Models
export {
  listSemanticModels,
  getSemanticModelContent,
  createSemanticModel,
  deleteSemanticModel,
  generateSemanticModel,
  validateSemanticModelYaml,
  generateSampleModelYaml,
  formatFileSize,
  formatDate,
} from './semantic-models';
export type {
  SemanticModel,
  SemanticModelContent,
  CreateSemanticModelRequest,
  SemanticModelGenerateRequest,
  SemanticModelGenerateResponse,
} from './semantic-models';

// Advanced ML Features
export {
  createFineTuneJob,
  listFineTuneJobs,
  describeFineTuneJob,
  cancelFineTuneJob,
  createDocumentAIModel,
  listDocumentAIModels,
  predictDocumentAI,
  trainClassification,
  predictClassification,
  listClassificationModels,
  getClassificationMetrics,
  dropClassificationModel,
  createTopInsights,
  analyzeTopInsights,
  listTopInsights,
} from './ml-advanced';
export type {
  CreateFineTuneRequest,
  FineTuneJob,
  FineTuneJobDescription,
  CreateDocumentAIModelRequest,
  DocumentAIModel,
  PredictDocumentAIRequest,
  TrainClassificationRequest,
  PredictClassificationRequest,
  ClassificationModel,
  ClassificationMetrics,
  CreateTopInsightsRequest,
  AnalyzeTopInsightsRequest,
  TopInsightsInstance,
} from './ml-advanced';
