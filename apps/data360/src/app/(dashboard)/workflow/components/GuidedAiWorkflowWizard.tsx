'use client';

/**
 * GuidedAiWorkflowWizard — 9-step AI-guided flow for building a workflow
 * from a plain-English description.
 *
 * Phases (top progress bar):
 *   1. Understand  → steps 1, 2
 *   2. Design      → steps 3, 4, 5
 *   3. Validate    → steps 6, 7, 8
 *   4. Deploy      → step 9
 *
 * Per-step:
 *   1. Describe what you want
 *   2. AI Understanding (Cortex extracts business context + sources)
 *   3. Compliance & Feasibility (user fills 8 cards manually — no backend)
 *   4. Recommendations (3 options: Safe / Best balance / Advanced)
 *   5. Option Details (selected option's summary)
 *   6. New Requests (items needing Data360 review)
 *   7. AI Generated Workflow preview (nodes/edges on canvas)
 *   8. Code & Configuration (SQL / Python / YAML tabs)
 *   9. Summary & Next Steps (create in builder)
 *
 * The wizard is intentionally large but kept in ONE file so future edits
 * stay localised. Each step is its own internal sub-component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Sparkles, X, ArrowLeft, ArrowRight, Loader2, Check, AlertTriangle,
  Database, FileText, Cpu, Layers, ListChecks,
  Save, Share2, Coins, Wand2, ShieldCheck, FileCheck,
  Scale, Lock, Heart, Beaker, Info, Trash2,
} from 'lucide-react';
import { listGlobalEvents } from '@/app/services/api/projectsApi';
import type { ProjectEvent } from '@/app/services/api/types';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import { getTablePreview, type TablePreviewData } from '@/app/services/explore-design';
import {
  getCached,
  setCached,
  clearCache,
  hashKey,
  countCached,
} from './wizard-cortex-cache';
import ReactFlow, {
  Background, Controls, MarkerType, MiniMap, ReactFlowProvider,
  type Node, type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { etlNodeTypes } from './ETLNodeTypes';
import {
  BLOCK_BY_TYPE,
  buildCatalogPromptSection,
  fallbackGenerateWorkflow,
  isUsableGraph,
  rankForType,
  validateGraph,
  type CatalogBlock,
  type ValidationIssue,
} from './etl-catalog-grounding';
import WizardPreflightPanel from './WizardPreflightPanel';
import AiCostBadge from '@/app/(dashboard)/intelligent/components/AiCostBadge';
import { useTrackAiCharge } from '@/app/(dashboard)/intelligent/store/ai-store';
import { useAiCostEstimate } from '@/hooks/useAiCostEstimate';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

type PhaseId = 'understand' | 'design' | 'validate' | 'deploy';

const PHASE_FOR_STEP: Record<StepId, PhaseId> = {
  1: 'understand',
  2: 'understand',
  3: 'design',
  4: 'design',
  5: 'design',
  6: 'validate',
  7: 'validate',
  8: 'validate',
  9: 'deploy',
};

const PHASES: { id: PhaseId; label: string; n: number }[] = [
  { id: 'understand', label: 'Understand', n: 1 },
  { id: 'design', label: 'Design', n: 2 },
  { id: 'validate', label: 'Validate', n: 3 },
  { id: 'deploy', label: 'Deploy', n: 4 },
];

interface BusinessContext {
  domain?: string;
  primary_goal?: string;
  key_object?: string;
  expected_outcome?: string;
  ai_usage?: string;
  automation_level?: string;
  users?: string;
}
interface DetectedSource {
  name: string;
  status: 'existing' | 'requested' | 'missing';
  reason?: string;
}
interface AiUnderstanding {
  business_context: BusinessContext;
  sources_detected: DetectedSource[];
  intent_confidence: number; // 0..100
}

interface ComplianceCard {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  // 'reviewed' = the user has self-attested they've read & understood this
  // dimension. 'unchecked' = not yet seen. We intentionally do NOT model
  // 'ok' / 'warning' here — there is no backend audit; this is a self-
  // review surface, not a compliance verdict.
  status: 'reviewed' | 'unchecked';
  note: string;
}

interface RecommendationOption {
  id: 'safe' | 'best' | 'advanced';
  title: string;
  subtitle: string;
  features: string[];
  creditsMin: number;
  creditsMax: number;
  requiresReview: boolean;
}

interface NewRequest {
  id: string;
  kind: 'source' | 'block';
  title: string;
  reason: string;
  status: 'under_review' | 'approved' | 'rejected';
  slaDays: number;
}

interface BlockPreview {
  id: string;
  type: string;
  label: string;
  // Real per-block params (database, schema, table, filter_condition, …).
  // The LLM is told to fill required params from the catalog; missing values
  // surface in step 7's per-block side panel and are blocked from advance
  // until the user supplies them.
  config?: Record<string, unknown>;
}
interface EdgePreview {
  from: string;
  to: string;
  // Required when targeting a multi-input block (join → "input1"/"input2").
  targetHandle?: string;
}

interface WizardState {
  step: StepId;
  description: string;
  understanding: AiUnderstanding | null;
  compliance: ComplianceCard[];
  selectedOption: RecommendationOption['id'] | null;
  newRequests: NewRequest[];
  workflow: { nodes: Node[]; edges: Edge[] } | null;
  generatedSql: string;
  generatedPython: string;
  generatedYaml: string;
  /**
   * True while `generateWorkflow()` is in flight. Drives the step-7 skeleton
   * (4-6 grey rounded rects with spinners) — the user sees an instant
   * transition to step 7 with placeholders, and the real nodes fade in via
   * AnimatePresence as the streaming parser mounts them one by one.
   * Reset on success, fallback, and `handleClose()` so reopening a wizard
   * mid-generation doesn't show perpetual skeletons.
   */
  isGenerating: boolean;
  /**
   * Predicted block labels for the skeleton placeholders — populated from
   * the deterministic fallback generator's first pass so the skeleton hints
   * at the SHAPE of the workflow (e.g. "Source · Filter · Aggregate ·
   * Destination") rather than 4 generic boxes. Pure UX, no backend.
   */
  skeletonLabels: string[];
  /**
   * Per-call cache hit indicator. When the wizard reuses a cached Cortex
   * response, the relevant step header shows a tiny "(cached)" chip so the
   * user knows the answer didn't come from a fresh LLM call. QA persona
   * requirement: cache hits MUST be visible.
   */
  cacheStatus: {
    understanding: 'live' | 'cached' | null;
    workflow: 'live' | 'cached' | null;
    code: 'live' | 'cached' | null;
  };
  /**
   * Pre-computed source-table previews fired in parallel from the wizard
   * BEFORE step 8 mounts. Keyed by source-block node id; passed to
   * `WizardPreflightPanel` via an optional prop so the panel can seed its
   * `previews` state and skip its sequential `getTablePreview` loop.
   * This is the parallel pre-flight optimization (item 4).
   */
  precomputedPreviews: Record<
    string,
    { status: 'ok' | 'err'; data?: TablePreviewData; error?: string }
  >;
}

// ───────────────────────────────────────────────────────────────────────────
// Initial / static data
// ───────────────────────────────────────────────────────────────────────────

// Shorter, catalog-grounded fallbacks. Each one maps to real blocks present
// in etl-blocks-catalog.json samples (source → filter → aggregate → destination,
// source → ai_sentiment → destination, etc.) so they actually generate
// something usable when picked. Used when no event history is available.
interface ExampleEntry {
  text: string;
  source: 'history' | 'suggested';
}

const FALLBACK_EXAMPLES: ExampleEntry[] = [
  { text: 'Daily KPI roll-up — orders by store, last 24h', source: 'suggested' },
  { text: 'Score customer reviews with AI sentiment', source: 'suggested' },
  { text: 'Top 10 orders per customer (join + window rank)', source: 'suggested' },
  { text: 'Detect anomalies in IoT telemetry stream', source: 'suggested' },
];

// Extract a human-readable prompt from a project event. Defensive across the
// shapes the backend has emitted in the past (prompt | description | text).
function extractPromptFromEvent(ev: ProjectEvent): string | null {
  const details = (ev.details ?? {}) as Record<string, unknown>;
  for (const key of ['prompt', 'description', 'text', 'input']) {
    const v = details[key];
    if (typeof v === 'string' && v.trim().length > 6) {
      return v.trim().slice(0, 160);
    }
  }
  return null;
}

const DEFAULT_COMPLIANCE: ComplianceCard[] = [
  { key: 'data_rights', title: 'Data Rights', icon: ShieldCheck, status: 'unchecked', note: '' },
  { key: 'gdpr', title: 'GDPR', icon: FileCheck, status: 'unchecked', note: '' },
  { key: 'ai_act', title: 'AI Act', icon: Cpu, status: 'unchecked', note: '' },
  { key: 'data_act', title: 'Data Act', icon: Scale, status: 'unchecked', note: '' },
  { key: 'source_terms', title: 'Source Terms', icon: FileText, status: 'unchecked', note: '' },
  { key: 'security', title: 'Security', icon: Lock, status: 'unchecked', note: '' },
  { key: 'positivity', title: 'Positivity Check', icon: Heart, status: 'unchecked', note: '' },
  { key: 'cost', title: 'Cost & Credits', icon: Coins, status: 'unchecked', note: '' },
];

