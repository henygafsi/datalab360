/**
 * Catalog grounding for the Explore & Design (data-modeling) AI wizard.
 *
 * Mirrors workflow/components/etl-catalog-grounding.ts and
 * data-source-connection/connector-catalog-grounding.ts. The LLM (Snowflake
 * Cortex) has a tight execution budget, so the catalog cannot be sent in
 * full. This module exposes:
 *
 *  - MODEL_CATALOG / ENTITY_BY_ID  — typed access to model-catalog.json
 *  - buildModelPromptSection()     — terse one-line-per-entity index plus the
 *                                    detection + sample-generation strategies,
 *                                    sized for the prompt budget
 *  - validateModelEntity()         — checks a proposed model entity against
 *                                    the catalog before it is committed
 *  - FREE_DISCOVERY_ROW_CAP        — the single source of truth for the
 *                                    1000-row free-discovery cap, enforced
 *                                    client-side by every consumer
 *
 * model-catalog.json is the single source of truth for what counts as a
 * "real" entity template, which detection endpoints exist, and the
 * free-discovery sample-data rules.
 */
import catalogRaw from './model-catalog.json';

/**
 * The hard free-discovery row cap. Both the real-clone path (tablePreview)
 * and the LLM-synthetic path clamp to this number client-side. Beyond it,
 * full-volume access is a paid-plan / metered concern handled elsewhere.
 */
export const FREE_DISCOVERY_ROW_CAP = 1000 as const;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export type ColumnRole =
  | 'surrogate_key'
  | 'natural_key'
  | 'foreign_key'
  | 'measure'
  | 'attribute'
  | 'flag'
  | 'audit'
  | 'scd_meta';

export interface EntityColumn {
  name: string;
  role: ColumnRole;
  type: string;
}

export interface EntityTemplate {
  id: string;
  label: string;
  description: string;
  category: string;
  typical_columns: EntityColumn[];
  usage: string;
}

export interface DetectionStrategy {
  id: string;
  endpoint: string;
  inputs: string[];
  outputs: string[];
  description: string;
}

export type SampleDataClass = 'real' | 'synthetic';

export interface SampleGenerationStrategy {
  id: string;
  label: string;
  data_class: SampleDataClass;
  row_cap: number;
  endpoint: string;
  free_discovery: boolean;
  description: string;
  cap_rule: string;
}

export interface ModelSampleEntity {
  template: string;
  name: string;
  grain: string;
}

export interface ModelSampleRelationship {
  from: string;
  to: string;
  type: string;
}

export interface ModelSample {
  title: string;
  summary: string;
  entities: ModelSampleEntity[];
  relationships: ModelSampleRelationship[];
  sample_generation: string;
}

interface CatalogShape {
  version: string;
  purpose: string;
  categories: Record<string, string>;
  entity_templates: EntityTemplate[];
  detection_strategies: DetectionStrategy[];
  sample_generation: SampleGenerationStrategy[];
  samples: ModelSample[];
}

export const MODEL_CATALOG = catalogRaw as unknown as CatalogShape;

export const ENTITY_TEMPLATES: EntityTemplate[] = MODEL_CATALOG.entity_templates;
export const ENTITY_IDS: string[] = ENTITY_TEMPLATES.map((e) => e.id);
export const ENTITY_BY_ID = new Map<string, EntityTemplate>(
  ENTITY_TEMPLATES.map((e) => [e.id, e]),
);
export const DETECTION_STRATEGIES: DetectionStrategy[] =
  MODEL_CATALOG.detection_strategies;
export const DETECTION_BY_ID = new Map<string, DetectionStrategy>(
  DETECTION_STRATEGIES.map((d) => [d.id, d]),
);
export const SAMPLE_STRATEGIES: SampleGenerationStrategy[] =
  MODEL_CATALOG.sample_generation;
