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
import { useCallback, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Sparkles, X, ArrowLeft, ArrowRight, Loader2, Check, AlertTriangle,
  Database, FileText, Code2, GitBranch, Cpu, Layers, ListChecks,
  Save, Share2, Rocket, Coins, Eye, Wand2, ShieldCheck, FileCheck,
  Scale, Lock, Heart, FileCode2, Beaker, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import type { Node, Edge } from 'reactflow';

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
  status: 'ok' | 'warning' | 'unchecked';
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
}
interface EdgePreview {
  from: string;
  to: string;
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
}

// ───────────────────────────────────────────────────────────────────────────
// Initial / static data
// ───────────────────────────────────────────────────────────────────────────

const EXAMPLES = [
  'Monitor marketing campaigns, detect negative signals, enrich customer data, create a dashboard and trigger alerts (email/SMS) when performance drops',
  'Customer 360 pipeline — join orders, returns, support tickets',
  'Product quality analysis from manufacturing telemetry',
  'IoT event monitoring with anomaly detection',
  'Data quality monitoring across the warehouse',
  'Financial reporting automation',
];

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
  return `Output ONLY this JSON (4-8 blocks, edges connect block IDs):
{"blocks":[{"id":"n1","type":"source|filter|join|aggregate|select|sort|ai|destination","label":""}],"edges":[{"from":"n1","to":"n2"}]}

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

// Topological-ish layout for generated blocks
function layoutBlocks(
  blocks: BlockPreview[],
  edges: EdgePreview[],
): { nodes: Node[]; edges: Edge[] } {
  const rankByType: Record<string, number> = {
    source: 0,
    filter: 1,
    select: 1,
    join: 2,
    aggregate: 2,
    ai: 3,
    sort: 3,
    destination: 4,
  };
  const byRank = new Map<number, BlockPreview[]>();
  for (const b of blocks) {
    const r = rankByType[b.type] ?? 1;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(b);
  }
  const X = 240;
  const Y = 110;
  const nodes: Node[] = [];
  for (const [rank, group] of byRank.entries()) {
    group.forEach((b, idx) => {
      nodes.push({
        id: b.id,
        type: b.type,
        position: { x: rank * X, y: idx * Y },
        data: { label: b.label, aiGenerated: true },
      });
    });
  }
  const rfEdges: Edge[] = edges
    .filter((e) => blocks.find((b) => b.id === e.from) && blocks.find((b) => b.id === e.to))
    .map((e, i) => ({
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      animated: true,
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
    meta: { description: string },
  ) => void;
  /** Credits available for display only (top-right counter). */
  creditsAvailable?: number;
}

export default function GuidedAiWorkflowWizard({
  open,
  onClose,
  onCreated,
  creditsAvailable = 12_450,
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
  });
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
  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((p) => ({ ...p, [key]: value }));
  }, []);

  /**
   * Call /cortex/complete with a 20s frontend timeout race. The backend
   * already has a 15s SQL limit; this race ensures the UI doesn't hang
   * indefinitely if the network is also slow. Returns classified error
   * shapes so the caller can surface the right banner.
   */
  const callCortex = async (prompt: string): Promise<string> => {
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
    if (result.ok) return result.text;
    if (result.reason === 'timeout') {
      throw new Error('TIMEOUT');
    }
    // Backend may return the snowflake QUERY_CANCELLED payload as the
    // message — detect it and re-classify so the UI shows a friendlier
    // "warehouse timed out" banner.
    const msg = result.message ?? 'Cortex error';
    if (/QUERY_CANCELLED|timeout|cancel/i.test(msg)) {
      throw new Error('TIMEOUT');
    }
    throw new Error(msg);
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
    });
    setAiError(null);
    onClose();
  };

  // ── Step 1 → 2: AI Understanding ──
  const runUnderstanding = async () => {
    if (!state.description.trim()) {
      toast.error('Describe your workflow first');
      return;
    }
    setBusy(true);
    setAiError(null);
    try {
      const raw = await callCortex(buildUnderstandingPrompt(state.description.trim()));
      const parsed = parseLlmJson<AiUnderstanding>(raw);
      if (!parsed) {
        setAiError({ kind: 'parse', retry: runUnderstanding, raw });
        return;
      }
      // Normalize the confidence field — Mistral often returns a fraction
      // (e.g. 0.85) even when the prompt says "0-100". Defensive cast keeps
      // the UI bar accurate regardless of which scale the model picked.
      const normalized: AiUnderstanding = {
        ...parsed,
        intent_confidence: normalizeConfidence(parsed.intent_confidence),
      };
      update('understanding', normalized);
      setStep(2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TIMEOUT') {
        setAiError({ kind: 'timeout', retry: runUnderstanding });
      } else {
        setAiError({ kind: 'other', message: msg, retry: runUnderstanding });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Step 4 → 5: select option ──
  const chooseOption = (id: RecommendationOption['id']) => {
    update('selectedOption', id);
    // If "advanced", seed new requests so step 6 has content
    if (id === 'advanced') {
      update('newRequests', [
        {
          id: 'src-1',
          kind: 'source',
          title: 'Facebook Ads Benchmark Data',
          reason: 'Need competitor benchmarking data for campaign analysis',
          status: 'under_review',
          slaDays: 3,
        },
        {
          id: 'blk-1',
          kind: 'block',
          title: 'Competitor Benchmark Analysis Block',
          reason: 'Custom analysis block to compare multi-platform performance',
          status: 'under_review',
          slaDays: 3,
        },
      ]);
    } else {
      update('newRequests', []);
    }
    setStep(5);
  };

  // ── Step 6 → 7: generate workflow blocks ──
  const generateWorkflow = async () => {
    setBusy(true);
    setAiError(null);
    try {
      const optionLabel =
        DEFAULT_OPTIONS.find((o) => o.id === state.selectedOption)?.title ?? 'Best balance';
      const raw = await callCortex(buildBlocksPrompt(state.description, optionLabel));
      const parsed = parseLlmJson<{ blocks: BlockPreview[]; edges: EdgePreview[] }>(raw);
      if (!parsed) {
        setAiError({ kind: 'parse', retry: generateWorkflow, raw });
        return;
      }
      const wf = layoutBlocks(parsed.blocks, parsed.edges);
      update('workflow', wf);
      setStep(7);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TIMEOUT') {
        setAiError({ kind: 'timeout', retry: generateWorkflow });
      } else {
        setAiError({ kind: 'other', message: msg, retry: generateWorkflow });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Step 7 → 8: generate code ──
  const generateCode = async () => {
    setBusy(true);
    setAiError(null);
    try {
      const raw = await callCortex(buildCodePrompt(state.workflow));
      const parsed = parseLlmJson<{ sql: string; python: string; yaml: string }>(raw);
      if (!parsed) {
        setAiError({ kind: 'parse', retry: generateCode, raw });
        return;
      }
      update('generatedSql', parsed.sql ?? '');
      update('generatedPython', parsed.python ?? '');
      update('generatedYaml', parsed.yaml ?? '');
      setStep(8);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TIMEOUT') {
        setAiError({ kind: 'timeout', retry: generateCode });
      } else {
        setAiError({ kind: 'other', message: msg, retry: generateCode });
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Step 9: hand off to the canvas ──
  const createInBuilder = () => {
    if (!state.workflow) {
      toast.error('No workflow to create');
      return;
    }
    onCreated(state.workflow.nodes, state.workflow.edges, {
      description: state.description,
    });
    // Parent surfaces its own toast after the auto-save completes — we
    // skip the success toast here to avoid two stacking messages.
    handleClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-slate-900/50 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="m-auto flex h-[min(900px,95vh)] w-[min(1100px,95vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          {/* ── Top bar: title + phase progress + credits ── */}
          <TopBar
            currentStep={state.step}
            creditsAvailable={creditsAvailable}
            onClose={handleClose}
          />

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
                        ? 'Cortex took too long'
                        : aiError.kind === 'parse'
                          ? "AI returned something we couldn't parse"
                          : 'AI call failed'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                      {aiError.kind === 'timeout'
                        ? 'The Snowflake Cortex warehouse cancelled the query (15s SQL limit). Try a shorter description, a less complex workflow, or retry — sometimes the second attempt lands faster.'
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
                  <Step2Understanding data={state.understanding} />
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
                  <Step6NewRequests requests={state.newRequests} />
                )}
                {state.step === 7 && state.workflow && (
                  <Step7WorkflowPreview workflow={state.workflow} />
                )}
                {state.step === 8 && (
                  <Step8CodeConfig
                    sql={state.generatedSql}
                    python={state.generatedPython}
                    yaml={state.generatedYaml}
                  />
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
            onBack={() => state.step > 1 && setStep((state.step - 1) as StepId)}
            onNext={async () => {
              switch (state.step) {
                case 1:
                  await runUnderstanding();
                  break;
                case 4:
                  // Choose option moves the step itself; "Next" here is unused
                  if (state.selectedOption) setStep(5);
                  break;
                case 6:
                  await generateWorkflow();
                  break;
                case 7:
                  await generateCode();
                  break;
                case 8:
                  setStep(9);
                  break;
                case 9:
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
      // Need at least one card answered
      return s.compliance.some((c) => c.status !== 'unchecked');
    case 4:
      return s.selectedOption !== null;
    case 5:
      return true;
    case 6:
      return true;
    case 7:
      return s.workflow !== null;
    case 8:
      return s.generatedSql.length > 0 || s.generatedPython.length > 0 || s.generatedYaml.length > 0;
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
      return 'Create in Workflow Builder';
    case 8:
      return 'Create & Test';
    case 9:
      return 'Create in Workflow Builder & Test';
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Top bar
// ───────────────────────────────────────────────────────────────────────────

function TopBar({
  currentStep,
  creditsAvailable,
  onClose,
}: {
  currentStep: StepId;
  creditsAvailable: number;
  onClose: () => void;
}) {
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
}: {
  step: StepId;
  busy: boolean;
  canAdvance: boolean;
  onBack: () => void;
  onNext: () => void | Promise<void>;
  nextLabel: string;
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
            {EXAMPLES.map((ex, i) => (
              <motion.button
                key={i}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onChange(ex)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-purple-700 dark:hover:bg-purple-900/20"
              >
                {ex.slice(0, 60)}{ex.length > 60 ? '…' : ''}
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

function Step2Understanding({ data }: { data: AiUnderstanding }) {
  const ctx = data.business_context;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        2. AI Understanding
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Here is what I understood
      </h1>
      <p className="mt-1 text-sm text-slate-500">Please confirm or adjust if needed.</p>

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
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        3. Compliance & Feasibility Check
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Checking compliance, risks and feasibility
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Manual review — mark each as OK or Warning and add a short note.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
              className={cn(
                'rounded-xl border bg-white p-3 transition-colors dark:bg-slate-900',
                card.status === 'ok'
                  ? 'border-emerald-300 dark:border-emerald-700'
                  : card.status === 'warning'
                    ? 'border-amber-300 dark:border-amber-700'
                    : 'border-slate-200 dark:border-slate-700',
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      card.status === 'ok'
                        ? 'text-emerald-500'
                        : card.status === 'warning'
                          ? 'text-amber-500'
                          : 'text-slate-400',
                    )}
                  />
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {card.title}
                  </h4>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateCard(card.key, { status: 'ok' })}
                  className={cn(
                    'flex-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                    card.status === 'ok'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-slate-800 dark:hover:bg-emerald-900/20',
                  )}
                >
                  OK
                </button>
                <button
                  onClick={() => updateCard(card.key, { status: 'warning' })}
                  className={cn(
                    'flex-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                    card.status === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700 dark:bg-slate-800 dark:hover:bg-amber-900/20',
                  )}
                >
                  Warning
                </button>
              </div>
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

      {cards.some((c) => c.status === 'warning') && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-4 overflow-hidden rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          Some items require attention before deployment.
        </motion.div>
      )}
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

function Step6NewRequests({ requests }: { requests: NewRequest[] }) {
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
// Step 7 — Workflow preview
// ───────────────────────────────────────────────────────────────────────────

function Step7WorkflowPreview({ workflow }: { workflow: { nodes: Node[]; edges: Edge[] } }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        7. AI Generated Workflow (Preview)
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Your workflow is ready (preview)
      </h1>
      <p className="mt-1 text-sm text-slate-500">Review the generated workflow before creating it.</p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {workflow.nodes.length} blocks · {workflow.edges.length} connections
          </p>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            Generated
          </span>
        </div>
        {/* Lightweight node list — the real canvas appears once user hits
            "Create in Workflow Builder" and we hand off nodes/edges. */}
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {workflow.nodes.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800"
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white',
                  n.type === 'source' && 'bg-blue-500',
                  n.type === 'destination' && 'bg-emerald-500',
                  n.type === 'join' && 'bg-amber-500',
                  n.type === 'filter' && 'bg-purple-500',
                  n.type === 'ai' && 'bg-fuchsia-500',
                  !['source', 'destination', 'join', 'filter', 'ai'].includes(String(n.type)) && 'bg-slate-500',
                )}
              >
                {String(n.type).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {String(n.data?.label ?? n.id)}
                </p>
                <p className="truncate text-[10px] text-slate-400">{String(n.type)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Step 8 — Code & Configuration
// ───────────────────────────────────────────────────────────────────────────

function Step8CodeConfig({
  sql,
  python,
  yaml,
}: {
  sql: string;
  python: string;
  yaml: string;
}) {
  const [tab, setTab] = useState<'sql' | 'python' | 'yaml'>('sql');
  const code = tab === 'sql' ? sql : tab === 'python' ? python : yaml;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        8. Code & Configuration (Generated)
      </p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Generated code & configuration
      </h1>
      <p className="mt-1 text-sm text-slate-500">Review SQL, Python and configuration generated by AI.</p>

      <LayoutGroup id="wizard-code-tabs">
        <div className="mt-6 flex border-b border-slate-200 dark:border-slate-700">
          {(['sql', 'python', 'yaml'] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'relative px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors',
                  active ? 'text-purple-600 dark:text-purple-300' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                {t === 'yaml' ? 'YAML (config)' : t === 'sql' ? 'SQL' : 'Python'}
                {active && (
                  <motion.span
                    layoutId="code-tab-bar"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <pre className="mt-4 max-h-[400px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
        {code || <span className="italic text-slate-400">No {tab.toUpperCase()} generated.</span>}
      </pre>
    </div>
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