const DEFAULT_OPTIONS: RecommendationOption[] = [
  {
    id: 'safe',
    title: 'Safe & Fast',
    subtitle: 'Use only existing sources and blocks',
    features: ['Fast deployment', 'Lower cost', 'No new development'],
    creditsMin: 1250,
    creditsMax: 1800,
    requiresReview: false,
  },
  {
    id: 'best',
    title: 'Best balance of',
    subtitle: 'Best balance of capabilities and cost',
    features: ['Enriched analysis', 'AI insights', 'Automation & alerts'],
    creditsMin: 2100,
    creditsMax: 3200,
    requiresReview: false,
  },
  {
    id: 'advanced',
    title: 'Advanced',
    subtitle: 'Includes new source / block requests',
    features: ['Full benchmark', 'Advanced AI', 'Cross-channel actions'],
    creditsMin: 3800,
    creditsMax: 6000,
    requiresReview: true,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Prompt builders for /cortex/complete
// ───────────────────────────────────────────────────────────────────────────

// Prompts are deliberately TERSE — the Snowflake Cortex warehouse has a 15s
// SQL execution limit per call and longer prompts have been timing out in
// prod (`error_code: QUERY_CANCELLED, snowflake_code: 604`). Shorter input
// + a small model (mistral-7b) keeps round-trips under the budget. We also
// trim the user description to 500 chars at the API boundary.

function buildUnderstandingPrompt(description: string): string {
  const desc = description.slice(0, 500);
  // Explicit "integer 0 to 100" stops Mistral from returning 0.85.
  // Max 3 sources keeps the response short enough to fit in the 15s
  // Snowflake Cortex window without getting truncated.
  return `Extract workflow intent. Output ONLY valid JSON (no markdown, all braces closed):
{"business_context":{"domain":"","primary_goal":"","key_object":"","expected_outcome":"","ai_usage":"Low|Medium|High","automation_level":"Low|Medium|High","users":""},"sources_detected":[{"name":"","status":"existing|requested|missing"}],"intent_confidence":85}

Rules: intent_confidence MUST be an integer between 0 and 100 (not a decimal). Maximum 3 sources_detected items. Use short single-word values where possible.

Input: ${desc}`;
}

function buildBlocksPrompt(description: string, option: string): string {
  const desc = description.slice(0, 300);
  // Catalog section is one terse line per block (~35 lines for the "core"
  // subset). The LLM is constrained to choose `type` from this list and
  // populate `config` with the listed required params.
  const catalog = buildCatalogPromptSection('core');
  return `Compose an ETL pipeline. Output ONLY valid JSON (no markdown).

SCHEMA:
{"blocks":[{"id":"n1","type":"<from_catalog>","label":"","config":{}}],"edges":[{"from":"n1","to":"n2","targetHandle":"input1"}]}

CATALOG (one line per block; pick "type" from this list):
${catalog}

RULES:
- "type" MUST be one of the catalog rows above.
- Include all "required" params in "config" — use "" for values the user did not specify.
- Blocks with I=· (no input) take no incoming edges. Blocks with O=· (no output) take no outgoing edges.
- Edges into a block with multiple input ports MUST set targetHandle (input1, input2, …). Missing targetHandle on a multi-input target is an ERROR.
- Examples of multi-input blocks: join (input1=left, input2=right), union, sql_script, python_script.
- Aim for 3-7 blocks: a source, the transforms needed, and a destination.

Goal: ${desc}
Approach: ${option}`;
}

function buildCodePrompt(workflow: { nodes: Node[]; edges: Edge[] } | null): string {
  const summary = workflow
    ? `${workflow.nodes.length} blocks: ${workflow.nodes.map((n) => `${n.id}(${n.type})`).join(',')}`
    : '(none)';
  return `Output ONLY this JSON with short snippets (max 20 lines each):
{"sql":"","python":"","yaml":""}

Workflow: ${summary}`;
}

/**
 * Best-effort LLM JSON parser.
 *
 * Handles 5 failure modes we've actually observed in prod with Mistral:
 *  1. Markdown code fences (```json ... ```) — stripped
 *  2. Leading commentary before the first `{` / `[` — sliced off
 *  3. **Truncated JSON** (token cap mid-response) — count braces/brackets
 *     ignoring those inside strings, then append the missing closers
 *  4. **Dangling key:value AFTER the closing `}`** — Mistral sometimes
 *     produces this:
 *        {
 *          "business_context": {...},
 *          "sources_detected": [...]
 *        }
 *        "intent_confidence": 85
 *     We parse what's before the close, then scan the trailing text for
 *     `"key": value` patterns and merge them as additional top-level keys
 *  5. **Last-ditch regex extraction** — pull individual fields with regex
 *     and rebuild the object. Loses arrays/nested objects but at least
 *     keeps scalars so the wizard can advance.
 *
 * Returns null only if even regex extraction fails.
 */
function parseLlmJson<T>(raw: string): T | null {
  // 1. Strip code fences
  let s = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // 2. Slice from first '{' or '[' to the end
  const firstBrace = s.search(/[{[]/);
  if (firstBrace > 0) s = s.slice(firstBrace);

  // 3. Try as-is
  try {
    return JSON.parse(s) as T;
  } catch {
    /* fall through */
  }

  // 4. Brace-depth scan: tracks balance + records the index AFTER the last
  // moment we were back at depth 0 (i.e. last balanced position).
  let depthBrace = 0;
  let depthBracket = 0;
  let inString = false;
  let escape = false;
  let lastBalanced = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depthBrace++;
    else if (c === '}') depthBrace--;
    else if (c === '[') depthBracket++;
    else if (c === ']') depthBracket--;
    if (depthBrace === 0 && depthBracket === 0 && (c === '}' || c === ']')) {
      lastBalanced = i + 1;
    }
  }

  // 5. TRUNCATED — string ends mid-content. Append closers.
  if (depthBrace > 0 || depthBracket > 0 || inString) {
    let repaired = s;
    if (inString) repaired += '"';
    while (depthBracket-- > 0) repaired += ']';
    while (depthBrace-- > 0) repaired += '}';
    try {
      return JSON.parse(repaired) as T;
    } catch {
      /* fall through */
    }
  }

  // 6. DANGLING KEY:VALUE — the JSON parsed up to lastBalanced but there
  // are extra `"key": value` pairs after it. Pull them in.
  if (lastBalanced > 0 && lastBalanced < s.length) {
    const body = s.slice(0, lastBalanced);
    const trailing = s.slice(lastBalanced);
    let base: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = parsed as Record<string, unknown>;
      }
    } catch {
      /* base parse failed */
    }
    if (base) {
      // Scan trailing for `"key": <json-value>` pairs. The value can be a
      // number, string, bool, null, or another JSON-ish chunk — we let
      // JSON.parse decide for each candidate.
      // Match: optional whitespace/comma, "key", colon, then capture until
      // the next comma-followed-by-quote or end-of-string.
      const re = /"([A-Za-z_][\w-]*)"\s*:\s*([^\n]+?)(?=[,\n]\s*"|$)/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(trailing)) !== null) {
        const key = match[1];
        // Trim trailing commas / whitespace / closing braces from the value
        const rawVal = match[2].replace(/[,\s}]+$/, '').trim();
        if (!rawVal) continue;
        try {
          base[key] = JSON.parse(rawVal);
        } catch {
          // Strip surrounding quotes and use as string
          base[key] = rawVal.replace(/^"|"$/g, '');
        }
      }
      return base as T;
    }
  }

  // 7. REGEX EXTRACTION — last-ditch field-by-field rebuild. Only catches
  // the fields the wizard actually reads. Anything missed gets sensible
  // defaults so the UI still renders.
  return regexExtractFallback<T>(s);
}

/**
 * If the AI returns something so broken that brace-balance + dangling-pair
 * merge both fail, fall back to regex-extracting just the keys the wizard
 * needs and constructing a synthetic object. Used as a last resort so the
 * user can still advance through the wizard with partial data.
 */
function regexExtractFallback<T>(s: string): T | null {
  const result: Record<string, unknown> = {};

  // Try to grab the top-level object/array fields by name. These three
  // shapes cover all 3 AI calls the wizard makes (understanding,
  // blocks, code-config).
  const objectish = (key: string): unknown => {
    // Match `"key": { ... }` or `"key": [ ... ]` with balanced brackets
    const idx = s.indexOf(`"${key}"`);
    if (idx === -1) return undefined;
    const after = s.slice(idx + key.length + 2).replace(/^\s*:\s*/, '');
    if (after[0] !== '{' && after[0] !== '[') return undefined;
    const open = after[0];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < after.length; i++) {
      const c = after[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(after.slice(0, i + 1)); } catch { return undefined; }
        }
      }
    }
    return undefined;
  };
  const scalar = (key: string): unknown => {
    const re = new RegExp(`"${key}"\\s*:\\s*("[^"]*"|-?\\d+(?:\\.\\d+)?|true|false|null)`);
    const m = re.exec(s);
    if (!m) return undefined;
    try { return JSON.parse(m[1]); } catch { return undefined; }
  };

  // Pull whatever exists. The wizard's render code already tolerates
  // missing fields (uses optional chaining + fallback strings).
  for (const k of ['business_context', 'sources_detected', 'blocks', 'edges']) {
    const v = objectish(k);
    if (v !== undefined) result[k] = v;
  }
  for (const k of ['intent_confidence', 'sql', 'python', 'yaml']) {
    const v = scalar(k);
    if (v !== undefined) result[k] = v;
  }

  return Object.keys(result).length > 0 ? (result as T) : null;
}

/**
 * Streaming partial-JSON parser for the blocks-prompt response.
 *
 * The blocks prompt asks Cortex to return:
 *   {"blocks":[{"id":"n1","type":"...", ...}, {...}], "edges":[...]}
 *
 * As the buffer grows (whether via real chunked transfer or our simulated
 * stream), we scan for complete `{...}` objects INSIDE the `blocks` array
 * and yield each one as soon as it's balanced. The edges array is parsed
 * once the buffer is complete (via the normal `parseLlmJson` path).
 *
 * Returns the array of complete block objects found in the buffer so far
 * (ordered by appearance) and the byte offset up to which we've already
 * consumed — callers pass it back on the next tick so we never re-emit
 * blocks. The walker is brace-depth aware and string-aware so `"foo,bar"`
 * inside a value doesn't trip the depth counter.
 */
function streamParseBlocks(
  buffer: string,
  startOffset: number,
): { blocks: BlockPreview[]; nextOffset: number } {
  // Find the start of the blocks array if we haven't already.
  let cursor = startOffset;
  if (cursor === 0) {
    // Locate `"blocks"` followed by `[`. The array can be empty initially.
    const arrIdx = buffer.search(/"blocks"\s*:\s*\[/);
    if (arrIdx === -1) return { blocks: [], nextOffset: 0 };
    cursor = buffer.indexOf('[', arrIdx) + 1;
  }

  const blocks: BlockPreview[] = [];
  let i = cursor;
  while (i < buffer.length) {
    // Skip whitespace, commas, end-of-array
    while (i < buffer.length && /[\s,]/.test(buffer[i])) i++;
    if (i >= buffer.length) break;
    if (buffer[i] === ']') {
      // End of blocks array reached.
      cursor = i;
      break;
    }
    if (buffer[i] !== '{') {
      // Unexpected char — buffer is still arriving, wait for next chunk.
      break;
    }
    // Walk a balanced object from i.
    const objStart = i;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let objEnd = -1;
    for (let j = i; j < buffer.length; j++) {
      const c = buffer[j];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          objEnd = j + 1;
          break;
        }
      }
    }
    if (objEnd === -1) {
      // Object not balanced yet — wait for more buffer.
      break;
    }
    const slice = buffer.slice(objStart, objEnd);
    try {
      const parsed = JSON.parse(slice) as BlockPreview;
      if (parsed && typeof parsed === 'object' && parsed.id && parsed.type) {
        blocks.push(parsed);
      }
    } catch {
      // Malformed individual object — skip and continue. The final
      // full-buffer parseLlmJson pass will catch it via fallback.
    }
    cursor = objEnd;
    i = objEnd;
  }
  return { blocks, nextOffset: cursor };
}

