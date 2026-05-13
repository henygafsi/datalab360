#!/usr/bin/env node
// Scan for Link href="/x" that have no matching app/(...)/x/page.tsx
// Goal: surface the "DATA LAB 404 page" class of bug from the Part 1 audit.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'apps/data360/src/app';
const SCAN_DIR = 'apps/data360/src';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function collectRoutes() {
  // Every page.tsx maps to a Next.js route — strip route groups like (dashboard).
  const pages = [];
  if (!existsSync(ROOT)) return pages;
  const walk2 = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk2(p);
      else if (name === 'page.tsx' || name === 'page.ts' || name === 'page.jsx') {
        const rel = relative(ROOT, p).replace(/\/page\.[^.]+$/, '');
        const route = '/' + rel
          .split('/')
          .filter((seg) => !seg.startsWith('(') && seg !== '')
          .join('/');
        pages.push(route === '/' ? '/' : route.replace(/\/+/g, '/'));
      }
    }
  };
  walk2(ROOT);
  return new Set(pages);
}

const known = collectRoutes();
const files = existsSync(SCAN_DIR) ? walk(SCAN_DIR) : [];
const offenders = [];
const HREF = /(?:href|to)\s*[:=]\s*[`'"](\/[a-zA-Z0-9_\-/[\]:]*)[`'"]/g;
const skip = new Set(['/', '/signin', '/signup', '/api', '/_next']);

for (const f of files) {
  let txt;
  try { txt = readFileSync(f, 'utf8'); } catch { continue; }
  let m;
  while ((m = HREF.exec(txt)) !== null) {
    let href = m[1];
    if (href.startsWith('/api')) continue;
    if (href.startsWith('/_next')) continue;
    if (href.includes('[')) continue;
    href = href.replace(/\?.*$/, '').replace(/#.*$/, '');
    if (skip.has(href)) continue;
    // Match against known routes; allow nested children (e.g. /a/b matches /a/b/c page).
    const ok = [...known].some((r) => r === href || href.startsWith(r + '/'));
    if (!ok) offenders.push({ href, file: f });
  }
}

if (offenders.length === 0) {
  console.log('OK no dead routes detected');
  process.exit(0);
}

const grouped = offenders.reduce((acc, o) => {
  (acc[o.href] ||= []).push(o.file);
  return acc;
}, {});
console.log(`Found ${Object.keys(grouped).length} dead route(s) referenced from code:`);
for (const [href, fs] of Object.entries(grouped)) {
  console.log(`  ${href}  (referenced from ${fs.length} file${fs.length > 1 ? 's' : ''})`);
  for (const f of fs.slice(0, 3)) console.log(`    - ${f}`);
}
process.exit(0);
