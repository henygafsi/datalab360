#!/usr/bin/env node
// Walk .next/ and report the largest chunks. Helps catch accidental bundle bloat.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2] || '.next';
const out = [];

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p);
    else if (/\.(js|css|map)$/.test(e)) out.push({ path: p, size: s.size });
  }
}
walk(target);

out.sort((a, b) => b.size - a.size);
const total = out.reduce((sum, x) => sum + x.size, 0);
const fmt = (n) => (n / 1024).toFixed(1) + ' kB';

console.log(`Bundle report — ${target}`);
console.log(`Total: ${fmt(total)} across ${out.length} files`);
console.log('');
console.log('Top 30 largest files:');
for (const x of out.slice(0, 30)) {
  console.log(`  ${fmt(x.size).padStart(10)}  ${x.path}`);
}

// Warn on common bloat: any single JS chunk > 500 kB.
const heavy = out.filter((x) => x.path.endsWith('.js') && x.size > 500 * 1024);
if (heavy.length) {
  console.log('');
  console.log(`Warning: ${heavy.length} JS chunk(s) over 500 kB:`);
  for (const x of heavy) console.log(`  ${fmt(x.size)}  ${x.path}`);
}