/**
 * Normalize the AI's `intent_confidence` field. Mistral-7b often returns
 * 0.85 (decimal 0-1) even when the prompt says 0-100. We accept either
 * and always store/render as an integer 0-100.
 */
function normalizeConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  // Values 0-1 are treated as a fraction
  if (n > 0 && n <= 1) return Math.round(n * 100);
  // Otherwise clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Fill missing `targetHandle` on edges entering multi-input blocks
 * (join, union, sql_script with maxInputs > 1, …) and drop edges that
 * exceed the block's `maxInputs` capacity.
 *
 * The LLM is asked to set targetHandle in the prompt, but Mistral-7b
 * frequently omits it on the second / third incoming edge. Without a
 * handle id, ReactFlow draws the edge to the FIRST handle of the target,
 * which silently collapses two upstream sources onto one port and breaks
 * the join. This pass guarantees every multi-input target gets distinct
 * `input1`..`inputN` handles.
 *
 * Returns the repaired edges + the count dropped so the UI can toast.
 */
function repairMultiInputEdges(
  blocks: BlockPreview[],
  edges: EdgePreview[],
): { edges: EdgePreview[]; dropped: number } {
  // Group edges by target, preserving stable order (insertion + source asc
  // as a tiebreak so the same input deterministically lands on input1).
  const byTarget = new Map<string, (EdgePreview & { __idx: number })[]>();
  edges.forEach((e, idx) => {
    if (!byTarget.has(e.to)) byTarget.set(e.to, []);
    byTarget.get(e.to)!.push({ ...e, __idx: idx });
  });

  let dropped = 0;
  const out: (EdgePreview & { __idx: number })[] = [];
  byTarget.forEach((group, targetId) => {
    const block = blocks.find((b) => b.id === targetId);
    const def = block ? BLOCK_BY_TYPE.get(block.type) : undefined;
    const maxInputs = def?.ports.maxInputs ?? 1;

    if (maxInputs <= 1) {
      // Single-input target: handle id not needed. Drop surplus.
      group.forEach((e, i) => {
        if (i === 0) out.push(e);
        else dropped++;
      });
      return;
    }

    // Multi-input target: assign input1..inputN in stable order, drop overflow.
    const sorted = [...group].sort((a, b) => {
      const ai = (a as EdgePreview & { __idx: number }).__idx;
      const bi = (b as EdgePreview & { __idx: number }).__idx;
      if (ai !== bi) return ai - bi;
      return a.from.localeCompare(b.from);
    });
    sorted.forEach((e, i) => {
      if (i >= maxInputs) {
        dropped++;
        return;
      }
      out.push({ ...e, targetHandle: e.targetHandle ?? `input${i + 1}` });
    });
  });

  // Restore original insertion order, then strip the internal __idx marker.
  out.sort((a, b) => a.__idx - b.__idx);
  const cleaned: EdgePreview[] = out.map((e) => {
    const copy = { ...e } as EdgePreview & { __idx?: number };
    delete copy.__idx;
    return copy;
  });
  return { edges: cleaned, dropped };
}

// Catalog-driven layout. Ranks each block by its catalog category (source
// → 0, transforms → 2, AI/ML → 3, destination → 4) so the canvas reads
// left→right. Emits data in the dual-key convention the registered node
// components use (`data.config?.X || data.X`) so the real iconified blocks
// (SourceNode, AiSentimentNode, …) render their fields immediately.
function layoutBlocks(
  blocks: BlockPreview[],
  edges: EdgePreview[],
): { nodes: Node[]; edges: Edge[] } {
  const byRank = new Map<number, BlockPreview[]>();
  for (const b of blocks) {
    const r = rankForType(b.type);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(b);
  }
  const X = 280;
  const Y = 140;
  const nodes: Node[] = [];
  const sortedRanks = Array.from(byRank.keys()).sort((a, b) => a - b);
  for (const rank of sortedRanks) {
    const group = byRank.get(rank)!;
    group.forEach((b, idx) => {
      const cfg = b.config ?? {};
      nodes.push({
        id: b.id,
        type: b.type,
        position: { x: rank * X, y: idx * Y },
        // Spread cfg AND nest as `config` — the registered ETLNodeTypes
        // components read `data.config?.X || data.X`, so both paths work
        // for live preview AND when the saved workflow is reloaded.
        data: {
          ...cfg,
          label: b.label,
          name: b.label,
          aiGenerated: true,
          config: cfg,
        },
      });
    });
  }
  const rfEdges: Edge[] = edges
    .filter((e) => blocks.find((b) => b.id === e.from) && blocks.find((b) => b.id === e.to))
    .map((e, i) => ({
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      targetHandle: e.targetHandle,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
      style: { strokeWidth: 2, stroke: '#10B981' },
    }));
  return { nodes, edges: rfEdges };
}

// ───────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Called once the user accepts the generated workflow at step 9. The
   * parent receives the layout nodes/edges and the original description
   * (used to name the auto-saved draft project).
   */
  onCreated: (
    nodes: Node[],
    edges: Edge[],
    meta: {
      description: string;
      /**
       * Per-dimension self-review captured at step 3. The parent currently
       * only reads `description`, but we surface `compliance_review` in the
       * payload so when the workflow project payload is extended to persist
       * it (e.g. `details.compliance_review = {...}`), the data is already
       * flowing. Adding fields is non-breaking for current consumers.
       */
      compliance_review?: Record<string, 'reviewed' | 'unchecked'>;
    },
  ) => void;
  /** Credits available for display only (top-right counter). */
  creditsAvailable?: number;
  /**
   * Optional pre-seed for step 1's description. When the wizard opens
   * (false→true) and this is set, `state.description` is populated so the
   * user doesn't re-type text they already gave the UnifiedProjectWizard.
   */
  initialDescription?: string;
  /**
   * Render inline (no modal backdrop / centered card) so the flow can live
   * as the "AI Assist" tab inside the workflow right pane. When true, the
   * component fills its parent container instead of floating as a dialog.
   */
  embedded?: boolean;
}

