/**
 * Agentic Data OS — FUNCTIONAL product-opportunity scan (not a security audit).
 *
 * Walks the accessible estate (role-scoped, read-only) and detects, per schema,
 * what data PRODUCTS can be BUILT: star models (fact + dimensions), dashboards
 * (facts with measures), semantic models. Each opportunity is one-click
 * buildable — the security/governance audits are separate ready endpoints and
 * are deliberately NOT rebuilt here.
 */
import { getDatabases, getSchemas, getTables } from '@/app/services/mapping';

export interface ProductOpportunity {
  id: string;
  kind: 'star_model' | 'dashboard' | 'data_product';
  title: string;
  db: string;
  schema: string;
  fact: string | null;
  dims: string[];
  reason: string;
}

export interface OpportunityScan {
  scanned: { databases: number; schemas: number; tables: number };
  opportunities: ProductOpportunity[];
  narrative: string;
}

const APP_DB = /^CP_DATA360$/i;

export async function scanOpportunities(): Promise<OpportunityScan> {
  const dbs = (await getDatabases().catch(() => [])).filter((d) => !APP_DB.test(d));
  const ordered = [
    ...dbs.filter((d) => /DRAFT_SOURCE|SOURCE|RAW|LAKE|DWH|DW/i.test(d)),
    ...dbs.filter((d) => !/DRAFT_SOURCE|SOURCE|RAW|LAKE|DWH|DW/i.test(d)),
  ].slice(0, 4);

  let schemaCount = 0;
  let tableCount = 0;
  const opportunities: ProductOpportunity[] = [];

  for (const db of ordered) {
    const schemas = (await getSchemas(db).catch(() => [])).filter(
      (s) => !/INFORMATION_SCHEMA/i.test(s),
    );
    for (const schema of schemas.slice(0, 6)) {
      const tables = await getTables(db, schema).catch(() => [] as string[]);
      if (!tables.length) continue;
      schemaCount += 1;
      tableCount += tables.length;

      const facts = tables.filter((t) => /^FACT|_FACT|TRANSACTION|ORDER|SALE|EVENT/i.test(t));
      const dims = tables.filter((t) => /^DIM|_DIM|LOOKUP|REF_/i.test(t));

      if (facts.length && dims.length) {
        const fq = (t: string) => `${db}.${schema}.${t}`.toUpperCase();
        opportunities.push({
          id: `opp_star_${schema}`.toLowerCase(),
          kind: 'star_model',
          title: `Star model + dashboard from ${schema}`,
          db,
          schema,
          fact: fq(facts[0]),
          dims: dims.slice(0, 4).map(fq),
          reason: `${facts.length} fact-shaped + ${dims.length} dimension-shaped tables — ready for a governed star model and a sales dashboard.`,
        });
      } else if (facts.length) {
        opportunities.push({
          id: `opp_dash_${schema}`.toLowerCase(),
          kind: 'dashboard',
          title: `Dashboard from ${facts[0]}`,
          db,
          schema,
          fact: `${db}.${schema}.${facts[0]}`.toUpperCase(),
          dims: [],
          reason: `Fact-shaped table with measures — a metric dashboard can be generated directly.`,
        });
      } else if (tables.length >= 3) {
        opportunities.push({
          id: `opp_prod_${schema}`.toLowerCase(),
          kind: 'data_product',
          title: `Reusable data product from ${schema}`,
          db,
          schema,
          fact: null,
          dims: tables.slice(0, 5).map((t) => `${db}.${schema}.${t}`.toUpperCase()),
          reason: `${tables.length} related tables — package as a governed, reusable data product.`,
        });
      }
    }
  }

  const byKind = (k: ProductOpportunity['kind']) => opportunities.filter((o) => o.kind === k).length;
  const narrative =
    `Data360 scanned your accessible estate (${ordered.length} databases, ${schemaCount} schemas, ` +
    `${tableCount} tables) and found ${opportunities.length} product opportunities to build: ` +
    `${byKind('star_model')} star model+dashboard, ${byKind('dashboard')} dashboard, ` +
    `${byKind('data_product')} reusable data product. Each is one click to generate — governed, nothing deployed.`;

  return {
    scanned: { databases: ordered.length, schemas: schemaCount, tables: tableCount },
    opportunities,
    narrative,
  };
}
