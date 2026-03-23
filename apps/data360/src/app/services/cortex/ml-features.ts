import apiClient from '@/lib/api-client';

// ============================================
// TYPES
// ============================================

export type LLMModel = 'mistral-7b' | 'mistral-large' | 'llama2-70b-chat' | 'mixtral-8x7b' | 'reka-flash';

export type LanguageCode = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'ja' | 'ko' | 'zh' | 'ar' | 'ru';

export interface CompletionRequest {
  prompt: string;
  model?: LLMModel;
  guardrails?: boolean;
}

export interface CompletionResponse {
  response: string;
  model: string;
}

export interface SentimentResult {
  text: string;
  sentiment: number;
  category?: 'positive' | 'negative' | 'neutral';
}

export interface TranslationRequest {
  text: string;
  from_language: LanguageCode;
  to_language: LanguageCode;
}

export interface TranslationResult {
  original: string;
  translated: string;
  from: LanguageCode;
  to: LanguageCode;
}

export interface SummarizeRequest {
  text: string;
  max_length?: number;
}

export interface SummaryResult {
  original_length: number;
  summary: string;
  summary_length: number;
  compression_ratio?: string;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
}

export interface DatabaseInfo {
  name: string;
  created_on?: string;
  owner?: string;
}

export interface SchemaInfo {
  name: string;
  database_name?: string;
}

export interface TableInfo {
  name: string;
  kind?: string;
  rows?: number;
  bytes?: number;
}

// ============================================
// CONSTANTS
// ============================================

export const LLM_MODELS = [
  { value: 'mistral-7b', label: 'Mistral 7B', description: 'Fast, efficient' },
  { value: 'mistral-large', label: 'Mistral Large', description: 'More capable' },
  { value: 'llama2-70b-chat', label: 'Llama 2 70B', description: 'Conversational' },
  { value: 'mixtral-8x7b', label: 'Mixtral 8x7B', description: 'Mixture of experts' },
  { value: 'reka-flash', label: 'Reka Flash', description: 'Multimodal' },
] as const;

export const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
] as const;

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Generate AI text completion using Cortex LLM
 */
export async function generateCompletion(request: CompletionRequest): Promise<CompletionResponse> {
  try {
    const response = await apiClient.post(
      '/cortex/complete',
      {
        prompt: request.prompt,
        model: request.model || 'mistral-7b',
        guardrails: request.guardrails || false,
      }
    );

    const data = response.data?.data || response.data;
    return {
      response: data.response || data.completion || '',
      model: data.model || request.model || 'mistral-7b',
    };
  } catch (error: any) {
    console.error('Completion error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to generate completion');
  }
}

/**
 * Analyze sentiment of texts
 */
export async function analyzeSentiment(texts: string[]): Promise<SentimentResult[]> {
  try {
    const response = await apiClient.post(
      '/cortex/ml/sentiment',
      { texts }
    );

    const data = response.data?.data || response.data;
    const results = data.results || data;

    return (Array.isArray(results) ? results : []).map((result: any) => ({
      text: result.text,
      sentiment: result.sentiment,
      category: categorizeSentiment(result.sentiment),
    }));
  } catch (error: any) {
    console.error('Sentiment analysis error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to analyze sentiment');
  }
}

/**
 * Analyze sentiment of a database table column
 */
export async function analyzeTableSentiment(
  tableName: string,
  textColumn: string,
  database?: string,
  schema?: string
): Promise<SentimentResult[]> {
  try {
    const response = await apiClient.post(
      '/cortex/ml/sentiment',
      {
        table_name: tableName,
        text_column: textColumn,
        database,
        schema,
      }
    );

    const data = response.data?.data || response.data;
    const results = data.results || data;

    return (Array.isArray(results) ? results : []).map((result: any) => ({
      text: result.text,
      sentiment: result.sentiment,
      category: categorizeSentiment(result.sentiment),
    }));
  } catch (error: any) {
    console.error('Table sentiment analysis error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to analyze table sentiment');
  }
}

/**
 * Translate text between languages
 */
export async function translateText(request: TranslationRequest): Promise<TranslationResult> {
  try {
    const response = await apiClient.post(
      '/cortex/ml/translate',
      request
    );

    const data = response.data?.data || response.data;
    return {
      original: data.original || request.text,
      translated: data.translated || '',
      from: data.from || request.from_language,
      to: data.to || request.to_language,
    };
  } catch (error: any) {
    console.error('Translation error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to translate text');
  }
}

/**
 * Summarize text
 */
export async function summarizeText(request: SummarizeRequest): Promise<SummaryResult> {
  try {
    const response = await apiClient.post(
      '/cortex/ml/summarize',
      {
        text: request.text,
        max_length: request.max_length || 100,
      }
    );

    const data = response.data?.data || response.data;
    const originalLength = data.original_length || request.text.length;
    const summaryLength = data.summary_length || (data.summary?.length || 0);

    return {
      original_length: originalLength,
      summary: data.summary || '',
      summary_length: summaryLength,
      compression_ratio: ((1 - summaryLength / originalLength) * 100).toFixed(1),
    };
  } catch (error: any) {
    console.error('Summarization error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to summarize text');
  }
}

/**
 * Generate text embeddings
 */
export async function generateEmbeddings(
  texts: string[],
  model = 'e5-base-v2'
): Promise<EmbeddingResult[]> {
  try {
    const response = await apiClient.post(
      '/cortex/embeddings',
      { texts, model }
    );

    const data = response.data?.data || response.data;
    return data.embeddings || [];
  } catch (error: any) {
    console.error('Embeddings error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to generate embeddings');
  }
}

/**
 * List available databases
 */
export async function listDatabases(): Promise<DatabaseInfo[]> {
  try {
    const response = await apiClient.get('/cortex/explore/databases');

    const data = response.data?.data || response.data;
    return data.databases || data || [];
  } catch (error: any) {
    console.error('List databases error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to list databases');
  }
}

/**
 * List schemas in a database
 */
export async function listSchemas(database: string): Promise<SchemaInfo[]> {
  try {
    const response = await apiClient.get(
      `/cortex/explore/schemas?database=${encodeURIComponent(database)}`
    );

    const data = response.data?.data || response.data;
    return data.schemas || data || [];
  } catch (error: any) {
    console.error('List schemas error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to list schemas');
  }
}

/**
 * List tables in a schema
 */
export async function listTables(database: string, schema: string): Promise<TableInfo[]> {
  try {
    const response = await apiClient.post(
      '/cortex/explore/tables',
      { database, schema }
    );

    const data = response.data?.data || response.data;
    return data.tables || data || [];
  } catch (error: any) {
    console.error('List tables error:', error);
    throw new Error(error.response?.data?.detail || error.message || 'Failed to list tables');
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function categorizeSentiment(score: number): 'positive' | 'negative' | 'neutral' {
  if (score > 0.3) return 'positive';
  if (score < -0.3) return 'negative';
  return 'neutral';
}

export function getSentimentColor(score: number): string {
  if (score > 0.3) return '#22c55e'; // green
  if (score < -0.3) return '#ef4444'; // red
  return '#f59e0b'; // amber
}

export function getSentimentEmoji(score: number): string {
  if (score > 0.5) return '😄';
  if (score > 0.3) return '🙂';
  if (score > -0.3) return '😐';
  if (score > -0.5) return '🙁';
  return '😞';
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
