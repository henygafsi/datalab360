// ============================================================================
// Seed 3 sample BI dashboards on DRAFT_SOURCE.RETAIL_DW with REAL data.
//
// Durable + idempotent: deletes any existing dashboard with the same name,
// then recreates it. Every widget's ChartConfig is render-validated against
// the live backend BEFORE the widget is persisted, so no broken charts land.
// Uses explicit ChartConfigs only (NOT retail-kpis / nl-to-chart, which are
// backend-broken). Talks to whatever backend the dev proxy points at
// (currently local uvicorn :8000 via apps/data360/.env.local).
//
//   node e2e/seed-retail-dashboards.mjs
//
// Re-run any time; it self-cleans. Columns verified live (2026-06-13):
//   FACT_ORDERS(ORDER_ID,CLIENT_ID,STORE_ID,ITEM_ID,ORDER_DATE,QUANTITY,AMOUNT,CHANNEL_ID)
//   FACT_FINANCE(TX_ID,TX_DATE,ACCOUNT,AMOUNT,CURRENCY)
//   FACT_MARKETING(CAMPAIGN_ID,CHANNEL_ID,START_DATE,END_DATE,BUDGET,REVENUE)
//   FACT_REVIEWS(REVIEW_ID,CLIENT_ID,ITEM_ID,RATING,REVIEW_DATE,COMMENT)
//   FACT_RETURNS(RETURN_ID,ORDER_ID,RETURN_DATE,REASON,AMOUNT)
//   DIM_ITEMS(ITEM_ID,ITEM_NAME,CATEGORY,BRAND,PRICE,COST)
// ============================================================================
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const DB = 'DRAFT_SOURCE';
const SCHEMA = 'RETAIL_DW';

// ── config builders ─────────────────────────────────────────────────────────
const agg = (table, x, column, aggregator, extra = {}) => ({
  database: DB, schema: SCHEMA, table, mode: 'aggregate',
  x, measures: [{ column, aggregator }], groupBy: x ? [x] : [], limit: 50, ...extra,
});
const multiAgg = (table, x, measures, extra = {}) => ({
  database: DB, schema: SCHEMA, table, mode: 'aggregate',
  x, measures, groupBy: x ? [x] : [], limit: 50, ...extra,
});
const kpi = (table, column, aggregator) => ({
  database: DB, schema: SCHEMA, table, mode: 'aggregate',
  measures: [{ column, aggregator }], groupBy: [],
});
const tableCfg = (table, columns) => ({
  database: DB, schema: SCHEMA, table, mode: 'raw', columns, limit: 50,
});

