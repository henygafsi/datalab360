/**
 * industry-catalog.ts — the Studio's industry → category → focus enrichment
 * layer, merged over the BACKEND taxonomy.
 *
 * Source of truth: GET /studio/domain-packs now returns
 * `taxonomy.industries[{industry_id, label, categories[{category_id, label,
 * domain_ids[], hierarchy[]}]}]` (6 industries live). This module adds what
 * the backend does not carry — an icon and plain description per industry,
 * ready-made focus questions with DISPLAY HINTS per category, and extra
 * curated industries the backend has no packs for yet. `mergeTaxonomy`
 * builds the single view model the selector renders.
 *
 * The selection composes the BusinessContext ({industry_id, category_id,
 * hierarchy, audience, notes}) that POST /studio/drafts and /studio/understand
 * persist and feed to the AI prompt — the "reach the best display" logic:
 * each focus carries plain display phrases folded into context.notes.
 */

import {
  Building2,
  Cpu,
  Database,
  Factory,
  HeartPulse,
  Landmark,
  Megaphone,
  MonitorSmartphone,
  RadioTower,
  ShoppingCart,
  Truck,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { TaxonomyIndustry } from '@/app/services/studio/domain-packs';

/** A leaf: one question shape, with the display the AI should aim for. */
export interface IndustryFocus {
  id: string;
  label: string;
  /** The need seed, phrased as the user would say it. Editable before start. */
  need: string;
  /** Plain display phrases folded into context.notes (best-display logic). */
  display: string[];
}

interface CuratedCategory {
  id: string;
  label: string;
  /** Default drill order when the backend category carries none. */
  hierarchy?: string[];
  focuses: IndustryFocus[];
}

interface CuratedIndustry {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  categories: CuratedCategory[];
}

/* Reusable display phrases — plain words, never chart jargon. */
const D = {
  kpis: 'headline figures first',
  trend: 'a trend over time',
  ranking: 'a ranking of the worst and best',
  breakdown: 'a breakdown by category',
  distribution: 'how values spread out',
  detail: 'a drill-down detail table',
  funnel: 'a step-by-step conversion view',
  anomaly: 'anomalies flagged against the usual level',
  comparison: 'a side-by-side comparison',
} as const;

/**
 * Curated layer. Industry & category ids MATCH the backend taxonomy where it
 * exists (retail.sales, manufacturing.quality, …) so merging is by id; the
 * rest are front-curated extras that work without a pack (context is free).
 */
const CURATED: CuratedIndustry[] = [
  {
    id: 'retail',
    label: 'Retail & distribution',
    icon: ShoppingCart,
    description: 'Sales, stock, stores, products and customers.',
    categories: [
      {
        id: 'retail.sales',
        label: 'Sales & inventory',
        hierarchy: ['company', 'region', 'store', 'department', 'product'],
        focuses: [
          {
            id: 'store-profitability',
            label: 'Store profitability',
            need: 'Which stores are losing money and why?',
            display: [D.kpis, D.ranking, D.trend, D.detail],
          },
          {
            id: 'revenue-by-region',
            label: 'Revenue by region',
            need: 'Weekly revenue by region, net of refunds — where is it moving?',
            display: [D.kpis, D.trend, D.breakdown],
          },
          {
            id: 'stock-cover',
            label: 'Stock cover risk',
            need: 'Where does stock cover drop under 7 days for my top products?',
            display: [D.kpis, D.ranking, D.anomaly, D.detail],
          },
          {
            id: 'sell-through',
            label: 'Sell-through',
            need: 'Which stores lost sell-through this month and why?',
            display: [D.trend, D.ranking, D.breakdown],
          },
        ],
      },
      {
        id: 'retail.customer',
        label: 'Customers & loyalty',
        hierarchy: ['company', 'segment', 'customer'],
        focuses: [
          {
            id: 'repeat-purchase',
            label: 'Repeat purchase',
            need: 'How many customers come back within 90 days, and what do they buy?',
            display: [D.kpis, D.trend, D.breakdown],
          },
          {
            id: 'basket',
            label: 'Basket size',
            need: 'How is the average basket evolving, by store and by channel?',
            display: [D.trend, D.comparison, D.distribution],
          },
        ],
      },
    ],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    icon: Factory,
    description: 'Production lines, quality events, batches and downtime.',
    categories: [
      {
        id: 'manufacturing.quality',
        label: 'Quality & defects',
        hierarchy: ['plant', 'line', 'batch', 'event'],
        focuses: [
          {
            id: 'defect-rate',
            label: 'Defect rate by line',
            need: 'Trend of defect rate by line, weekly — which lines drift above baseline?',
            display: [D.kpis, D.trend, D.anomaly, D.detail],
          },
          {
            id: 'worst-batches',
            label: 'Worst batches',
            need: 'Which batches concentrate quality events, and on which lines?',
            display: [D.ranking, D.breakdown, D.detail],
          },
        ],
      },
      {
        id: 'manufacturing.throughput',
        label: 'Throughput & downtime',
        hierarchy: ['plant', 'line', 'shift', 'stop'],
        focuses: [
          {
            id: 'line-effectiveness',
            label: 'Line effectiveness',
            need: 'Which lines lose the most output to stops and slowdowns?',
            display: [D.kpis, D.ranking, D.trend],
          },
          {
            id: 'downtime-causes',
            label: 'Downtime causes',
            need: 'What are the top causes of downtime and how are they trending?',
            display: [D.breakdown, D.trend, D.detail],
          },
        ],
      },
    ],
  },
  {
    id: 'public_sector',
    label: 'Public services',
    icon: Building2,
    description: 'Requests, processing times, teams and budgets.',
    categories: [
      {
        id: 'public.requests',
        label: 'Requests & delays',
        hierarchy: ['organisation', 'zone', 'team', 'request'],
        focuses: [
          {
            id: 'processing-times',
            label: 'Processing times',
            need: 'Which request types take longest to process, and where is the backlog?',
            display: [D.kpis, D.distribution, D.ranking, D.detail],
          },
          {
            id: 'team-load',
            label: 'Team load',
            need: 'How is the request load spread across teams and zones?',
            display: [D.breakdown, D.comparison, D.trend],
          },
        ],
      },
      {
        id: 'public.budget',
        label: 'Budget execution',
        hierarchy: ['organisation', 'program', 'project', 'expense'],
        focuses: [
          {
            id: 'budget-drift',
            label: 'Budget drift',
            need: 'Budget spent versus planned by program — which programs drift?',
            display: [D.comparison, D.trend, D.breakdown],
          },
        ],
      },
    ],
  },
  {
    id: 'logistics',
    label: 'Logistics & transport',
    icon: Truck,
    description: 'Shipments, delays, carriers and warehouse flow.',
    categories: [
      {
        id: 'logistics.delivery',
        label: 'Shipments & delays',
        hierarchy: ['network', 'hub', 'carrier', 'shipment'],
        focuses: [
          {
            id: 'on-time',
            label: 'On-time rate',
            need: 'On-time delivery rate by carrier and lane — who is slipping?',
            display: [D.kpis, D.ranking, D.trend],
          },
          {
            id: 'delay-causes',
            label: 'Delay causes',
            need: 'What causes late shipments, and which routes concentrate them?',
            display: [D.breakdown, D.detail, D.anomaly],
          },
        ],
      },
      {
        id: 'logistics.warehouse',
        label: 'Warehouse flow',
        hierarchy: ['network', 'site', 'zone', 'order'],
        focuses: [
          {
            id: 'pick-throughput',
            label: 'Pick throughput',
            need: 'Orders picked per hour by site — where does throughput dip?',
            display: [D.trend, D.comparison, D.distribution],
          },
        ],
      },
    ],
  },
  {
    id: 'iot',
    label: 'Events & sensors',
    icon: Cpu,
    description: 'Equipment, sensor measures, thresholds and anomalies.',
    categories: [
      {
        id: 'iot.monitoring',
        label: 'Measures & anomalies',
        hierarchy: ['site', 'equipment', 'sensor', 'event'],
        focuses: [
          {
            id: 'sensor-anomalies',
            label: 'Sensor anomalies',
            need: 'Which equipment reports measures outside its usual range?',
            display: [D.anomaly, D.trend, D.detail],
          },
          {
            id: 'event-volume',
            label: 'Event volume',
            need: 'Event volume by site and equipment — where do spikes come from?',
            display: [D.kpis, D.trend, D.breakdown],
          },
        ],
      },
    ],
  },
  {
    id: 'data_platform',
    label: 'Data platform',
    icon: Database,
    description: 'Compute spend, query load, users and cost anomalies.',
    categories: [
      {
        id: 'platform.finops',
        label: 'FinOps',
        hierarchy: ['organisation', 'account', 'warehouse', 'query'],
        focuses: [
          {
            id: 'credit-consumers',
            label: 'Top credit consumers',
            need: 'Who consumed the most credits this month and on which warehouses?',
            display: [D.kpis, D.ranking, D.breakdown],
          },
          {
            id: 'cost-anomalies',
            label: 'Cost anomalies',
            need: 'Alert me on cost anomalies above twice the usual level.',
            display: [D.anomaly, D.trend, D.detail],
          },
          {
            id: 'cost-per-project',
            label: 'Cost per project',
            need: 'Monthly cost report per project, with the month-over-month change.',
            display: [D.kpis, D.comparison, D.breakdown],
          },
        ],
      },
    ],
  },
  /* ── Curated extras (no backend pack yet — context still works) ────── */
  {
    id: 'financial_services',
    label: 'Financial services',
    icon: Landmark,
    description: 'Portfolios, transactions, risk and compliance.',
    categories: [
      {
        id: 'finserv.risk',
        label: 'Risk & exposure',
        hierarchy: ['portfolio', 'sector', 'counterparty', 'position'],
        focuses: [
          {
            id: 'exposure-concentration',
            label: 'Exposure concentration',
            need: 'Where is my exposure concentrated, by counterparty and by sector?',
            display: [D.kpis, D.breakdown, D.ranking],
          },
          {
            id: 'late-payments',
            label: 'Late payments',
            need: 'Which accounts are sliding into late payment, and how fast?',
            display: [D.trend, D.ranking, D.anomaly, D.detail],
          },
        ],
      },
      {
        id: 'finserv.operations',
        label: 'Operations',
        hierarchy: ['entity', 'channel', 'day', 'transaction'],
        focuses: [
          {
            id: 'transaction-failures',
            label: 'Transaction failures',
            need: 'Daily transaction volumes and failure rates — where do failures cluster?',
            display: [D.kpis, D.trend, D.anomaly],
          },
        ],
      },
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    icon: HeartPulse,
    description: 'Patients, visits, capacity and outcomes.',
    categories: [
      {
        id: 'health.capacity',
        label: 'Capacity & flow',
        hierarchy: ['facility', 'unit', 'day', 'visit'],
        focuses: [
          {
            id: 'wait-times',
            label: 'Waiting times',
            need: 'Where are waiting times longest, and at what hours of the day?',
            display: [D.kpis, D.distribution, D.trend],
          },
          {
            id: 'occupancy',
            label: 'Occupancy',
            need: 'How is occupancy evolving by unit, against safe thresholds?',
            display: [D.trend, D.comparison, D.anomaly],
          },
        ],
      },
    ],
  },
  {
    id: 'energy',
    label: 'Energy & utilities',
    icon: Zap,
    description: 'Consumption, generation, outages and grid assets.',
    categories: [
      {
        id: 'energy.consumption',
        label: 'Consumption',
        hierarchy: ['region', 'site', 'meter', 'reading'],
        focuses: [
          {
            id: 'usage-anomalies',
            label: 'Usage anomalies',
            need: 'Which sites consume abnormally versus their usual profile?',
            display: [D.anomaly, D.trend, D.ranking],
          },
          {
            id: 'peak-load',
            label: 'Peak load',
            need: 'When do we hit peak load, and what drives it?',
            display: [D.trend, D.distribution, D.breakdown],
          },
        ],
      },
    ],
  },
  {
    id: 'telecom_media',
    label: 'Telecom & media',
    icon: RadioTower,
    description: 'Subscribers, usage, churn and network quality.',
    categories: [
      {
        id: 'telecom.subscribers',
        label: 'Subscribers & churn',
        hierarchy: ['market', 'plan', 'segment', 'subscriber'],
        focuses: [
          {
            id: 'churn-drivers',
            label: 'Churn drivers',
            need: 'Which customer segments churn most, and what precedes it?',
            display: [D.kpis, D.ranking, D.funnel, D.detail],
          },
          {
            id: 'arpu',
            label: 'Revenue per user',
            need: 'How is revenue per user moving by plan and by region?',
            display: [D.trend, D.comparison, D.breakdown],
          },
        ],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing & growth',
    icon: Megaphone,
    description: 'Campaigns, funnels, acquisition cost and retention.',
    categories: [
      {
        id: 'marketing.acquisition',
        label: 'Acquisition',
        hierarchy: ['channel', 'campaign', 'cohort', 'lead'],
        focuses: [
          {
            id: 'cac-by-channel',
            label: 'Cost per acquisition',
            need: 'Acquisition cost by channel against the value it brings — what should we cut?',
            display: [D.kpis, D.comparison, D.ranking],
          },
          {
            id: 'funnel-dropoff',
            label: 'Funnel drop-off',
            need: 'Where does the signup funnel lose the most people?',
            display: [D.funnel, D.trend, D.detail],
          },
        ],
      },
    ],
  },
  {
    id: 'hr',
    label: 'HR & people',
    icon: Users,
    description: 'Headcount, attrition, hiring and engagement.',
    categories: [
      {
        id: 'hr.workforce',
        label: 'Workforce',
        hierarchy: ['company', 'department', 'team', 'person'],
        focuses: [
          {
            id: 'attrition',
            label: 'Attrition',
            need: 'Which teams lose people fastest, and is it accelerating?',
            display: [D.kpis, D.trend, D.ranking],
          },
          {
            id: 'hiring-pipeline',
            label: 'Hiring pipeline',
            need: 'How long does hiring take at each stage, by role family?',
            display: [D.funnel, D.distribution, D.detail],
          },
        ],
      },
    ],
  },
  {
    id: 'technology',
    label: 'Technology & SaaS',
    icon: MonitorSmartphone,
    description: 'Product usage, subscriptions, reliability and support.',
    categories: [
      {
        id: 'tech.product',
        label: 'Product usage',
        hierarchy: ['product', 'plan', 'account', 'user'],
        focuses: [
          {
            id: 'feature-adoption',
            label: 'Feature adoption',
            need: 'Which features do paying accounts actually use, and which are dead weight?',
            display: [D.ranking, D.breakdown, D.trend],
          },
          {
            id: 'active-accounts',
            label: 'Active accounts',
            need: 'Weekly active accounts and how they convert to paid.',
            display: [D.kpis, D.trend, D.funnel],
          },
        ],
      },
    ],
  },
];

/* ── Merged view model (backend taxonomy ∪ curated layer) ───────────── */

export interface MergedCategory {
  id: string;
  label: string;
  /** Drill order — backend first, curated default second, editable in UI. */
  hierarchy: string[];
  /** Packs covering this category (domain_ids[0] seeds the journey). */
  domainIds: string[];
  focuses: IndustryFocus[];
  fromBackend: boolean;
}

export interface MergedIndustry {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  categories: MergedCategory[];
  /** true when the backend taxonomy lists this industry (packs behind it). */
  fromBackend: boolean;
}

const FALLBACK_ICON: LucideIcon = Database;

/**
 * Merge order: backend industries first (their order), curated extras after.
 * Labels: CURATED wins when present — the UI speaks one language — and the
 * backend label fills industries/categories the curated layer doesn't know.
 * Structure (domain_ids, hierarchy) always comes from the backend taxonomy.
 */
export function mergeTaxonomy(backend: TaxonomyIndustry[] | undefined): MergedIndustry[] {
  const curatedById = new Map(CURATED.map((c) => [c.id, c]));
  const out: MergedIndustry[] = [];
  const seen = new Set<string>();

  for (const ind of backend ?? []) {
    const curated = curatedById.get(ind.industry_id);
    seen.add(ind.industry_id);
    const catCuratedById = new Map((curated?.categories ?? []).map((c) => [c.id, c]));
    const cats: MergedCategory[] = [];
    const seenCats = new Set<string>();
    for (const bc of ind.categories ?? []) {
      const cc = catCuratedById.get(bc.category_id);
      seenCats.add(bc.category_id);
      cats.push({
        id: bc.category_id,
        label: cc?.label || bc.label || bc.category_id,
        hierarchy: bc.hierarchy?.length ? bc.hierarchy : cc?.hierarchy ?? [],
        domainIds: bc.domain_ids ?? [],
        focuses: cc?.focuses ?? [],
        fromBackend: true,
      });
    }
    for (const cc of curated?.categories ?? []) {
      if (seenCats.has(cc.id)) continue;
      cats.push({
        id: cc.id,
        label: cc.label,
        hierarchy: cc.hierarchy ?? [],
        domainIds: [],
        focuses: cc.focuses,
        fromBackend: false,
      });
    }
    out.push({
      id: ind.industry_id,
      label: curated?.label || ind.label || ind.industry_id,
      icon: curated?.icon ?? FALLBACK_ICON,
      description: curated?.description ?? '',
      categories: cats,
      fromBackend: true,
    });
  }

  for (const curated of CURATED) {
    if (seen.has(curated.id)) continue;
    out.push({
      id: curated.id,
      label: curated.label,
      icon: curated.icon,
      description: curated.description,
      categories: curated.categories.map((cc) => ({
        id: cc.id,
        label: cc.label,
        hierarchy: cc.hierarchy ?? [],
        domainIds: [],
        focuses: cc.focuses,
        fromBackend: false,
      })),
      fromBackend: false,
    });
  }

  return out;
}
