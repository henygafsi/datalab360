// Render every mockup HTML to a same-named PNG (1440x900 viewport, fullPage).
// Run from repo root: node docs/product-readiness-audit/mockups/_render.mjs
import { chromium } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.html')).sort();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const f of files) {
  await page.goto('file://' + path.join(dir, f));
  // Un-clip the 100vh app shell so fullPage captures scrollable right-bar content.
  await page.addStyleTag({ content: `
    .app{height:auto !important;min-height:100vh}
    .main{overflow:visible !important}
    .workspace{min-height:620px}
    .panel .pbody{overflow:visible !important}
    .tlist,.cards,.detail{overflow:visible !important}
    .caption{position:static !important}
  `});
  await page.waitForTimeout(150);
  const out = path.join(dir, f.replace(/\.html$/, '.png'));
  await page.screenshot({ path: out, fullPage: true });
  console.log('rendered', path.basename(out));
}
await browser.close();
console.log('done:', files.length, 'files');
