/**
 * reference-tables.ts — create a REFERENCE TABLE from a file, from the UI.
 *
 * The journey the backend actually supports (every step probed live against
 * 127.0.0.1:8078 on 2026-09-29, results noted per function):
 *
 *   1. POST /connect/stages/internal                        → an internal stage in STAGING
 *   2. POST /connect/stages/{stage}/upload      (multipart) → the file lands in the stage
 *   3. GET  /connect/stages/{stage}/files/{f}/preview       → first rows, before creating anything
 *   4. POST /connect/stages/{stage}/files/{f}/load-table    → INFER_SCHEMA → CREATE → COPY
 *
 * Step 3 is the ONLY one that is not dependable today: it reads through the
 * account-lane SVC connection, which currently answers 503 CACHE_NOT_READY
 * (reason "no_svc") on this account while steps 1/2/4 succeed. So the preview is
 * treated as OPTIONAL and its failure is reported as "preview unavailable" —
 * never as a failure of the upload, and never silently swallowed.
 */

import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

/** A staged file, as returned by the upload call. */
export interface StagedFile {
  file_name: string;
  file_size: number;
  stage_path: string;
  uploaded_at?: string;
}

export interface UploadResult {
  status: string;
  files: StagedFile[];
  total_uploaded: number;
  message?: string;
}

/** Preview rows, when the read lane is healthy. */
export interface StagePreview {
  columns?: string[];
  rows?: unknown[][] | Record<string, unknown>[];
  /** Set when the backend could not serve the preview — the upload is still valid. */
  unavailable?: string;
}

export interface LoadTableResult {
  status: string;
  target: string;
  created: boolean;
  mode: string;
  rows_loaded: number;
  file: string;
  stage: string;
}

/** The stage the Studio uses for user-supplied reference data. */
export const REFERENCE_STAGE = 'D360_REF_UPLOAD';

/** True when an error is the account-lane SVC being unavailable (503 no_svc). */
export function isCacheNotReady(err: unknown): boolean {
  const e = err as { response?: { status?: number; data?: { detail?: { error_code?: string } } } };
  const code = e?.response?.data?.detail?.error_code;
  return e?.response?.status === 503 || code === 'CACHE_NOT_READY';
}

function detailOf(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { detail?: string | { detail?: string; message?: string } } };
    message?: string;
  };
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') return d.detail || d.message || fallback;
  return e?.message || fallback;
}

/**
 * Create the internal stage. Idempotent in practice — the backend returns a
 * plain success message when it already exists, so calling it before every
 * upload is safe (measured 6.2s cold on first creation).
 */
export async function ensureReferenceStage(stage = REFERENCE_STAGE): Promise<void> {
  await apiClient.post(API.connect.createInternalStage(), { stage_name: stage });
}

/**
 * Upload one or more files to the stage. Multipart — the field name MUST be
 * `files` (the backend's Body_upload_stage_files_… schema).
 *
 * MEASURED, and the reason the timeout is what it is: the stage PUT is slow and
 * scales with size — a 278-byte CSV took 16s (fixed overhead dominates), and an
 * 8.6 MB CSV took 280s. A flat 180s timeout — which is what this function shipped
 * with first — would have failed that upload in the browser while Snowflake was
 * still happily writing. So the budget is 60s of overhead plus 45s per MB, floored
 * at 3 minutes and capped at 20, and callers MUST show progress throughout.
 */
export function uploadTimeoutFor(bytes: number): number {
  const perMb = 45_000;
  const budget = 60_000 + (bytes / (1024 * 1024)) * perMb;
  return Math.min(20 * 60_000, Math.max(180_000, Math.round(budget)));
}

export async function uploadReferenceFile(
  files: File[],
  opts: { stage?: string; overwrite?: boolean } = {}
): Promise<UploadResult> {
  const stage = opts.stage ?? REFERENCE_STAGE;
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const total = files.reduce((n, f) => n + (f.size || 0), 0);
  const { data } = await apiClient.post<UploadResult>(
    API.connect.uploadToStage(stage, opts.overwrite ?? true),
    form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: uploadTimeoutFor(total) }
  );
  return data;
}

/**
 * Preview the staged file. NEVER throws for an unavailable read lane — returns
 * `{ unavailable }` so the caller can still offer to create the table (the
 * create path does not depend on the preview).
 */
export async function previewStagedFile(
  filePath: string,
  opts: { stage?: string; limit?: number } = {}
): Promise<StagePreview> {
  const stage = opts.stage ?? REFERENCE_STAGE;
  try {
    const { data } = await apiClient.get<StagePreview>(
      API.connect.previewStageFile(stage, filePath, { limit: opts.limit ?? 20 })
    );
    return data;
  } catch (err) {
    if (isCacheNotReady(err)) {
      return {
        unavailable:
          'The preview could not be read (the account read layer is unavailable). The file uploaded correctly — you can still create the table.',
      };
    }
    return { unavailable: detailOf(err, 'The preview could not be read.') };
  }
}

/**
 * Materialise the staged file as a table: INFER_SCHEMA → CREATE → COPY.
 * Measured: DATA360_LITE.PUBLIC.DIM_REGION created with 5 rows in ~9.2s.
 */
export async function loadStagedFileToTable(
  filePath: string,
  target: { database: string; schema_name: string; table: string; mode?: 'create' | 'append' | 'replace' },
  opts: { stage?: string } = {}
): Promise<LoadTableResult> {
  const stage = opts.stage ?? REFERENCE_STAGE;
  const { data } = await apiClient.post<LoadTableResult>(
    API.connect.loadStageFileAsTable(stage, filePath),
    { mode: 'create', ...target },
    { timeout: 300_000 }
  );
  return data;
}

/** The whole journey, for callers that just want a table out of a file. */
export async function createReferenceTableFromFile(
  file: File,
  target: { database: string; schema_name: string; table: string; mode?: 'create' | 'append' | 'replace' },
  onStep?: (step: 'stage' | 'upload' | 'preview' | 'load', detail?: string) => void
): Promise<{ load: LoadTableResult; preview: StagePreview }> {
  onStep?.('stage');
  await ensureReferenceStage();
  onStep?.('upload');
  const up = await uploadReferenceFile([file]);
  const staged = up.files?.[0]?.file_name ?? file.name;
  onStep?.('preview');
  const preview = await previewStagedFile(staged);
  onStep?.('load');
  const load = await loadStagedFileToTable(staged, target);
  return { load, preview };
}
