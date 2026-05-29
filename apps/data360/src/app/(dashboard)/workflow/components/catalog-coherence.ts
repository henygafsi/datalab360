/**
 * Catalog coherence audit.
 *
 * Cross-checks three sources of truth for ETL blocks:
 *   1. etl-blocks-catalog.json — machine-readable LLM-facing catalog
 *   2. etl-blocks.ts (ETL_BLOCKS) — TypeScript runtime catalog used by the UI
 *   3. etlNodeTypes map in ETLNodeTypes.tsx — ReactFlow component registry
 *
 * It does NOT modify any of the three sources — it only surfaces discrepancies.
 * Findings are intended for `console.warn` in development.
 */

import catalogJson from './etl-blocks-catalog.json';
import { ETL_BLOCKS } from './etl-blocks';
import { etlNodeTypes } from './ETLNodeTypes';

export interface CoherenceIssue {
  block_type: string;
  source: 'json' | 'ts' | 'reactflow';
  problem: string;
}

interface JsonBlockShape {
  type: string;
  ports?: { hasInput?: boolean; hasOutput?: boolean; minInputs?: number; maxInputs?: number };
  params?: { name: string; required?: boolean }[];
}

const safeGetJsonBlocks = (): JsonBlockShape[] => {
  const raw = catalogJson as { blocks?: unknown };
  if (!raw || !Array.isArray(raw.blocks)) return [];
  return raw.blocks as JsonBlockShape[];
};

/**
 * Run the audit. Pure function; safe to call on every mount in dev.
 */
export function auditCatalogCoherence(): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];

  const jsonBlocks = safeGetJsonBlocks();
  const jsonByType = new Map<string, JsonBlockShape>();
  for (const b of jsonBlocks) {
    if (typeof b?.type === 'string') jsonByType.set(b.type, b);
  }

  const tsByType = new Map(ETL_BLOCKS.map((b) => [b.type, b] as const));
  const registeredTypes = new Set(Object.keys(etlNodeTypes as Record<string, unknown>));

  // 1. JSON -> TS: every JSON type must exist in etl-blocks.ts
  for (const [type, jb] of jsonByType) {
    const ts = tsByType.get(type);
    if (!ts) {
      issues.push({
        block_type: type,
        source: 'ts',
        problem: 'Present in etl-blocks-catalog.json but missing from ETL_BLOCKS (etl-blocks.ts).',
      });
      continue;
    }

    // Port arity mismatch
    const jPorts = jb.ports ?? {};
    if (typeof jPorts.minInputs === 'number' && jPorts.minInputs !== ts.minInputs) {
      issues.push({
        block_type: type,
        source: 'json',
        problem: `minInputs mismatch: JSON=${jPorts.minInputs}, TS=${ts.minInputs}.`,
      });
    }
    if (typeof jPorts.maxInputs === 'number' && jPorts.maxInputs !== ts.maxInputs) {
      issues.push({
        block_type: type,
        source: 'json',
        problem: `maxInputs mismatch: JSON=${jPorts.maxInputs}, TS=${ts.maxInputs}.`,
      });
    }
    if (typeof jPorts.hasInput === 'boolean' && jPorts.hasInput !== ts.hasInput) {
      issues.push({
        block_type: type,
        source: 'json',
        problem: `hasInput mismatch: JSON=${jPorts.hasInput}, TS=${ts.hasInput}.`,
      });
    }
    if (typeof jPorts.hasOutput === 'boolean' && jPorts.hasOutput !== ts.hasOutput) {
      issues.push({
        block_type: type,
        source: 'json',
        problem: `hasOutput mismatch: JSON=${jPorts.hasOutput}, TS=${ts.hasOutput}.`,
      });
    }
  }

  // 2. TS -> JSON: every TS block should appear in the JSON catalog
  for (const [type] of tsByType) {
    if (!jsonByType.has(type)) {
      issues.push({
        block_type: type,
        source: 'json',
        problem: 'Present in ETL_BLOCKS but missing from etl-blocks-catalog.json.',
      });
    }
  }

  // 3. TS -> ReactFlow: every TS block must have a registered node component
  for (const [type] of tsByType) {
    if (!registeredTypes.has(type)) {
      issues.push({
        block_type: type,
        source: 'reactflow',
        problem: 'Defined in ETL_BLOCKS but no component registered in etlNodeTypes.',
      });
    }
  }

  // 4. ReactFlow -> TS: every registered component should have a TS definition.
  //    Exception: legacy aliases (`src`, `aggregate_kpi`, `drop_nulls`, `drop_duplicates`,
  //    `normalize`, `export_excel`) are intentionally mapped without TS entries.
  const knownLegacyAliases = new Set(['src', 'aggregate_kpi', 'drop_nulls', 'drop_duplicates', 'normalize', 'export_excel']);
  for (const type of registeredTypes) {
    if (!tsByType.has(type) && !knownLegacyAliases.has(type)) {
      issues.push({
        block_type: type,
        source: 'reactflow',
        problem: 'Registered in etlNodeTypes but missing from ETL_BLOCKS (etl-blocks.ts).',
      });
    }
  }

  // 5. Required-params smoke check — JSON declares required params.
  //    We just confirm at least one required param is declared for non-source blocks.
  for (const [type, jb] of jsonByType) {
    const ts = tsByType.get(type);
    if (!ts) continue;
    const requiredParams = (jb.params ?? []).filter((p) => p.required);
    if (ts.hasInput && ts.hasOutput && requiredParams.length === 0) {
      issues.push({
        block_type: type,
        source: 'json',
        problem: 'Transform/destination block declares zero required params — likely under-specified.',
      });
    }
  }

  return issues;
}
