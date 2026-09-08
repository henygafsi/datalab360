/**
 * Studio — Domain-pack catalog client (Data360 Lite).
 *
 * Backs the app-builder's "pick a domain" step: each pack describes one
 * business domain in plain words — entities with their grain and keys,
 * metric templates, sample prompts, recommended sources — plus the
 * free-sample gate (what costs nothing before credits are spent).
 *
 * Backend route (see API.studio in src/lib/api-contracts.ts):
 *   GET /api/platform/catalogs/domain-packs
 *
 * Contract rules every consumer must honour (from the catalog's own
 * `contract` + `note` fields, verified live):
 *  - metric_templates[].requires_decision === true ⇒ the definition is a
 *    QUESTION to put to the user — NEVER inferred by the AI.
 *  - sample_datasets[].status === 'missing' ⇒ do NOT offer that sample.
 *  - gates.free_sample.allowed_without_credits = what is free pre-credits;
 *    gates.free_sample.credit_gated = what spends credits.
 */
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { dedupGet } from '@/app/services/request-dedup';
import { isPreparing } from '@/app/shared/command-center/lib/meta';
import type { PreparingEnvelope } from '@/app/shared/command-center/lib/meta';

/** Guard `getDomainPacks()` results with this before touching `.packs`. */
export { isPreparing };
export type { PreparingEnvelope };

/**
 * Lifecycle status used across the catalog (see its `status_legend`):
 *  - existing: implemented and callable today
 *  - missing: referenced by the builder but not yet built
 *  - draft: designed or scaffolded, not production-ready
 *  - deprecated: kept as a forwarder for one release, then removed
 */
export type PackStatus = 'existing' | 'missing' | 'draft' | 'deprecated';

/** One entity of a pack — plain-words grain ("ONE ROW = one <grain>"). */
export interface PackEntity {
  name: string;
  /** e.g. "line item", "SKU", "event". */
  grain?: string;
  keys?: string[];
}

/** A proposed metric definition (a proposal, not a fact — see contract). */
export interface MetricTemplate {
  id: string;
  label?: string;
  /** e.g. 'currency' | 'count' | 'days' | '%' | 'credits'. */
  unit?: string;
  /** Competing definitions, e.g. "gross|net", "refunds handling". */
  ambiguities?: string[];
  formula_hint?: string;
  denominator?: string;
  /** Backend operation already serving this metric (existing packs only). */
  source_operation?: string;
  /** true ⇒ the USER settles the definition — never inferred. */
  requires_decision?: boolean;
}

export interface SampleDataset {
  id: string;
  rows?: number;
  /** e.g. 'planned'. */
  location?: string;
  /** 'missing' ⇒ do not offer this sample to the user. */
  status?: PackStatus;
}

/** One business-domain pack (retail_sales, manufacturing_quality, …). */
export interface DomainPack {
  domain_id: string;
  label: string;
  status?: PackStatus;
  version?: string;
  /** Taxonomy anchors (served since taxonomy v1.2): which industry/category
   *  this pack covers, and its default drill order. */
  industry_id?: string;
  category_id?: string;
  hierarchy?: string[];
  vocabulary?: string[];
  entities?: PackEntity[];
  metric_templates?: MetricTemplate[];
  sample_prompts?: string[];
  recommended_source_types?: string[];
  workflow_template_refs?: string[];
  action_template_refs?: string[];
  sample_datasets?: SampleDataset[];
  /** Per-axis stance, values like 'decide' (ask the user) or 'policy'. */
  localization?: Record<string, string>;
  multimodal?: { status?: string; note?: string };
}

/** gate.free_sample — what is free before any credit is spent. */
export interface FreeSampleGates {
  id?: string;
  status?: string;
  applies_to?: string[];
  /** e.g. "preview_rows(limit<=100)", "schema_discovery", "dry_run". */
  allowed_without_credits?: string[];
  /** e.g. "ingestion", "deployment", "scheduled_run". */
  credit_gated?: string[];
  evidence_endpoints?: string[];
}

/** One category of the served industry taxonomy. */
export interface TaxonomyCategory {
  category_id: string;
  label: string;
  /** Packs covering this category — [0] seeds the journey's domain_id. */
  domain_ids?: string[];
  /** Default drill order, e.g. ['company','region','store','department','product']. */
  hierarchy?: string[];
}

/** One industry of the served taxonomy (6 live: retail, manufacturing, …). */
export interface TaxonomyIndustry {
  industry_id: string;
  label: string;
  categories?: TaxonomyCategory[];
}

/** Full payload of GET /api/platform/catalogs/domain-packs. */
export interface DomainPacksCatalog {
  catalog: string;
  version?: string;
  /** The pact in plain words: LLM proposes, Data360 validates, user decides. */
  contract?: string;
  status_legend?: Record<string, string>;
  packs: DomainPack[];
  /** Industry → category taxonomy the selector renders (backend-served). */
  taxonomy?: { industries?: TaxonomyIndustry[] };
  count?: number;
  gates?: { free_sample?: FreeSampleGates };
  note?: string;
  execution_time_ms?: number;
}

/**
 * Domain-pack catalog — deduped (one request serves every Studio surface on a
 * page load), cached 5 min: the catalog is versioned config, not live data.
 * B2: may resolve to a PreparingEnvelope on a cold cache (guard with
 * isPreparing — the dedup layer never stores that envelope). Hard errors
 * throw normally (apiClient).
 */
export async function getDomainPacks(): Promise<DomainPacksCatalog | PreparingEnvelope> {
  return dedupGet('studio:domain-packs', 300_000, async () => {
    // ONE call: the platform catalog serves packs + gates + contract AND
    // (since taxonomy v1.2.0) the industry taxonomy. The /studio route
    // stays available as a fallback via API.studio.domainPacksTaxonomy.
    const { data } = await apiClient.get<DomainPacksCatalog | PreparingEnvelope>(
      API.studio.domainPacks(),
    );
    return data;
  });
}