export const SAMPLE_STRATEGY_BY_ID = new Map<string, SampleGenerationStrategy>(
  SAMPLE_STRATEGIES.map((s) => [s.id, s]),
);
export const MODEL_CATEGORIES: Record<string, string> = MODEL_CATALOG.categories;
export const MODEL_SAMPLES: ModelSample[] = MODEL_CATALOG.samples;

// ───────────────────────────────────────────────────────────────────────
// Prompt section — terse index injected into the LLM prompt.
// ───────────────────────────────────────────────────────────────────────

/**
 * Build the catalog section injected into the LLM prompt.
 *
 * One terse line per entity template, plus the detection endpoints and the
 * sample-generation strategies, so the whole index fits a small token
 * budget alongside the user's description.
 */
export function buildModelPromptSection(): string {
  const entities = ENTITY_TEMPLATES.map((e) => {
    const cols = e.typical_columns.map((c) => `${c.name}:${c.role}`).join(',');
    return `- ${e.id} (${e.category}): ${e.description} | columns: ${cols}`;
  }).join('\n');

  const detection = DETECTION_STRATEGIES.map(
    (d) => `- ${d.id}: ${d.description} | inputs: ${d.inputs.join(',')}`,
  ).join('\n');

  const samples = SAMPLE_STRATEGIES.map(
    (s) =>
      `- ${s.id} (${s.data_class}, cap ${s.row_cap}): ${s.description}`,
  ).join('\n');

  return [
    'ENTITY TEMPLATES:',
    entities,
    '',
    'DETECTION STRATEGIES:',
    detection,
    '',
    `SAMPLE GENERATION (free-discovery cap = ${FREE_DISCOVERY_ROW_CAP} rows):`,
    samples,
  ].join('\n');
}

// ───────────────────────────────────────────────────────────────────────
// Validation — gate before a proposed model entity is committed.
// ───────────────────────────────────────────────────────────────────────

export interface ModelEntityLike {
  /** The entity template id the proposal claims to be. */
  template: string;
  /** Optional explicit columns the proposal carries. */
  columns?: Array<{ name?: string; role?: string; type?: string }>;
}

export interface ModelEntityValidationResult {
  ok: boolean;
  /** Reasons the entity is rejected. Empty when ok. */
  errors: string[];
  /** Non-fatal observations (unknown roles, empty column set, …). */
  warnings: string[];
}

const KNOWN_ROLES = new Set<ColumnRole>([
  'surrogate_key',
  'natural_key',
  'foreign_key',
  'measure',
  'attribute',
  'flag',
  'audit',
  'scd_meta',
]);

/**
 * Validate a proposed model entity against the catalog. `ok === true` means
 * the entity references a real template and its columns are well-formed.
 */
export function validateModelEntity(
  entity: ModelEntityLike,
): ModelEntityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const def = ENTITY_BY_ID.get(entity.template);
  if (!def) {
    errors.push(
      `Unknown entity template "${entity.template}" — must be one of: ${ENTITY_IDS.join(', ')}`,
    );
    return { ok: false, errors, warnings };
  }

  const cols = entity.columns ?? [];
  if (cols.length === 0) {
    warnings.push(
      `Entity "${entity.template}" has no explicit columns — the catalog scaffold will be used as a starting point.`,
    );
  }

  cols.forEach((c, i) => {
    if (!c.name || c.name.trim() === '') {
      errors.push(`Column #${i + 1} is missing a name.`);
    }
    if (c.role && !KNOWN_ROLES.has(c.role as ColumnRole)) {
      warnings.push(
        `Column "${c.name ?? `#${i + 1}`}" has an unrecognised role "${c.role}".`,
      );
    }
  });

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Clamp any requested or returned row count to the free-discovery cap.
 * The single helper every sample-data consumer should route through so the
 * cap is enforced consistently in one place.
 */
export function clampToFreeDiscoveryCap(requested: number): number {
  if (!Number.isFinite(requested) || requested < 0) return 0;
  return Math.min(Math.floor(requested), FREE_DISCOVERY_ROW_CAP);
}
