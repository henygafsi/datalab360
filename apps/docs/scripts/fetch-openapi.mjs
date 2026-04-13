/**
 * Fetch the OpenAPI spec from the running backend.
 * Usage: node scripts/fetch-openapi.mjs [url]
 *
 * Default URL: http://localhost:8000/openapi.json
 * Override via: OPENAPI_URL env var or CLI argument.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/schemas/openapi.json");

const url =
  process.argv[2] ||
  process.env.OPENAPI_URL ||
  "http://localhost:8000/openapi.json";

console.log(`Fetching OpenAPI spec from ${url} ...`);

try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const spec = await res.json();

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(spec, null, 2), "utf-8");

  const endpoints = Object.keys(spec.paths || {}).length;
  console.log(`Saved ${endpoints} endpoints to ${outPath}`);
} catch (err) {
  console.warn(`Could not fetch OpenAPI spec: ${err.message}`);
  console.warn("Using existing local schema (if available).");
  process.exit(0); // Don't fail the build
}
