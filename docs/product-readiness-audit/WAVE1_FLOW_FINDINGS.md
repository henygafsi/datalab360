# Wave 1 — flow-proof findings (local, HAHA/ACCOUNTADMIN, 2026-06-29)

4/5 flows completed (model-deploy flow failed: orchestrator prompt too long — re-run leaner). Screenshots under `docs/product-readiness-audit/screens/`.

## Data Products — module is polished; real defects are mostly backend data-readiness + 2 FE UX fixes
**Working (verified, screenshotted):** 6 KPI tiles (Data Products=3, Certified=0, Avg Quality=80%, Consumers=0, Domains=2, Trust Score="—" correct fallback, no fake 0); 3 product cards (status/quality/SLA/consumers/tags + Details/Explore/Subscribe); inline Create form (no modal) with empty-submit validation + cancel; 380px right detail panel (2×2 metrics, details, tags); Object360 tab; View-in-Explore deep-link; PublishGate published badge + skeleton + retry; lifecycle/KPI/recommendations/activity panels with correct empty states; cross-module footer; Subscribe correctly enabled for ACCOUNTADMIN; **no 5xx**; SSE invalidation wired consistently.

**Defects:**
1. **[FE-UX] PublishGate.tsx:176-181** — error leaks raw internal id: "CatalogObject TABLE:CP_DATA360.RETAIL_DW.FACT_TRANSACTIONS not found". Humanize → "Backing table not registered in catalog — run a catalog scan first."
2. **[FE-UX] PublishGate.tsx:89** — already-published products still fetch Object360/360 scores → red error box inside the "Published" gate. Skip the score fetch (or show "scores met at publish time") when `published === true`.
3. **[FE minor] ProductCard subscribe gating** — fallback `is_published ?? STATUS==='PUBLISHED'` is case-fragile; align with `normalizeProductStatus` helper already in the file.
4. **[BACKEND data-readiness] catalog 404** — `/catalog/objects/TABLE:CP_DATA360.RETAIL_DW.FACT_TRANSACTIONS/360` + `.../PRODUCT_TXNS_VW/360` 404 → Object360 + PublishGate scores fail; backing tables not indexed. Needs a catalog scan (backend).
5. **[BACKEND] Trust Score KPI "—"** — catalog scoring not computed for this instance.

## Approval-cost, Governance, BI-KPI flows
Completed (full detail in the run transcript). To fold into the final report after the overnight workflow finishes.

## To re-run
- **model-deploy** flow (explore-design RETAIL_DW build + all Deploy right-tab features) — re-run with a shorter prompt.
