/**
 * understanding.ts — Studio Understanding step: AI schema intelligence over
 * the user's EXPLICIT table picks (discovery ≠ inclusion — mission §18).
 *
 * Reuses the same routes the AI-guided model wizard already calls
 * (POST /explore-design/{projectId}/ai/classify-columns and
 * /ai/discover-relationships — free-sample gated ops per credit-rules):
 * nothing new is invented backend-side. Relationships inferred from samples
 * stay HYPOTHESES until validated (mission §10) — this module never
 * upgrades a confidence score into a "validated" status.
 */

import {
  aiClassifyColumns,
  aiDiscoverRelationships,
} from '@/app/services/api/exploreDesignApi';
import type { AiColumnClassification } from '@/app/services/api/types';

export interface UnderstandingEntity {
  name: string; // schema.table
  source: string;
  rowCount?: number | null;
  keyColumns: string[];
  metricColumns: string[];
  piiColumns: string[];
  classifiedColumns?: number;
}

export interface UnderstandingRelation {
  from: string;
  to: string;
  keys: string; // "SRC.STORE_ID → DIM.STORE_ID"
  status: 'hypothesis'; // sample-inferred — never auto-validated
  confidencePct?: number;
  method?: string;
}

export interface UnderstandingProposal {
  entities: UnderstandingEntity[];
  relations: UnderstandingRelation[];
  /** Per-call credits reported by the backend (0 for free-gated ops). */
  aiCredits: number;
  /** Tables we asked about but could not classify (kept honest). */
  skipped: Array<{ table: string; reason: string }>;
}

const pick = (
  cls: AiColumnClassification[] | undefined,
  cat: string,
): string[] =>
  (cls ?? [])
    .filter((c) => c.category === cat)
    .map((c) => c.column)
    .slice(0, 6);

/**
 * Analyze the picked tables: classify columns per table (bounded to the
 * first `maxClassify`) + discover relationships per schema (needs ≥2 tables
 * in the same schema). Requires an active explore-design project id — the
 * same requirement the existing wizard has.
 */
export async function proposeUnderstanding(input: {
  projectId: string;
  database: string;
  objects: Array<{ schema: string; table: string; rowCount?: number | null; sourceSystem?: string | null }>;
  maxClassify?: number;
}): Promise<UnderstandingProposal> {
  const { projectId, database, objects } = input;
  const maxClassify = input.maxClassify ?? 4;
  let aiCredits = 0;
  const skipped: UnderstandingProposal['skipped'] = [];

  // 1. Classify columns — bounded, per table, failures kept per-table.
  const toClassify = objects.slice(0, maxClassify);
  const classifications = await Promise.all(
    toClassify.map(async (o) => {
      try {
        const res = await aiClassifyColumns(projectId, {
          database,
          schema: o.schema,
          table: o.table,
        });
        aiCredits += Number(res?.cortex_credits ?? 0) || 0;
        return { o, cls: res?.classifications ?? [] };
      } catch (e) {
        skipped.push({
          table: `${o.schema}.${o.table}`,
          reason: e instanceof Error ? e.message : 'classification failed',
        });
        return { o, cls: [] as AiColumnClassification[] };
      }
    }),
  );

  const entities: UnderstandingEntity[] = objects.map((o) => {
    const hit = classifications.find(
      (c) => c.o.schema === o.schema && c.o.table === o.table,
    );
    // Brand rule: the catalog's source_system may carry a vendor name —
    // customer-facing copy stays neutral.
    const src = (o.sourceSystem ?? '').toLowerCase();
    return {
      name: `${o.schema}.${o.table}`,
      source:
        !o.sourceSystem || src.includes('snowflake')
          ? 'your warehouse'
          : o.sourceSystem,
      rowCount: o.rowCount ?? null,
      keyColumns: pick(hit?.cls, 'KEY'),
      metricColumns: pick(hit?.cls, 'METRIC'),
      piiColumns: pick(hit?.cls, 'PII'),
      classifiedColumns: hit?.cls.length || undefined,
    };
  });

  // 2. Discover relationships — per schema having ≥2 picked tables.
  const bySchema = new Map<string, string[]>();
  for (const o of objects) {
    bySchema.set(o.schema, [...(bySchema.get(o.schema) ?? []), o.table]);
  }
  const relations: UnderstandingRelation[] = [];
  for (const [schema, tables] of bySchema) {
    if (tables.length < 2) continue;
    try {
      const res = await aiDiscoverRelationships(projectId, {
        database,
        schema,
        tables,
      });
      aiCredits += Number(res?.cortex_credits ?? 0) || 0;
      for (const r of res?.relationships ?? []) {
        relations.push({
          from: r.source_table,
          to: r.target_table,
          keys: `${r.source_column} → ${r.target_column}`,
          status: 'hypothesis',
          confidencePct: Number.isFinite(r.confidence)
            ? Math.round(r.confidence * 100)
            : undefined,
          method: r.discovery_method,
        });
      }
    } catch (e) {
      skipped.push({
        table: `${schema}.*`,
        reason:
          e instanceof Error ? e.message : 'relationship discovery failed',
      });
    }
  }

  return { entities, relations, aiCredits, skipped };
}
