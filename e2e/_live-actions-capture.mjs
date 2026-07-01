import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'https://datalab360-data360.vercel.app';
const AUTH = 'e2e/.auth/live-haha.json';

// module route -> label (sidebar modules)
const MODULES = [
  ['/account-overview', 'account_overview'],
  ['/connect', 'connect'],
  ['/explore-design', 'explore_design'],
  ['/workflow', 'workflow'],
  ['/governance', 'governance'],
  ['/bi-dashboard', 'bi_dashboard'],
  ['/intelligent', 'intelligent'],
  ['/data-quality', 'data_quality'],
  ['/observability', 'observability'],
  ['/administration', 'administration'],
];

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: AUTH, viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
const out = {};

async function capture(route, label) {
  const rec = { route, tabs: [], actions: [], links: [], headings: [], inputs: 0, tables: 0, emptyStates: [], numericTokens: 0, textLen: 0 };
  try {
    await p.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await p.waitForTimeout(7000);
    // tabs (role=tab or ?tab= nav)
    rec.tabs = [...new Set(await p.locator('[role="tab"], button[data-tab], nav a[href*="tab="]').allInnerTexts().catch(() => []))].map(s => s.trim()).filter(Boolean).slice(0, 40);
    // buttons (actions)
    const btns = await p.locator('button, [role="button"], a[role="button"]').allInnerTexts().catch(() => []);
    rec.actions = [...new Set(btns.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && s.length < 40))].slice(0, 120);
    // links
    const lks = await p.locator('main a, [role="main"] a').allInnerTexts().catch(() => []);
    rec.links = [...new Set(lks.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && s.length < 40))].slice(0, 60);
    // headings
    rec.headings = [...new Set(await p.locator('h1,h2,h3').allInnerTexts().catch(() => []))].map(s => s.trim()).filter(Boolean).slice(0, 40);
    rec.inputs = await p.locator('input, textarea, select').count().catch(() => 0);
    rec.tables = await p.locator('table, [role="grid"], [role="table"]').count().catch(() => 0);
    const body = (await p.locator('body').innerText().catch(() => '')) || '';
    const low = body.toLowerCase();
    for (const s of ['no data', 'not provisioned', 'coming soon', 'no results', 'nothing to show', 'not available', 'empty', 'get started', 'cache is initializing', 'could not load']) {
      if (low.includes(s)) rec.emptyStates.push(s);
    }
    rec.numericTokens = (body.match(/\b\d[\d,.]*\b/g) || []).length;
    rec.textLen = body.length;
    await p.screenshot({ path: `e2e/.auth/cap_${label}.png`, fullPage: false }).catch(() => {});
  } catch (e) { rec.error = String(e).slice(0, 140); }
  return rec;
}

for (const [route, label] of MODULES) {
  out[label] = await capture(route, label);
  const r = out[label];
  console.log(`${label.padEnd(18)} tabs=${r.tabs.length} actions=${r.actions.length} inputs=${r.inputs} tables=${r.tables} nums=${r.numericTokens} empty=[${r.emptyStates.join('|')}] ${r.error ? 'ERR ' + r.error : ''}`);
}
fs.writeFileSync('e2e/.auth/live_actions_capture.json', JSON.stringify(out, null, 2));
console.log('\nSAVED e2e/.auth/live_actions_capture.json');
await b.close();