// w/h follow the editor's grid (KPI 4x2, chart 6x4 / 12x4, table 12x4).
const DASHBOARDS = [
  {
    name: 'SAMPLE · Retail Sales Overview',
    description: 'Sales KPIs, revenue by store/channel, trend, and order detail — DRAFT_SOURCE.RETAIL_DW.',
    page: 'Sales',
    widgets: [
      { t: 'kpi_card', ct: 'kpi', title: 'Total Revenue', cfg: kpi('FACT_ORDERS', 'AMOUNT', 'SUM'), w: 4, h: 2 },
      { t: 'kpi_card', ct: 'kpi', title: 'Total Orders', cfg: kpi('FACT_ORDERS', 'ORDER_ID', 'COUNT'), w: 4, h: 2 },
      { t: 'kpi_card', ct: 'kpi', title: 'Units Sold', cfg: kpi('FACT_ORDERS', 'QUANTITY', 'SUM'), w: 4, h: 2 },
      { t: 'chart', ct: 'bar', title: 'Revenue by Store', cfg: agg('FACT_ORDERS', 'STORE_ID', 'AMOUNT', 'SUM', { limit: 15 }), w: 6, h: 4 },
      { t: 'chart', ct: 'pie', title: 'Units by Channel', cfg: agg('FACT_ORDERS', 'CHANNEL_ID', 'QUANTITY', 'SUM'), w: 6, h: 4 },
      { t: 'chart', ct: 'line', title: 'Revenue Over Time', cfg: agg('FACT_ORDERS', 'ORDER_DATE', 'AMOUNT', 'SUM', { limit: 365 }), w: 12, h: 4 },
      { t: 'table', ct: null, title: 'Recent Orders', cfg: tableCfg('FACT_ORDERS', ['ORDER_ID', 'ORDER_DATE', 'STORE_ID', 'ITEM_ID', 'QUANTITY', 'AMOUNT']), w: 12, h: 4 },
    ],
  },
  {
    name: 'SAMPLE · Finance & Returns',
    description: 'Transaction totals, account breakdown, returns analysis — DRAFT_SOURCE.RETAIL_DW.',
    page: 'Finance',
    widgets: [
      { t: 'kpi_card', ct: 'kpi', title: 'Transaction Amount', cfg: kpi('FACT_FINANCE', 'AMOUNT', 'SUM'), w: 4, h: 2 },
      { t: 'kpi_card', ct: 'kpi', title: 'Returns Amount', cfg: kpi('FACT_RETURNS', 'AMOUNT', 'SUM'), w: 4, h: 2 },
      { t: 'kpi_card', ct: 'kpi', title: 'Return Count', cfg: kpi('FACT_RETURNS', 'RETURN_ID', 'COUNT'), w: 4, h: 2 },
      { t: 'chart', ct: 'bar', title: 'Amount by Account', cfg: agg('FACT_FINANCE', 'ACCOUNT', 'AMOUNT', 'SUM'), w: 6, h: 4 },
      { t: 'chart', ct: 'donut', title: 'Returns by Reason', cfg: agg('FACT_RETURNS', 'REASON', 'AMOUNT', 'SUM'), w: 6, h: 4 },
      { t: 'chart', ct: 'area', title: 'Transactions Over Time', cfg: agg('FACT_FINANCE', 'TX_DATE', 'AMOUNT', 'SUM', { limit: 365 }), w: 12, h: 4 },
      { t: 'table', ct: null, title: 'Returns Detail', cfg: tableCfg('FACT_RETURNS', ['RETURN_ID', 'ORDER_ID', 'RETURN_DATE', 'REASON', 'AMOUNT']), w: 12, h: 4 },
    ],
  },
  {
    name: 'SAMPLE · Marketing & Product',
    description: 'Campaign budget vs revenue, product pricing, review ratings — DRAFT_SOURCE.RETAIL_DW.',
    page: 'Marketing',
    widgets: [
      { t: 'kpi_card', ct: 'kpi', title: 'Marketing Budget', cfg: kpi('FACT_MARKETING', 'BUDGET', 'SUM'), w: 4, h: 2 },
      { t: 'kpi_card', ct: 'kpi', title: 'Campaign Revenue', cfg: kpi('FACT_MARKETING', 'REVENUE', 'SUM'), w: 4, h: 2 },
      { t: 'kpi_card', ct: 'kpi', title: 'Avg Review Rating', cfg: kpi('FACT_REVIEWS', 'RATING', 'AVG'), w: 4, h: 2 },
      { t: 'chart', ct: 'combo', title: 'Budget vs Revenue by Channel', cfg: multiAgg('FACT_MARKETING', 'CHANNEL_ID', [{ column: 'BUDGET', aggregator: 'SUM' }, { column: 'REVENUE', aggregator: 'SUM' }]), w: 6, h: 4 },
      { t: 'chart', ct: 'bar', title: 'Avg Price by Category', cfg: agg('DIM_ITEMS', 'CATEGORY', 'PRICE', 'AVG'), w: 6, h: 4 },
      { t: 'chart', ct: 'line', title: 'Campaign Revenue Over Time', cfg: agg('FACT_MARKETING', 'START_DATE', 'REVENUE', 'SUM', { limit: 365 }), w: 6, h: 4 },
      { t: 'chart', ct: 'bar', title: 'Ratings Distribution', cfg: agg('FACT_REVIEWS', 'RATING', 'REVIEW_ID', 'COUNT'), w: 6, h: 4 },
    ],
  },
];

// ── grid layout: pack into a 12-col grid ────────────────────────────────────
function layout(widgets) {
  let x = 0, y = 0, rowH = 0;
  return widgets.map((wg) => {
    if (x + wg.w > 12) { x = 0; y += rowH; rowH = 0; }
    const placed = { ...wg, position_x: x, position_y: y };
    x += wg.w; rowH = Math.max(rowH, wg.h);
    return placed;
  });
}

