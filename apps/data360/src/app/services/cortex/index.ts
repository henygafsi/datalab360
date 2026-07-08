export { queryCortex } from './query';
export type { CortexQueryRequest, CortexQueryResponse, CortexQueryResult } from './query';
export { getCortexRecommend } from './recommend';
export type { RecommendRequest, RecommendResponse } from './recommend';
export { analystQuery } from './query';
export type { AnalystQueryRequest, AnalystQueryResponse } from './query';

// AI conversation history (GET /cortex/conversations[/{id}])
export { listCortexConversations, getCortexConversation } from './conversations';
export type { CortexConversation, CortexConversationDetail } from './conversations';
export { getCortexKpis } from './kpis';
export type { CortexKpis } from './kpis';

// Semantic Models
export {
  listSemanticModels,
  getSemanticModelContent,
  createSemanticModel,
  updateSemanticModel,
  deleteSemanticModel,
  generateSemanticModel,
  generateAndSaveSemanticModel,
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

// Query Analytics (Cortex-powered query history analysis)
export {
  runQueryAnalysis,
  getQueryAnalyticsResults,
  getQueryAnalyticsSummary,
  getRedundantGroups,
} from './query-analytics';
export type {
  AnalyticsResult,
  AnalyticsSummary,
  RedundantGroup,
  RunAnalysisResponse,
} from './query-analytics';

// DuckDB / Local Analytics
export {
  listDuckdbDatasets,
  queryStage,
  duckdbQuery,
} from './duckdb';
export type {
  DuckdbDataset,
  DuckdbDatasetsResponse,
  DuckdbQueryResult,
} from './duckdb';

// ML Features (completion, sentiment, translate, summarize, embeddings, explore)
export {
  generateCompletion,
  analyzeSentiment,
  analyzeTableSentiment,
  translateText,
  summarizeText,
  generateEmbeddings,
  listDatabases,
  listSchemas,
  listTables,
  getSentimentColor,
  getSentimentEmoji,
  formatBytes,
} from './ml-features';
export type {
  LLMModel,
  LanguageCode,
  CompletionRequest,
  CompletionResponse,
  SentimentResult,
  TranslationRequest,
  TranslationResult,
  SummarizeRequest,
  SummaryResult,
  EmbeddingResult,
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
} from './ml-features';
export { LLM_MODELS, LANGUAGES } from './ml-features';

// Cortex AI (models, code-gen, synth, icon, SPCS lifecycle)
export {
  getCortexModels,
  generateCode,
  synthesizeRows,
  suggestIcon,
  suspendService,
  resumeService,
  dropService,
  autoStopService,
  dropComputePool as dropComputePoolV2,
} from './ai';
export type {
  CortexModelsResponse,
  CodeGenRequest,
  CodeGenResponse,
  SynthesizeRequest,
  SynthesizeResponse,
  IconSuggestRequest,
  IconSuggestResponse,
} from './ai';

// Snowpark Container Services
export {
  listComputePools,
  createComputePool,
  suspendPool,
  resumePool,
  listServices,
  createService,
  getServiceStatus,
  getServiceLogs,
  listStreamlitApps,
  createStreamlitApp,
  listImageRepos,
  listEndpoints,
} from './snowpark';
export type {
  ComputePool,
  ContainerService,
  StreamlitApp,
  ImageRepo,
  ServiceEndpoint,
  CreatePoolRequest,
  CreateServiceRequest,
  CreateStreamlitRequest,
} from './snowpark';

// Agentic proposals + governed coco execution (POST /cortex/agent/propose, /coco/run-sql)
export { proposeAgentActions, cocoRunSql } from './agent';
export type { ProposedAction, ProposedActionKind, AgentProposeResult, CocoRunResult } from './agent';