export default function GuidedAiWorkflowWizard({
  open,
  onClose,
  onCreated,
  creditsAvailable = 12_450,
  initialDescription,
  embedded = false,
}: Props) {
  const [state, setState] = useState<WizardState>({
    step: 1,
    description: '',
    understanding: null,
    compliance: DEFAULT_COMPLIANCE,
    selectedOption: null,
    newRequests: [],
    workflow: null,
    generatedSql: '',
    generatedPython: '',
    generatedYaml: '',
    isGenerating: false,
    skeletonLabels: [],
    cacheStatus: { understanding: null, workflow: null, code: null },
    precomputedPreviews: {},
  });
  // Live region for a11y — announces streaming progress so screen-reader
  // users know blocks are landing on the canvas.
  const [liveAnnounce, setLiveAnnounce] = useState<string>('');
  const [busy, setBusy] = useState(false);
  // Persistent error banner across steps. Cleared on retry / step change.
  // Distinguishes "timeout" (warehouse SQL limit) from "parse" (malformed
  // LLM output) so the UI can suggest different remediations.
  const [aiError, setAiError] = useState<
    | { kind: 'timeout'; retry: () => Promise<void> }
    | { kind: 'parse'; retry: () => Promise<void>; raw?: string }
    | { kind: 'other'; message: string; retry: () => Promise<void> }
    | null
  >(null);

  const setStep = (s: StepId) => {
    setState((p) => ({ ...p, step: s }));
    setAiError(null); // clearing on step change keeps the banner from haunting
  };

  // Seed step 1's description from `initialDescription` when the wizard
  // opens. `handleClose` resets `description` to '' on close, so we re-seed
  // on every false→true transition rather than only on mount.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const seed = initialDescription?.trim();
      if (seed) {
        setState((p) => ({ ...p, description: seed }));
      }
    }
    wasOpenRef.current = open;
  }, [open, initialDescription]);

  // AI cost surfacing — track per-call charges into the session/monthly stores
  // so the floating counter and Credits tab reflect wizard activity.
  const trackCharge = useTrackAiCharge();
  const understandingEstimate = useAiCostEstimate('cortex_complete', {
    prompt_chars: state.description.length,
  });
  const generateEstimate = useAiCostEstimate('cortex_complete', {
    // Step 6→7 prompt is much larger (description + catalog grounding).
    prompt_chars: state.description.length + 3000,
  });
  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((p) => ({ ...p, [key]: value }));
  }, []);

  // Step 7 side panel writes into here. We update both `data.<key>` and
  // `data.config.<key>` so the registered node components (which read
  // either path) reflect the change immediately on the mini-canvas.
  const updateNodeConfig = useCallback(
    (nodeId: string, partial: Record<string, unknown>) => {
      setState((p) => {
        if (!p.workflow) return p;
        const newNodes = p.workflow.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const prevData = (n.data ?? {}) as Record<string, unknown>;
          const prevConfig = (prevData.config ?? {}) as Record<string, unknown>;
          const nextConfig = { ...prevConfig, ...partial };
          return {
            ...n,
            data: { ...prevData, ...partial, config: nextConfig },
          };
        });
        return { ...p, workflow: { ...p.workflow, nodes: newNodes } };
      });
    },
    [],
  );

  /**
   * Call /cortex/complete with a 20s frontend timeout race. The backend
   * already has a 15s SQL limit; this race ensures the UI doesn't hang
   * indefinitely if the network is also slow. Returns classified error
   * shapes so the caller can surface the right banner.
   *
   * The `cacheKey` argument (when provided) makes the call cache-aware:
   *   - on hit: returns the cached text synchronously (no network, no
   *     credit charge) and reports `source: 'cached'`.
   *   - on miss: makes the real call and writes the response to cache
   *     keyed by `cacheKey`, with `kind` indicating which wizard step.
   *
   * Cache is bypassed when `cacheKey` is undefined (e.g. test paths) or
   * when the caller has already called `clearCache(cacheKey)` before this
   * call — that's how the QA "Regenerate" requirement is satisfied: every
   * retry closure clears its key before re-invoking the action.
   */
  const callCortex = async (
    prompt: string,
    cacheKey?: string,
    cacheKind?: 'understanding' | 'workflow' | 'code',
  ): Promise<{ text: string; source: 'live' | 'cached' }> => {
    if (cacheKey) {
      const cached = getCached(cacheKey);
      if (cached !== null) {
        return { text: cached, source: 'cached' };
      }
    }
    const timeoutMs = 20_000;
    const result = await Promise.race<
      | { ok: true; text: string }
      | { ok: false; reason: 'timeout' | 'error'; message?: string }
    >([
      generateCompletion({ prompt, model: 'mistral-7b' })
        .then((r) => ({ ok: true as const, text: r?.response ?? '' }))
        .catch((e) => ({
          ok: false as const,
          reason: 'error' as const,
          message: e instanceof Error ? e.message : String(e),
        })),
      new Promise<{ ok: false; reason: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: 'timeout' }), timeoutMs),
      ),
    ]);
    if (result.ok) {
      if (cacheKey && cacheKind) {
        setCached(cacheKey, result.text, cacheKind);
      }
      return { text: result.text, source: 'live' };
    }
    if (result.reason === 'timeout') {
      throw new Error('TIMEOUT');
    }
    // Backend may return the snowflake QUERY_CANCELLED payload as the
    // message — detect it and re-classify so the UI shows a friendlier
    // "warehouse timed out" banner.
    const msg = result.message ?? 'AI error';
    if (/QUERY_CANCELLED|timeout|cancel/i.test(msg)) {
      throw new Error('TIMEOUT');
    }
    throw new Error(msg);
  };

  /**
   * Streaming variant of `callCortex` used for the workflow-generation step.
   *
   * Snowflake Cortex `/cortex/complete` does NOT expose a chunked transfer
   * — the existing `generateCompletion` waits for the full response. To
   * preserve the "Superadmin sees blocks land one at a time" persona
   * requirement, we wrap the full response with a SIMULATED streaming
   * loop: once the buffer arrives, we re-emit it in ~80-char chunks every
   * ~30ms so the parsing callback fires repeatedly, matching the rhythm of
   * a real LLM stream. The user perceives blocks landing incrementally.
   *
   * If/when the backend grows real streaming support, replace the body of
   * the inner loop with a `body.getReader()` pump — the `onChunk` contract
   * stays the same.
   *
   * Cache-aware: a cache hit re-streams synchronously over a few ticks so
   * the "blocks landing" animation still plays (otherwise the entire
   * canvas would pop into existence and the cached chip would feel jarring
   * relative to a live run).
   */
  const callCortexStream = async (
    prompt: string,
    onChunk: (bufferSoFar: string) => void,
    cacheKey?: string,
    cacheKind?: 'understanding' | 'workflow' | 'code',
  ): Promise<{ text: string; source: 'live' | 'cached' }> => {
    const full = await callCortex(prompt, cacheKey, cacheKind);

    // Simulated streaming: walk the buffer in chunks of ~80 chars on a
    // 30ms tick. The parsing callback may bail early if it finishes
    // mounting blocks before the buffer is drained — that's fine, we
    // still return the final text.
    const chunkSize = 80;
    const tickMs = 30;
    let cursor = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (cursor >= full.text.length) {
          onChunk(full.text);
          resolve();
          return;
        }
        cursor = Math.min(full.text.length, cursor + chunkSize);
        onChunk(full.text.slice(0, cursor));
        if (cursor >= full.text.length) {
          resolve();
        } else {
          setTimeout(tick, tickMs);
        }
      };
      tick();
    });
    return full;
  };

  const handleClose = () => {
    if (busy) return;
    // Reset on close so reopening starts fresh
    setState({
      step: 1,
      description: '',
      understanding: null,
      compliance: DEFAULT_COMPLIANCE,
      selectedOption: null,
      newRequests: [],
      workflow: null,
      generatedSql: '',
      generatedPython: '',
      generatedYaml: '',
      isGenerating: false,
      skeletonLabels: [],
      cacheStatus: { understanding: null, workflow: null, code: null },
      precomputedPreviews: {},
    });
    setAiError(null);
    setLiveAnnounce('');
    onClose();
  };

  // Esc-to-close (modal overlay previously only closed via the header X /
  // backdrop). Skipped when `embedded` (no overlay) and routed through
  // `handleClose`, which itself no-ops while `busy` so a mid-generation run
  // is never interrupted.
  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, embedded, busy]);

  // ── Step 1 → 2: AI Understanding ──
  //
  // The `bust` arg makes this function cache-aware: on a normal call we
  // hit the cache; on a Retry/Regenerate click we pass `bust=true` so the
  // matching key is cleared first, satisfying the QA persona's "regen
  // must bust the cache" contract.
  const runUnderstanding = async (bust: boolean = false) => {
    if (!state.description.trim()) {
      toast.error('Describe your workflow first');
      return;
    }
    setBusy(true);
    setAiError(null);
    const cacheKey = hashKey(
      'understanding',
      state.description.trim(),
      '', // no option at this step
      'mistral-7b',
    );
    if (bust) clearCache(cacheKey);
    try {
      const { text: raw, source } = await callCortex(
        buildUnderstandingPrompt(state.description.trim()),
        cacheKey,
        'understanding',
      );
      // Only charge credits on a LIVE call — cached responses are free.
      if (source === 'live') {
        trackCharge('cortex_complete', understandingEstimate.credits);
      }
      const parsed = parseLlmJson<AiUnderstanding>(raw);
      if (!parsed) {
        setAiError({ kind: 'parse', retry: () => runUnderstanding(true), raw });
        return;
      }
      // Normalize the confidence field — Mistral often returns a fraction
      // (e.g. 0.85) even when the prompt says "0-100". Defensive cast keeps
      // the UI bar accurate regardless of which scale the model picked.
      const normalized: AiUnderstanding = {
        ...parsed,
        intent_confidence: normalizeConfidence(parsed.intent_confidence),
      };
      setState((p) => ({
        ...p,
        understanding: normalized,
        cacheStatus: { ...p.cacheStatus, understanding: source },
        step: 2,
      }));
      setAiError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TIMEOUT') {
        setAiError({ kind: 'timeout', retry: () => runUnderstanding(true) });
      } else {
        setAiError({ kind: 'other', message: msg, retry: () => runUnderstanding(true) });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Step 4 → 5: select option ──
  const chooseOption = (id: RecommendationOption['id']) => {
    update('selectedOption', id);
    // No fake seeds. Step 6 now renders an empty state + a BackendGapNote-style
    // chip for the Advanced tier explaining that real source/block requests
    // will appear once the POST /workflow/requests endpoint exists.
    update('newRequests', []);
    setStep(5);
  };

  // ── Step 6 → 7: generate workflow blocks ──
  //
  // Strategy: ask Cortex grounded on the real catalog. As tokens stream in
  // (simulated — see `callCortexStream`), each complete `{...}` block JSON
  // is parsed and mounted on the preview canvas one at a time so the user
  // sees the workflow assemble live. If anything goes wrong (network down,
  // parse fails, types not in catalog, no source or destination), fall back
  // to the deterministic keyword-based generator so the user always lands
  // on a real, configurable preview instead of a dead-end "parse error"
  // banner.
  //
  // The wizard transitions to step 7 IMMEDIATELY (with a skeleton — see
  // `isGenerating` state), not after the response lands. Blocks fade in
  // via AnimatePresence as the streaming parser yields them.
  const generateWorkflow = async (bust: boolean = false) => {
    setBusy(true);
    setAiError(null);

    // Populate skeleton labels from the deterministic fallback's first
    // pass so the placeholders hint at the SHAPE of the workflow (e.g.
    // "Source · Filter · Aggregate · Destination") rather than 4 generic
    // boxes. Pure UX, no extra cost.
    const skeletonShape = fallbackGenerateWorkflow(state.description);
    const skeletonLabels = skeletonShape.blocks.slice(0, 6).map((b) => b.label);

    // Instant transition to step 7 with skeletons. The real blocks land
    // as the stream parser yields them.
    setState((p) => ({
      ...p,
      isGenerating: true,
      skeletonLabels,
      // Reset workflow so the skeleton-vs-real conditional renders correctly.
      workflow: null,
      step: 7,
    }));
    setLiveAnnounce('AI is thinking — generating workflow blocks.');

    const optionLabel =
      DEFAULT_OPTIONS.find((o) => o.id === state.selectedOption)?.title ?? 'Best balance';
    const cacheKey = hashKey(
      'workflow',
      state.description.trim(),
      optionLabel,
      'mistral-7b',
    );
    if (bust) clearCache(cacheKey);

    const applyFallback = (reason: string) => {
      // Drop the cached Cortex response that led us here. `callCortex` writes
      // every successful (HTTP-OK) response to cache BEFORE the wizard checks
      // whether the graph is usable — so a parseable-but-unusable answer
      // would otherwise be re-served on every re-open of the same draft,
      // silently forcing the fallback forever with no Retry affordance.
      // Busting the key means the next run re-fires Cortex for a fresh try.
      clearCache(cacheKey);
      const wf = layoutBlocks(skeletonShape.blocks, skeletonShape.edges);
      setState((p) => ({
        ...p,
        workflow: wf,
        isGenerating: false,
        cacheStatus: { ...p.cacheStatus, workflow: 'live' },
      }));
      setLiveAnnounce(`Generated ${wf.nodes.length} blocks from catalog template.`);
      toast(`AI offline — using catalog template (${reason}). Configure each block below.`, {
        icon: '🛟', duration: 4500,
      });
    };

    // Track partial blocks emitted by the streaming parser so we can mount
    // them incrementally without re-mounting blocks already on the canvas.
    let lastEmittedCount = 0;
    let streamOffset = 0;

    try {
      const { text: raw, source } = await callCortexStream(
        buildBlocksPrompt(state.description, optionLabel),
        (buffer) => {
          const { blocks: partial, nextOffset } = streamParseBlocks(buffer, streamOffset);
          if (partial.length > lastEmittedCount) {
            // Mount the new blocks (without edges — edges arrive at end of
            // stream because they reference ids that may not all exist yet).
            const wf = layoutBlocks(partial, []);
            setState((p) => ({ ...p, workflow: wf }));
            setLiveAnnounce(
              `Mounted block ${partial.length}${
                skeletonLabels.length ? ` of ~${skeletonLabels.length}` : ''
              }.`,
            );
            lastEmittedCount = partial.length;
          }
          if (nextOffset > streamOffset) streamOffset = nextOffset;
        },
        cacheKey,
        'workflow',
      );

      // Only charge credits on a LIVE call.
      if (source === 'live') {
        trackCharge('cortex_complete', generateEstimate.credits);
      }

      const parsed = parseLlmJson<{ blocks: BlockPreview[]; edges: EdgePreview[] }>(raw);
      if (!parsed || !isUsableGraph(parsed.blocks ?? [], parsed.edges ?? [])) {
        applyFallback('output not catalog-grounded');
        return;
      }
      // Heuristic recovery: when the LLM forgets targetHandle on edges into
      // multi-input blocks (join/union/sql_script/python_script with
      // maxInputs > 1), assign input1/input2/... in stable order so the
      // graph passes validation on the first try. Surplus edges beyond
      // maxInputs are dropped + the user is warned.
      const { edges: repairedEdges, dropped } = repairMultiInputEdges(
        parsed.blocks,
        parsed.edges,
      );
      if (dropped > 0) {
        toast(`Trimmed ${dropped} extra edge${dropped === 1 ? '' : 's'} that exceeded a block's input capacity.`, {
          icon: '⚠️', duration: 4500,
        });
      }
      const wf = layoutBlocks(parsed.blocks, repairedEdges);
      setState((p) => ({
        ...p,
        workflow: wf,
        isGenerating: false,
        cacheStatus: { ...p.cacheStatus, workflow: source },
      }));
      setLiveAnnounce(`All ${wf.nodes.length} blocks mounted. Configure each block.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Network/timeout: drop to fallback so the user is not blocked.
      applyFallback(msg === 'TIMEOUT' ? 'AI timed out' : 'AI unreachable');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 7 → 8: generate code ──
  //
  // Cache key is built from the workflow shape (block ids + types) so two
  // identical pipelines share a code snippet. Retry passes `bust=true`.
  const generateCode = async (bust: boolean = false) => {
    setBusy(true);
    setAiError(null);
    // The "option" axis of the cache key is repurposed here as a workflow
    // shape signature — keeps the key API uniform across the three calls.
    const shapeSig = state.workflow
      ? state.workflow.nodes.map((n) => `${n.id}:${n.type}`).join('|')
      : 'empty';
    const cacheKey = hashKey('code', state.description.trim(), shapeSig, 'mistral-7b');
    if (bust) clearCache(cacheKey);
    try {
      const { text: raw, source } = await callCortex(
        buildCodePrompt(state.workflow),
        cacheKey,
        'code',
      );
      const parsed = parseLlmJson<{ sql: string; python: string; yaml: string }>(raw);
      if (!parsed) {
        setAiError({ kind: 'parse', retry: () => generateCode(true), raw });
        return;
      }
      setState((p) => ({
        ...p,
        generatedSql: parsed.sql ?? '',
        generatedPython: parsed.python ?? '',
        generatedYaml: parsed.yaml ?? '',
        cacheStatus: { ...p.cacheStatus, code: source },
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TIMEOUT') {
        setAiError({ kind: 'timeout', retry: () => generateCode(true) });
      } else {
        setAiError({ kind: 'other', message: msg, retry: () => generateCode(true) });
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Parallel pre-flight pre-warm — fired in parallel BEFORE we mount step 8.
   *
   * Today `WizardPreflightPanel`'s source-data preview phase walks every
   * source block one at a time in a `for` loop with `await getTablePreview`
   * — N sources = N×RTT sequentially. We pre-fire all of them as
   * `Promise.allSettled` here and pass the results to the panel via the
   * `precomputedSourcePreviews` prop so the panel can seed state and skip
   * its sequential loop. The code-gen call is folded into the same
   * Promise.allSettled so the user waits a single max(...) rather than
   * sum(...). This is the parallel pre-flight optimization (item 4).
   *
   * Note: `WizardPreflightPanel.tsx` required a tiny additive change (one
   * optional prop) to consume the precomputed results — the alternative
   * (just pre-warming axios) would have been a no-op because axios doesn't
   * dedupe POST requests, so the panel would refire all calls anyway.
   */
  const prewarmPreflight = useCallback(async (): Promise<void> => {
    if (!state.workflow) return;
    // Find source blocks that have database+schema+table configured.
    const sourceBlocks = state.workflow.nodes
      .filter((n) => {
        const def = BLOCK_BY_TYPE.get(String(n.type));
        return def && def.category === 'source';
      })
      .map((n) => {
        const data = (n.data ?? {}) as Record<string, unknown>;
        const cfg = (data.config ?? {}) as Record<string, unknown>;
        return {
          nodeId: n.id,
          database: String(cfg.database ?? data.database ?? ''),
          schema: String(cfg.schema ?? data.schema ?? ''),
          table: String(cfg.table ?? data.table ?? ''),
        };
      })
      .filter((s) => s.database && s.schema && s.table);

    if (sourceBlocks.length === 0) return;

    // Fire all previews in parallel + the code-gen call is already in
    // flight from the step-7 next handler.
    const results = await Promise.allSettled(
      sourceBlocks.map((s) =>
        getTablePreview(s.database, s.schema, s.table, 5, 0).then((data) => ({
          nodeId: s.nodeId,
          data,
        })),
      ),
    );

    const previews: WizardState['precomputedPreviews'] = {};
    results.forEach((r, idx) => {
      const nodeId = sourceBlocks[idx].nodeId;
      if (r.status === 'fulfilled') {
        previews[nodeId] = { status: 'ok', data: r.value.data };
      } else {
        const err = r.reason;
        previews[nodeId] = {
          status: 'err',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });
    setState((p) => ({ ...p, precomputedPreviews: previews }));
  }, [state.workflow]);

  // ── Step 9: hand off to the canvas ──
  const createInBuilder = () => {
    if (!state.workflow) {
      toast.error('No workflow to create');
      return;
    }
    // Build the self-review record. Reviewers reading the project payload
    // will see exactly which dimensions the author attested to having read.
    const complianceReview = state.compliance.reduce<
      Record<string, 'reviewed' | 'unchecked'>
    >((acc, c) => {
      acc[c.key] = c.status;
      return acc;
    }, {});
    onCreated(state.workflow.nodes, state.workflow.edges, {
      description: state.description,
      compliance_review: complianceReview,
    });
    // Parent surfaces its own toast after the auto-save completes — we
    // skip the success toast here to avoid two stacking messages.
    handleClose();
  };

  if (!open && !embedded) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={
          embedded
            ? 'relative flex h-full w-full'
            : 'fixed inset-0 z-50 flex items-stretch justify-stretch bg-slate-900/50 backdrop-blur-sm'
        }
        onClick={embedded ? undefined : handleClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className={
            embedded
              ? 'flex h-full w-full flex-col overflow-hidden bg-white dark:bg-slate-900'
              : 'm-auto flex h-[min(900px,95vh)] w-[min(1100px,95vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900'
          }
        >
          {/* ── Top bar: title + phase progress + credits ── */}
          <TopBar
            currentStep={state.step}
            creditsAvailable={creditsAvailable}
            onClose={handleClose}
            onClearCache={() => {
              const before = countCached();
              clearCache('wizard:');
              setState((p) => ({
                ...p,
                cacheStatus: { understanding: null, workflow: null, code: null },
              }));
              toast.success(`Cleared ${before} cached AI response${before === 1 ? '' : 's'}.`);
            }}
          />

          {/* ── Single a11y live region for streaming progress ──
              Updated by `generateWorkflow` as blocks land ("Mounted
              block 3 of 5"). Placed near the top so a screen reader
              announces it regardless of which step is mounted. */}
          <div role="status" aria-live="polite" className="sr-only">
            {liveAnnounce}
          </div>

          {/* ── Persistent AI error banner ──
              Lives above the step body so the user sees it regardless of
              which step triggered the failure. Shows tailored copy +
              Retry / Skip controls based on error kind. */}
          <AnimatePresence>
            {aiError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-b border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900/40 dark:from-amber-950/40 dark:to-orange-950/30"
              >
                <div className="flex items-start gap-3 px-8 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                      {aiError.kind === 'timeout'
                        ? 'AI took too long'
                        : aiError.kind === 'parse'
                          ? "AI returned something we couldn't parse"
                          : 'AI call failed'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                      {aiError.kind === 'timeout'
                        ? 'The AI engine timed out (15s limit). Try a shorter description, a less complex workflow, or retry — sometimes the second attempt lands faster.'
                        : aiError.kind === 'parse'
                          ? "The model's response wasn't valid JSON. Tweak the description or just retry."
                          : aiError.message}
                    </p>
                    {aiError.kind === 'parse' && aiError.raw && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[10px] text-amber-700 underline dark:text-amber-400">
                          show raw response
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-amber-100 p-2 text-[10px] text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                          {aiError.raw}
                        </pre>
                      </details>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => void aiError.retry()}
                      disabled={busy}
                      className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setAiError(null)}
                      className="rounded-md p-1 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step body ── */}
          <div className="relative flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={state.step}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="px-8 py-6"
              >
                {state.step === 1 && (
                  <Step1Describe
                    value={state.description}
                    onChange={(v) => update('description', v)}
                  />
                )}
                {state.step === 2 && state.understanding && (
                  <Step2Understanding
                    data={state.understanding}
                    cacheStatus={state.cacheStatus.understanding}
                  />
                )}
                {state.step === 3 && (
                  <Step3Compliance
                    cards={state.compliance}
                    onChange={(c) => update('compliance', c)}
                  />
                )}
                {state.step === 4 && (
                  <Step4Recommendations
                    selected={state.selectedOption}
                    onChoose={chooseOption}
                  />
                )}
                {state.step === 5 && state.selectedOption && (
                  <Step5OptionDetails
                    option={
                      DEFAULT_OPTIONS.find((o) => o.id === state.selectedOption)!
                    }
                    understanding={state.understanding}
                  />
                )}
                {state.step === 6 && (
                  <Step6NewRequests
                    requests={state.newRequests}
                    selectedOption={state.selectedOption}
                  />
                )}
                {state.step === 7 && (
                  state.isGenerating && (!state.workflow || state.workflow.nodes.length === 0) ? (
                    <Step7Skeleton labels={state.skeletonLabels} />
                  ) : state.workflow ? (
                    <Step7WorkflowPreview
                      workflow={state.workflow}
                      onConfigUpdate={updateNodeConfig}
                      cacheStatus={state.cacheStatus.workflow}
                      isStreaming={state.isGenerating}
                      validation={validateGraph(
                        state.workflow.nodes.map((n) => ({
                          id: n.id,
                          type: String(n.type),
                          data: n.data as Record<string, unknown>,
                        })),
                        state.workflow.edges.map((e) => ({ source: e.source, target: e.target })),
                      )}
                    />
                  ) : null
                )}
                {state.step === 8 && (
                  <>
                    {state.cacheStatus.code === 'cached' && (
                      <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                        <CachedChip />
                        <span>
                          Generated code below was served from the local cache.
                          Click "Clear AI cache" in the top bar to regenerate fresh.
                        </span>
                      </div>
                    )}
                    <WizardPreflightPanel
                      workflow={state.workflow}
                      generatedSql={state.generatedSql}
                      generatedPython={state.generatedPython}
                      generatedYaml={state.generatedYaml}
                      /* Pre-computed source previews — see prewarmPreflight().
                         Optional prop on the panel; if absent, the panel
                         falls back to its own sequential loop. */
                      precomputedSourcePreviews={state.precomputedPreviews}
                      estCreditsRange={
                        state.selectedOption
                          ? (() => {
                              const o = DEFAULT_OPTIONS.find((x) => x.id === state.selectedOption);
                              return o ? { min: o.creditsMin, max: o.creditsMax } : undefined;
                            })()
                          : undefined
                      }
                    />
                  </>
                )}
                {state.step === 9 && (
                  <Step9Summary
                    description={state.description}
                    understanding={state.understanding}
                    option={
                      DEFAULT_OPTIONS.find((o) => o.id === state.selectedOption) ?? null
                    }
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Footer nav ── */}
          <Footer
            step={state.step}
            busy={busy}
            canAdvance={canAdvanceFrom(state)}
            costBadge={
              state.step === 1 ? (
                <AiCostBadge
                  featureKey="cortex_complete"
                  params={{ prompt_chars: state.description.length }}
                  size="sm"
                  showSource
                />
              ) : state.step === 6 ? (
                <AiCostBadge
                  featureKey="cortex_complete"
                  params={{ prompt_chars: state.description.length + 3000 }}
                  size="sm"
                  showSource
                />
              ) : null
            }
            onBack={() => state.step > 1 && setStep((state.step - 1) as StepId)}
            onNext={async () => {
              switch (state.step) {
                case 1:
                  await runUnderstanding(false);
                  break;
                case 4:
                  // Choose option moves the step itself; "Next" here is unused
                  if (state.selectedOption) setStep(5);
                  break;
                case 6:
                  await generateWorkflow(false);
                  break;
                case 7:
                  // Configured graph → preflight banner. Code-gen AND
                  // source previews are fired in parallel so step 8 mounts
                  // with everything pre-computed instead of spinning per
                  // phase. The panel reads `precomputedSourcePreviews`
                  // and skips its own sequential preview loop.
                  setStep(8);
                  void Promise.allSettled([
                    generateCode().catch(() => {}),
                    prewarmPreflight().catch(() => {}),
                  ]);
                  break;
                case 8:
                  // Pre-flight OK → review summary in step 9.
                  setStep(9);
                  break;
                case 9:
                  // Save the draft, validate it server-side, hand off to the
                  // builder so the user can request deployment from there.
                  createInBuilder();
                  break;
                default:
                  setStep((state.step + 1) as StepId);
              }
            }}
            nextLabel={nextLabelFor(state.step)}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers for footer nav
// ───────────────────────────────────────────────────────────────────────────

function canAdvanceFrom(s: WizardState): boolean {
  switch (s.step) {
    case 1:
      return s.description.trim().length > 10;
    case 2:
      return s.understanding !== null;
    case 3:
      // Need at least one card explicitly reviewed before continuing.
      return s.compliance.some((c) => c.status === 'reviewed');
    case 4:
      return s.selectedOption !== null;
    case 5:
      return true;
    case 6:
      return true;
    case 7: {
      // Block advance until every required catalog param is filled —
      // otherwise step 8 would show errors and the backend would refuse
      // the dry-run anyway.
      if (!s.workflow) return false;
      const v = validateGraph(
        s.workflow.nodes.map((n) => ({
          id: n.id,
          type: String(n.type),
          data: n.data as Record<string, unknown>,
        })),
        s.workflow.edges.map((e) => ({ source: e.source, target: e.target })),
      );
      return v.ok;
    }
    case 8: {
      // The validation banner must be green before deploy.
      if (!s.workflow) return false;
      const v = validateGraph(
        s.workflow.nodes.map((n) => ({
          id: n.id,
          type: String(n.type),
          data: n.data as Record<string, unknown>,
        })),
        s.workflow.edges.map((e) => ({ source: e.source, target: e.target })),
      );
      return v.ok;
    }
    case 9:
      return true;
  }
}

function nextLabelFor(step: StepId): string {
  switch (step) {
    case 1:
      return 'Analyze my need with AI';
    case 2:
      return 'Looks good, continue';
    case 3:
      return 'See recommendations';
    case 4:
      return 'Choose option';
    case 5:
      return 'Looks good, continue';
    case 6:
      return 'Continue without waiting';
    case 7:
      return 'Pre-flight check';
    case 8:
      return 'Review summary';
    case 9:
      return 'Create draft & validate';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Top bar
// ───────────────────────────────────────────────────────────────────────────

function TopBar({
  currentStep,
  creditsAvailable,
  onClose,
  onClearCache,
}: {
  currentStep: StepId;
  creditsAvailable: number;
  onClose: () => void;
  /**
   * Clears every `wizard:*` entry from the Cortex response cache (used by
   * the small "Clear AI cache" link near the credits counter).
   * Low-emphasis — meant for QA / debugging, not a primary action.
   */
  onClearCache: () => void;
}) {
  const [cachedCount, setCachedCount] = useState<number>(0);
  // Re-count on mount so the badge reflects what's actually in localStorage.
  useEffect(() => {
    setCachedCount(countCached());
  }, [currentStep]);
  const currentPhase = PHASE_FOR_STEP[currentStep];
  return (
    <div className="relative flex items-center gap-6 border-b border-slate-200 px-6 py-3 dark:border-slate-700">
      <div className="flex items-center gap-2.5">
        <motion.div
          initial={{ rotate: -8, scale: 0.85 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-md shadow-purple-500/30"
        >
          <Sparkles className="h-4 w-4 text-white" />
        </motion.div>
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              AI Guided Workflow
            </h2>
            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              Beta
            </span>
          </div>
        </div>
      </div>

      {/* Phase progress */}
      <LayoutGroup id="wizard-phases">
        <div className="flex flex-1 items-center justify-center gap-1">
          {PHASES.map((p, i) => {
            const active = p.id === currentPhase;
            const done = PHASES.findIndex((x) => x.id === currentPhase) > i;
            return (
              <div key={p.id} className="flex items-center gap-1">
                <div
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                    active
                      ? 'text-purple-700 dark:text-purple-300'
                      : done
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-400',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="phase-bg"
                      className="absolute inset-0 rounded-full bg-purple-100 dark:bg-purple-900/30"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span
                    className={cn(
                      'relative flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                      active
                        ? 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-sm shadow-purple-500/40'
                        : done
                          ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
                    )}
                  >
                    {done ? <Check className="h-2.5 w-2.5" /> : p.n}
                  </span>
                  <span className="relative">{p.label}</span>
                </div>
                {i < PHASES.length - 1 && (
                  <span className="h-px w-6 bg-slate-200 dark:bg-slate-700" />
                )}
              </div>
            );
          })}
        </div>
      </LayoutGroup>

      <div className="flex items-center gap-2">
        {cachedCount > 0 && (
          <button
            onClick={() => {
              onClearCache();
              setCachedCount(0);
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 dark:hover:text-rose-300"
            title={`Clear ${cachedCount} cached AI response${cachedCount === 1 ? '' : 's'} — forces fresh AI calls on the next run.`}
            aria-label="Clear AI cache"
          >
            <Trash2 className="h-3 w-3" />
            <span>Clear AI cache</span>
            <span className="rounded bg-slate-200 px-1 font-mono dark:bg-slate-700">
              {cachedCount}
            </span>
          </button>
        )}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-semibold tabular-nums">
            {creditsAvailable.toLocaleString()}
          </span>
          <span className="text-slate-400">credits</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Footer (back / next)
// ───────────────────────────────────────────────────────────────────────────

function Footer({
  step,
  busy,
  canAdvance,
  onBack,
  onNext,
  nextLabel,
  costBadge,
}: {
  step: StepId;
  busy: boolean;
  canAdvance: boolean;
  onBack: () => void;
  onNext: () => void | Promise<void>;
  nextLabel: string;
  costBadge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 dark:border-slate-700">
      <motion.div whileHover={step > 1 ? { x: -2 } : undefined} whileTap={step > 1 ? { scale: 0.97 } : undefined}>
        <button
          onClick={onBack}
          disabled={step === 1 || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </motion.div>

      <div className="flex items-center gap-2">
        {costBadge}
        <motion.div
        whileHover={canAdvance && !busy ? { scale: 1.02 } : undefined}
        whileTap={canAdvance && !busy ? { scale: 0.98 } : undefined}
      >
        <button
          onClick={onNext}
          disabled={!canAdvance || busy}
          className={cn(
            'group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-md transition-all',
            !canAdvance || busy
              ? 'bg-slate-300 text-slate-500 shadow-none dark:bg-slate-700 dark:text-slate-400'
              : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 shadow-purple-500/30 hover:from-purple-700 hover:to-fuchsia-700 hover:shadow-lg hover:shadow-purple-500/40',
          )}
        >
          {canAdvance && !busy && (
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          )}
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {nextLabel}
          {!busy && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </motion.div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 1 — Describe
// ───────────────────────────────────────────────────────────────────────────

function Step1Describe({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Initial value = the curated fallback list, so the UI never renders empty
  // while the async event lookup is in-flight. If we find history events,
  // they REPLACE the fallback. If the API errors / returns nothing, the
  // fallback stays put silently — no toast spam.
  const [examples, setExamples] = useState<ExampleEntry[]>(FALLBACK_EXAMPLES);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await listGlobalEvents({
          module_name: 'workflow',
          event_type: 'AI_CODE_GENERATED',
          limit: 6,
        });
        if (cancelled) return;
        // Defensive: the backend has historically ignored module_name filter
        // in some envs — re-filter client-side.
        const events = (resp?.events ?? []).filter(
          (e) => e.module_name === 'workflow' && e.event_type === 'AI_CODE_GENERATED',
        );
        const prompts: ExampleEntry[] = [];
        const seen = new Set<string>();
        for (const ev of events) {
          const p = extractPromptFromEvent(ev);
          if (!p) continue;
          const norm = p.toLowerCase();
          if (seen.has(norm)) continue;
          seen.add(norm);
          prompts.push({ text: p, source: 'history' });
          if (prompts.length >= 6) break;
        }
        if (prompts.length > 0) setExamples(prompts);
      } catch {
        // Endpoint may not be wired in every env — silently keep the fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        What would you like to build today?
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Describe your business need in natural language. Our AI will understand,
        validate and guide you.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={8}
              maxLength={2000}
              placeholder="I want to monitor my marketing campaigns, detect negative signals, enrich customer data, create a dashboard and trigger actions (email/SMS) when performance drops"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-400">
              {value.length} / 2000
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Try these examples
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((ex, i) => (
              <motion.button
                key={`${ex.source}-${i}`}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onChange(ex.text)}
                className="group relative rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-purple-700 dark:hover:bg-purple-900/20"
              >
                <span
                  className={cn(
                    'mb-0.5 inline-block rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide',
                    ex.source === 'history'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300',
                  )}
                >
                  {ex.source === 'history' ? '(history)' : '(suggested)'}
                </span>
                <span className="block">
                  {ex.text.slice(0, 70)}
                  {ex.text.length > 70 ? '…' : ''}
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Data360 will check for you
          </h3>
          <ul className="space-y-1.5 text-xs">
            {[
              'Existing sources & connectors',
              'Available ETL blocks',
              'Compliance (GDPR, AI Act, Data Act)',
              'Costs & credits estimation',
              'Best workflow suggestions',
            ].map((s) => (
              <li key={s} className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Possible outcomes
          </h3>
          <ul className="space-y-1.5 text-xs">
            {[
              'Ready to generate workflow',
              'Request new source / connector',
              'Request new ETL block capability',
              'Submit for Data360 review',
            ].map((s) => (
              <li key={s} className="flex items-start gap-1.5 text-slate-700 dark:text-slate-200">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 2 — AI Understanding
// ───────────────────────────────────────────────────────────────────────────

function Step2Understanding({
  data,
  cacheStatus,
}: {
  data: AiUnderstanding;
  cacheStatus: 'live' | 'cached' | null;
}) {
  const ctx = data.business_context;
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          2. AI Understanding
        </p>
        {cacheStatus === 'cached' && <CachedChip />}
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Here is what I understood
      </h1>
      <p className="mt-1 text-sm text-slate-500">Please confirm or adjust if needed.</p>

      {data.intent_confidence < 60 && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <Info className="h-3 w-3" />
          The AI is uncertain — refining the description will help.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Database className="h-4 w-4 text-purple-500" />
            Business context
          </h3>
          <dl className="space-y-2 text-xs">
            {[
              ['Domain', ctx.domain],
              ['Primary goal', ctx.primary_goal],
              ['Key object', ctx.key_object],
              ['Expected outcome', ctx.expected_outcome],
              ['AI usage', ctx.ai_usage],
              ['Automation level', ctx.automation_level],
              ['Users', ctx.users],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="col-span-2 font-medium text-slate-800 dark:text-slate-200">
                  {v || <span className="italic text-slate-400">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Layers className="h-4 w-4 text-purple-500" />
            Sources detected
          </h3>
          <ul className="space-y-1.5">
            {data.sources_detected.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800/60"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    s.status === 'existing'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : s.status === 'requested'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                  )}
                >
                  {s.status}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Intent confidence</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {data.intent_confidence}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, data.intent_confidence))}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={cn(
                  'h-full rounded-full',
                  data.intent_confidence >= 80
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                    : data.intent_confidence >= 50
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-rose-500 to-red-500',
                )}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {data.intent_confidence >= 80
                ? 'High confidence'
                : data.intent_confidence >= 50
                  ? 'Medium confidence — consider clarifying'
                  : 'Low confidence — try a more specific description'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 3 — Compliance (user-filled, no backend)
// ───────────────────────────────────────────────────────────────────────────

function Step3Compliance({
  cards,
  onChange,
}: {
  cards: ComplianceCard[];
  onChange: (c: ComplianceCard[]) => void;
}) {
  const updateCard = (key: string, patch: Partial<ComplianceCard>) => {
    onChange(cards.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };
  const reviewedCount = cards.filter((c) => c.status === 'reviewed').length;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        3. Compliance & Feasibility (self-review)
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Walk through each dimension before generating the workflow
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        This is a self-review checklist — not a backend audit. Mark each card as
        "Reviewed" once you've read its implications. The decision is recorded
        with the published draft so reviewers know what you saw.
      </p>

      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <ListChecks className="h-3 w-3" />
        {reviewedCount} / {cards.length} reviewed
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          const reviewed = card.status === 'reviewed';
          return (
            <motion.div
              key={card.key}
              id={`compliance-${card.key}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
              className={cn(
                'rounded-xl border bg-white p-3 transition-colors dark:bg-slate-900',
                reviewed
                  ? 'border-emerald-300 dark:border-emerald-700'
                  : 'border-slate-200 dark:border-slate-700',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      reviewed ? 'text-emerald-500' : 'text-slate-400',
                    )}
                  />
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {card.title}
                  </h4>
                </div>
                <a
                  href={`#compliance-${card.key}`}
                  className="text-[10px] text-slate-400 underline decoration-dotted hover:text-purple-600"
                  title="Detailed docs are coming — this anchors to the card for now"
                >
                  Learn more
                </a>
              </div>
              <button
                onClick={() =>
                  updateCard(card.key, {
                    status: reviewed ? 'unchecked' : 'reviewed',
                  })
                }
                className={cn(
                  'w-full rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                  reviewed
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:hover:bg-emerald-900/20',
                )}
                aria-pressed={reviewed}
              >
                {reviewed ? 'Reviewed' : 'Mark as reviewed'}
              </button>
              <textarea
                value={card.note}
                onChange={(e) => updateCard(card.key, { note: e.target.value })}
                rows={2}
                placeholder="Notes (optional)"
                className="mt-2 w-full resize-none rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30 dark:border-slate-700 dark:bg-slate-800"
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 4 — Recommendations
// ───────────────────────────────────────────────────────────────────────────

function Step4Recommendations({
  selected,
  onChoose,
}: {
  selected: RecommendationOption['id'] | null;
  onChoose: (id: RecommendationOption['id']) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Recommendations <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] uppercase text-purple-700">Beta</span>
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Here are 3 possible approaches
      </h1>
      <p className="mt-1 text-sm text-slate-500">Choose the option that fits you best.</p>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {DEFAULT_OPTIONS.map((opt, i) => {
          const isSelected = selected === opt.id;
          return (
            <motion.button
              key={opt.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChoose(opt.id)}
              className={cn(
                'rounded-xl border-2 bg-white p-4 text-left transition-all dark:bg-slate-900',
                isSelected
                  ? 'border-purple-500 shadow-lg shadow-purple-500/20 ring-2 ring-purple-500/20'
                  : 'border-slate-200 hover:border-purple-300 hover:shadow-md dark:border-slate-700 dark:hover:border-purple-700',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Option {i + 1}
                </span>
                {opt.requiresReview && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    Requires review
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                {opt.title}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{opt.subtitle}</p>

              <ul className="mt-3 space-y-1.5">
                {opt.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-slate-200 pt-2 dark:border-slate-700">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Est. credits / month</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {opt.creditsMin.toLocaleString()} – {opt.creditsMax.toLocaleString()}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 5 — Option Details
// ───────────────────────────────────────────────────────────────────────────

function Step5OptionDetails({
  option,
  understanding,
}: {
  option: RecommendationOption;
  understanding: AiUnderstanding | null;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        5. Option Details <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] uppercase text-purple-700">Beta</span>
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Recommended option details
      </h1>
      <p className="mt-1 text-sm text-slate-500">This is what will be included in your workflow.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Wand2 className="h-4 w-4 text-purple-500" />
            Workflow summary — {option.title}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300">{option.subtitle}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {['Ingest', 'Transform', 'AI & Enrich', 'Quality', 'Activate', 'Visualize'].map((p) => (
              <span
                key={p}
                className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
              >
                {p}
              </span>
            ))}
          </div>

          {understanding && understanding.sources_detected.length > 0 && (
            <>
              <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Included sources
              </h4>
              <ul className="mt-1.5 space-y-1">
                {understanding.sources_detected.slice(0, 5).map((s, i) => (
                  <li key={i} className="text-xs text-slate-700 dark:text-slate-200">
                    • {s.name}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Key features
          </h4>
          <ul className="mt-1.5 space-y-1">
            {option.features.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
            Blocks to be used
          </h3>
          <p className="text-xs text-slate-500">
            We'll lay out 5-10 ETL blocks once you confirm. The AI will produce them in the next step.
          </p>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 6 — New Requests
// ───────────────────────────────────────────────────────────────────────────

function Step6NewRequests({
  requests,
  selectedOption,
}: {
  requests: NewRequest[];
  selectedOption: RecommendationOption['id'] | null;
}) {
  const isAdvanced = selectedOption === 'advanced';
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        New Requests (If needed) <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] uppercase text-purple-700">Beta</span>
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {requests.length > 0 ? 'Some items require Data360 review' : 'No new requests needed'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {requests.length > 0
          ? 'We will review and come back within 3 business days.'
          : 'Your selected option uses only existing sources and blocks — nothing to request.'}
      </p>

      {isAdvanced && requests.length === 0 && (
        <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
          <div className="flex items-center gap-2">
            <Lock className="h-3 w-3 text-violet-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
              Backend gap — UX target
            </p>
          </div>
          <dl className="mt-2 space-y-1.5 text-[11px]">
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">POST /workflow/requests</dd>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {'{ kind: "source"|"block", title, reason }'}
              </dd>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <dt className="font-semibold text-violet-700 dark:text-violet-300">Returns</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {'{ id, status: "under_review", sla_days }'}
              </dd>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
              <dd className="text-slate-700 dark:text-slate-300">
                Custom-source/block requests for the Advanced tier will appear here once you submit them. No fake seed cards.
              </dd>
            </div>
          </dl>
          <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
            <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
            <span className="text-[10px] text-violet-800 dark:text-violet-200">
              Until this lands, you can continue with available data and request items through the existing support flow.
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {requests.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  r.kind === 'source'
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
                )}
              >
                {r.kind === 'source' ? <Database className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  New {r.kind} request
                </p>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{r.title}</h4>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Reason:</span> {r.reason}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Status: <span className="font-medium">Under Review</span> · SLA: {r.slaDays} business days
                </p>
              </div>
            </div>
            <button className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              View details
            </button>
          </motion.div>
        ))}
      </div>

      {requests.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
          You can continue with available data while we review these requests.
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 7 — Skeleton (shown while Cortex streams the workflow)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Skeleton-with-AI-fill (optimization #3).
 *
 * When the user clicks "Generate workflow" we transition to step 7 INSTANTLY
 * and render 4-6 grey rounded rectangles in a horizontal lane, each with a
 * `Loader2` spinner and a small "Cortex is thinking…" label. The labels
 * come from the deterministic fallback generator's first pass so they hint
 * at the SHAPE of the workflow (e.g. "Source · Filter · Aggregate ·
 * Destination") rather than showing 4 generic boxes.
 *
 * Real nodes fade in via AnimatePresence as the streaming parser yields
 * them — the skeleton fades out simultaneously.
 */
function Step7Skeleton({ labels }: { labels: string[] }) {
  // Always show at least 4 boxes; cap at 6 to avoid overflow.
  const cells = labels.length >= 4 ? labels.slice(0, 6) : [
    ...labels,
    ...Array(Math.max(0, 4 - labels.length)).fill('AI is thinking…'),
  ];

  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          7. AI Generated Workflow — Generating
        </p>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          AI is thinking…
        </span>
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Composing your workflow
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Blocks will land here one at a time as the AI streams its plan.
      </p>

      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_340px]">
        {/* Lane of skeleton blocks — mimics the horizontal flow of the real canvas. */}
        <div className="flex h-[420px] items-center gap-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/40">
          {cells.map((label, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.06 }}
              className="flex h-24 w-44 shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-center shadow-sm dark:border-slate-700 dark:bg-slate-800"
            >
              <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
              <p className="px-2 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {label}
              </p>
              <div className="h-1.5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
            </motion.div>
          ))}
        </div>

        {/* Right-side panel shimmer — matches the real config panel footprint. */}
        <aside className="flex h-[420px] flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-8 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Tiny "(cached)" chip rendered in step 2/7/8 headers when the Cortex
 * response was served from the local cache. Low-emphasis but explicit so
 * the user (especially QA persona) knows the answer is not fresh.
 */
function CachedChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      title="This response was served from the local cache. Click 'Clear AI cache' in the top bar to force a fresh call."
    >
      <Check className="h-2.5 w-2.5" />
      (cached)
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 7 — Workflow preview
// ───────────────────────────────────────────────────────────────────────────

/**
 * Render the generated graph as a real ReactFlow mini-canvas using the
 * registered etlNodeTypes — so users see the actual iconified blocks
 * (SourceNode, AiSentimentNode, …) with proper ports and field badges.
 *
 * Clicking a node opens a side panel that lists the block's catalog params,
 * highlights missing required values in red, and writes back to the node
 * via onConfigUpdate so the canvas reflects each edit live. This is the
 * "discussion with user" piece — the wizard collects real inputs from the
 * catalog instead of leaving every block empty.
 */
function Step7WorkflowPreview({
  workflow,
  onConfigUpdate,
  validation,
  cacheStatus,
  isStreaming,
}: {
  workflow: { nodes: Node[]; edges: Edge[] };
  onConfigUpdate: (nodeId: string, partial: Record<string, unknown>) => void;
  validation: ReturnType<typeof validateGraph>;
  cacheStatus: 'live' | 'cached' | null;
  isStreaming: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    workflow.nodes[0]?.id ?? null,
  );
  const selected = workflow.nodes.find((n) => n.id === selectedId) ?? null;
  const def: CatalogBlock | undefined = selected
    ? BLOCK_BY_TYPE.get(String(selected.type))
    : undefined;
  const totalMissing = Object.values(validation.perNode).flat().length;
  // Mark nodes with issues so the canvas can outline them in red.
  const decoratedNodes: Node[] = workflow.nodes.map((n) => ({
    ...n,
    selected: n.id === selectedId,
    data: {
      ...(n.data as Record<string, unknown>),
      _hasIssue: (validation.perNode[n.id]?.length ?? 0) > 0,
    },
  }));

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              7. AI Generated Workflow — Configure each block
            </p>
            {cacheStatus === 'cached' && <CachedChip />}
            {isStreaming && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                streaming…
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Your workflow is ready — fill in the inputs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Click any block to configure its database, columns and conditions.
            Required fields are marked with{' '}
            <span className="font-semibold text-red-500">*</span>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {workflow.nodes.length} blocks · {workflow.edges.length} edges
          </span>
          {totalMissing === 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              All required filled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" />
              {totalMissing} required field{totalMissing === 1 ? '' : 's'} to fill
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_340px]">
        {/* ── Real ReactFlow mini-canvas ── */}
        <div className="h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40">
          <ReactFlowProvider>
            <ReactFlow
              nodes={decoratedNodes}
              edges={workflow.edges}
              nodeTypes={etlNodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onlyRenderVisibleElements
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={() => '#a855f7'} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* ── Side panel: per-block param form, driven by catalog ── */}
        <aside className="flex h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          {selected && def ? (
            <BlockConfigForm
              key={selected.id}
              node={selected}
              def={def}
              issues={validation.perNode[selected.id] ?? []}
              onChange={(partial) => onConfigUpdate(selected.id, partial)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <Layers className="h-6 w-6 text-slate-300" />
              <p className="text-xs text-slate-500">
                Click a block on the canvas to configure its inputs.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * Per-block parameter form. Driven by the catalog's `params[]` so every
 * field shown is real (renders as `database`, `schema`, `table`, `text_column`,
 * `filter_condition`, …). No hard-coded fields — adding a new block to the
 * catalog automatically shows up here.
 */
function BlockConfigForm({
  node,
  def,
  issues,
  onChange,
}: {
  node: Node;
  def: CatalogBlock;
  issues: ValidationIssue[];
  onChange: (partial: Record<string, unknown>) => void;
}) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const cfg = ((data.config as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const valueFor = (name: string) => cfg[name] ?? data[name] ?? '';
  const missingSet = new Set(
    issues.filter((i) => i.kind === 'missing_required').map((i) => i.field).filter(Boolean) as string[],
  );

  return (
    <>
      <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {def.category}
        </p>
        <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
          {def.label}
        </h3>
        <p className="mt-0.5 text-[11px] text-slate-500">{def.description}</p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {def.params.length === 0 && (
          <p className="text-[11px] italic text-slate-400">
            No parameters — this block runs as-is.
          </p>
        )}
        {def.params.map((p) => {
          const raw = valueFor(p.name);
          const isMissing = missingSet.has(p.name);
          const isArray = p.type === 'array' || Array.isArray(raw);
          const isBool = p.type === 'boolean';
          const isEnum = Array.isArray(p.enum) && p.enum.length > 0;

          return (
            <label key={p.name} className="block">
              <div className="mb-1 flex items-center gap-1 text-[11px]">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {p.name}
                </span>
                {p.required && <span className="text-red-500">*</span>}
                <span className="ml-auto rounded bg-slate-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {p.type}
                </span>
              </div>

              {isEnum ? (
                <select
                  value={typeof raw === 'string' ? raw : ''}
                  onChange={(e) => onChange({ [p.name]: e.target.value })}
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-xs',
                    isMissing
                      ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40'
                      : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800',
                  )}
                >
                  <option value="">— select —</option>
                  {p.enum!.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : isBool ? (
                <select
                  value={raw === true ? 'true' : raw === false ? 'false' : ''}
                  onChange={(e) =>
                    onChange({
                      [p.name]: e.target.value === 'true' ? true : e.target.value === 'false' ? false : null,
                    })
                  }
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">—</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : isArray ? (
                <input
                  value={Array.isArray(raw) ? raw.join(', ') : String(raw ?? '')}
                  onChange={(e) =>
                    onChange({
                      [p.name]: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="comma,separated,values"
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-xs',
                    isMissing
                      ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40'
                      : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800',
                  )}
                />
              ) : (
                <input
                  value={typeof raw === 'object' ? JSON.stringify(raw) : String(raw ?? '')}
                  onChange={(e) => onChange({ [p.name]: e.target.value })}
                  placeholder={p.required ? 'required' : 'optional'}
                  className={cn(
                    'w-full rounded-md border px-2 py-1.5 text-xs font-mono',
                    isMissing
                      ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40'
                      : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800',
                  )}
                />
              )}
              {p.description && (
                <p className="mt-0.5 text-[10px] text-slate-400">{p.description}</p>
              )}
            </label>
          );
        })}
      </div>

      {def.usage && (
        <footer className="border-t border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-[10px] text-slate-500">{def.usage}</p>
        </footer>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 9 — Summary & Next steps
// ───────────────────────────────────────────────────────────────────────────

function Step9Summary({
  description,
  understanding,
  option,
}: {
  description: string;
  understanding: AiUnderstanding | null;
  option: RecommendationOption | null;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        9. Summary & Next Steps
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        All set! Here is the summary
      </h1>
      <p className="mt-1 text-sm text-slate-500">Review and launch your workflow.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <FileText className="h-4 w-4 text-purple-500" />
            Summary
          </h3>
          <dl className="space-y-2 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Workflow name</dt>
              <dd className="col-span-2 font-medium text-slate-800 dark:text-slate-200">
                {understanding?.business_context.primary_goal ?? 'New AI workflow'}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Description</dt>
              <dd className="col-span-2 text-slate-700 dark:text-slate-300">{description}</dd>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Approach</dt>
              <dd className="col-span-2 font-medium text-slate-800 dark:text-slate-200">
                {option?.title ?? '—'}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Est. credits / month</dt>
              <dd className="col-span-2 font-medium text-slate-800 dark:text-slate-200">
                {option ? `${option.creditsMin.toLocaleString()} – ${option.creditsMax.toLocaleString()}` : '—'}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <dt className="text-slate-500">Created on</dt>
              <dd className="col-span-2 font-medium text-slate-800 dark:text-slate-200">
                {new Date().toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <ListChecks className="h-4 w-4 text-purple-500" />
            What's next?
          </h3>
          <ul className="space-y-1.5">
            {[
              'Review and confirm the workflow',
              'Create in Workflow Builder',
              'Run a test on sample data',
              'Validate results',
              'Deploy to production',
            ].map((s) => (
              <li key={s} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                <span>{s}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Save className="h-3.5 w-3.5" />
              Save as draft
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Share2 className="h-3.5 w-3.5" />
              Share with team
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