// ── run ─────────────────────────────────────────────────────────────────────
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ storageState: 'e2e/.auth/state.json', viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/account-overview`, { waitUntil: 'domcontentloaded', timeout: 40000 });
await p.waitForTimeout(1500);

const report = await p.evaluate(async ({ DASHBOARDS, layoutFnSrc }) => {
  const layout = eval('(' + layoutFnSrc + ')');
  const token = localStorage.getItem('access_token') || localStorage.getItem('snowflake_token');
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const J = async (method, path, body) => {
    const res = await fetch(`/api-proxy${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch { data = await res.text(); }
    return { status: res.status, data };
  };
  const out = [];

  // existing bi_dashboard projects (for idempotent delete)
  const uni = await J('GET', '/projects/unified');
  const existing = (uni.data?.projects || []).filter((x) => x.type === 'bi_dashboard');

  for (const d of DASHBOARDS) {
    const rec = { name: d.name, steps: [], widgets: [] };
    // idempotent: delete any existing dashboard with this name
    for (const ex of existing.filter((e) => e.name === d.name)) {
      const del = await J('DELETE', `/bi-dashboard/${ex.project_id}`);
      rec.steps.push(`deleted existing ${ex.project_id} → ${del.status}`);
    }
    // create dashboard
    const cr = await J('POST', '/bi-dashboard', { project_name: d.name, description: d.description, default_database: 'DRAFT_SOURCE', default_schema: 'RETAIL_DW' });
    const projectId = cr.data?.project_id;
    rec.projectId = projectId;
    rec.steps.push(`create dashboard → ${cr.status} ${projectId || JSON.stringify(cr.data).slice(0, 120)}`);
    if (!projectId) { out.push(rec); continue; }

    // page: reuse first page if created, else create one
    const full = await J('GET', `/bi-dashboard/${projectId}`);
    let pageId = full.data?.pages?.[0]?.page_id;
    if (!pageId) {
      const pg = await J('POST', `/bi-dashboard/${projectId}/pages`, { title: d.page, page_order: 0 });
      pageId = pg.data?.page_id;
      rec.steps.push(`create page → ${pg.status} ${pageId}`);
    } else {
      rec.steps.push(`reuse page ${pageId}`);
    }

    // widgets — render-validate each config, then persist
    const placed = layout(d.widgets);
    for (const wg of placed) {
      const rv = await J('POST', `/bi-dashboard/${projectId}/render`, { widgets: [{ widget_id: 'validate', config: wg.cfg }] });
      const w0 = rv.data?.widgets?.[0];
      const okData = rv.status === 200 && w0?.status === 'ok';
      const rows = w0?.row_count ?? (Array.isArray(w0?.data) ? w0.data.length : 0);
      if (!okData) {
        rec.widgets.push({ title: wg.title, ct: wg.ct, created: false, reason: `render ${rv.status}/${w0?.status}: ${(w0?.error || JSON.stringify(rv.data)).slice(0, 140)}` });
        continue;
      }
      const cw = await J('POST', `/bi-dashboard/${projectId}/widgets`, {
        page_id: pageId, widget_type: wg.t, chart_type: wg.ct, title: wg.title,
        chart_config: wg.cfg, position_x: wg.position_x, position_y: wg.position_y, width: wg.w, height: wg.h,
      });
      rec.widgets.push({ title: wg.title, ct: wg.ct, created: cw.status === 200 || cw.status === 201, rows, widget_id: cw.data?.widget_id, status: cw.status });
    }
    out.push(rec);
  }
  return out;
}, { DASHBOARDS, layoutFnSrc: layout.toString() });

writeFileSync('e2e/ux-audit/bi-probe/seed-report.json', JSON.stringify(report, null, 2));
console.log('\n=== SEED REPORT ===');
for (const r of report) {
  console.log(`\n## ${r.name}  →  ${r.projectId || 'FAILED'}`);
  r.steps.forEach((s) => console.log('   ' + s));
  r.widgets.forEach((w) => console.log(`   ${w.created ? '✓' : '✗'} ${w.ct || 'table'} "${w.title}"${w.created ? ` (${w.rows} rows)` : ` — ${w.reason}`}`));
}
const total = report.reduce((n, r) => n + r.widgets.filter((w) => w.created).length, 0);
const failed = report.reduce((n, r) => n + r.widgets.filter((w) => !w.created).length, 0);
console.log(`\nTOTAL widgets created: ${total}, failed: ${failed}`);
await b.close();
