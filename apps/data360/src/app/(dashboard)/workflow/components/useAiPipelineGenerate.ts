'use client';

/**
 * useAiPipelineGenerate — headless NL→pipeline generation for the docked
 * "AI Build" flow (AiBuildSection in the WorkflowSmartPanel right rail).
 *
 * This is the SAME generation pipeline the GuidedAiWorkflowWizard uses —
 * prompt building, LLM call (+20s frontend timeout race), tolerant JSON
 * parsing, catalog-grounding validation, multi-input edge repair, and
 * rank-based layout are all imported from the wizard / catalog-grounding
 * modules, not forked. The only difference is that there is no simulated
 * streaming: the docked flow drops the finished graph straight onto the
 * REAL builder canvas instead of a preview canvas.
 *
 * Failure behavior mirrors the wizard: one automatic retry on a cold
 * timeout, then a deterministic catalog-template fallback (clearly labeled
 * `source: 'fallback'`) so the user always lands on a configurable graph.
 */

import { useCallback, useRef, useState } from 'react';
import type { Node, Edge } from 'reactflow';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import {
  getCached,
  setCached,
  clearCache,
  hashKey,
} from './wizard-cortex-cache';
import {
  fallbackGenerateWorkflow,
  isUsableGraph,
} from './etl-catalog-grounding';
import {
  buildBlocksPrompt,
  parseLlmJson,
  repairMultiInputEdges,
  layoutBlocks,
  type BlockPreview,
  type EdgePreview,
} from './GuidedAiWorkflowWizard';

export type AiGenerateSource = 'live' | 'cached' | 'fallback';

export interface AiGenerateResult {
  nodes: Node[];
  edges: Edge[];
  source: AiGenerateSource;
  /** Human-readable reason when `source === 'fallback'`. */
  fallbackReason?: string;
  /** Edges the repair pass had to drop (over a block's input capacity). */
  droppedEdges: number;
}

export type AiGenerateStatus = 'idle' | 'generating' | 'error';

const TIMEOUT_MS = 20_000;
const APPROACH = 'Best balance';

/** Single LLM round-trip with the wizard's 20s timeout race + cache. */
async function callCortexOnce(
  prompt: string,
  cacheKey: string,
): Promise<{ text: string; source: 'live' | 'cached' }> {
  const cached = getCached(cacheKey);
  if (cached !== null) return { text: cached, source: 'cached' };

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
      setTimeout(() => resolve({ ok: false, reason: 'timeout' }), TIMEOUT_MS),
    ),
  ]);

  if (result.ok) {
    setCached(cacheKey, result.text, 'workflow');
    return { text: result.text, source: 'live' };
  }
  const msg = result.reason === 'timeout' ? 'TIMEOUT' : (result.message ?? 'AI error');
  if (/QUERY_CANCELLED|timeout|cancel/i.test(msg)) throw new Error('TIMEOUT');
  throw new Error(msg);
}

export function useAiPipelineGenerate() {
  const [status, setStatus] = useState<AiGenerateStatus>('idle');
  // Monotonic run id — a stale response from a superseded run is dropped.
  const runRef = useRef(0);

  const generate = useCallback(
    async (prompt: string, opts?: { bust?: boolean }): Promise<AiGenerateResult | null> => {
      const runId = ++runRef.current;
      setStatus('generating');

      const cacheKey = hashKey('workflow', prompt.trim(), APPROACH, 'mistral-7b');
      if (opts?.bust) clearCache(cacheKey);

      const fallback = (reason: string): AiGenerateResult => {
        // Bust the cache so the NEXT attempt re-fires the model instead of
        // re-serving the unusable answer forever (same rule as the wizard).
        clearCache(cacheKey);
        const shape = fallbackGenerateWorkflow(prompt);
        const { nodes, edges } = layoutBlocks(shape.blocks, shape.edges);
        return { nodes, edges, source: 'fallback', fallbackReason: reason, droppedEdges: 0 };
      };

      try {
        let raw: { text: string; source: 'live' | 'cached' };
        try {
          raw = await callCortexOnce(buildBlocksPrompt(prompt, APPROACH), cacheKey);
        } catch (first) {
          // One automatic retry on a cold timeout (warehouse warm-up), then
          // fall back deterministically.
          const msg = first instanceof Error ? first.message : String(first);
          if (msg !== 'TIMEOUT') throw first;
          raw = await callCortexOnce(buildBlocksPrompt(prompt, APPROACH), cacheKey);
        }
        if (runId !== runRef.current) return null;

        const parsed = parseLlmJson<{ blocks: BlockPreview[]; edges: EdgePreview[] }>(raw.text);
        if (!parsed || !isUsableGraph(parsed.blocks ?? [], parsed.edges ?? [])) {
          setStatus('idle');
          return fallback('output not catalog-grounded');
        }
        const { edges: repaired, dropped } = repairMultiInputEdges(parsed.blocks, parsed.edges);
        const { nodes, edges } = layoutBlocks(parsed.blocks, repaired);
        setStatus('idle');
        return { nodes, edges, source: raw.source, droppedEdges: dropped };
      } catch (e) {
        if (runId !== runRef.current) return null;
        const msg = e instanceof Error ? e.message : String(e);
        setStatus('idle');
        return fallback(msg === 'TIMEOUT' ? 'AI timed out' : 'AI unreachable');
      }
    },
    [],
  );

  return { generate, status };
}
