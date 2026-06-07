---
name: page-intelligent-ux-ai-audit-2026-06-07
description: UX and AI audit spec for the Intelligence module page — covers layout, tabs, RBAC-gated actions, Cortex AI touchpoints, right-bar redesign, SSE channels, AI tips feed, event history timeline, and a prioritised gap backlog for the dev team.
---

## Vue

**Route:** `/intelligent-ux-ai-audit-2026-06-07`

The Intelligence page is the central hub for all Cortex AI and ML capabilities within Data360. It is reachable from the left-nav "Intelligence" entry and from the command-center module card. The layout follows the standard three-column Data360 shell:

- **Left navigation rail** — module-level links (same as the rest of the app).
- **Main content area** — full-width tab strip at the top, tab-specific data table or card grid below. Rows are selectable; selecting a row fires the right-bar detail panel.
- **Right bar (280 px)** — context-sensitive panel that shows either module-level KPI strip + Cortex usage summary (nothing selected) or artifact-detail card (row selected). Contains the AI Tips feed, History timeline, and quick-action buttons.

The page header shows the module title "Intelligence", a project-scope breadcrumb, and a primary CTA button whose label changes per active tab (e.g. "New Fine-tune Job", "New Search Service", "Upload Document").

All data is scoped to the active project. A `ProjectContext` provider at layout level supplies `projectId`; every API call passes it as a query param or path segment.

---

## Tabs actuels

*(No tabs are currently implemented — this section records the intended tab structure for the redesign.)*

Planned tabs (in order):

1. **Cortex Chat** — conversational SQL and semantic query interface.
2. **Semantic Views** — list and manage Cortex Analyst semantic view definitions.
3. **Vector Search** — embed columns, browse vector stores, run similarity queries.
4. **Fine-tune Jobs** — create, monitor, and test supervised fine-tune jobs.
5. **Document AI** — upload samples, label fields, train and run document models.
6. **Anomaly & Forecast** — time-series ML for anomaly detection and forecasting.
7. **Streamlit / Notebooks** — gallery of Snowpark Container notebooks and Streamlit apps.
8. **Model Registry** — register, version, compare, and deploy ML models.

Each tab is a standalone route segment under `/intelligence/<tab>` so that deep-links and per-tab routes are preserved (consistent with the per-tab route pattern preferred by this project).

---

## Actions

All actions are gated at both the UI layer (button visibility/disabled state) and the API layer (JWT-scoped).

| Action | RBAC module | RBAC action | Endpoint | Method | InsightActionButton |
|---|---|---|---|---|---|
| Start new fine-tune job | intelligence | finetune:create | `/cortex/ml/finetune` | POST | No (primary wizard CTA) |
| Run post-training test pipeline | intelligence | finetune:test | `/cortex/ml/finetune/jobs/{jobId}/test` | POST | Yes — "Run Test" in right bar |
| Get hyperparameter recommendations | intelligence | finetune:recommend | `/cortex/ml/finetune/recommend` | GET | Yes — "Get Suggestions" in right bar |
| Create Cortex Search Service | intelligence | search:create | `/cortex/search-services` | POST | No (tab wizard CTA) |
| Publish semantic view | intelligence | semantic-view:publish | `/cortex/semantic-views/{name}/publish` | POST | Yes — "Publish" in right bar |
| Get semantic view versions | intelligence | semantic-view:read | `/cortex/semantic-views/{name}/versions` | GET | No (rendered as version list) |
| NL test prompt (semantic view) | intelligence | semantic-view:test | `/cortex/analyst/query` | POST | Yes — "Test Query" inline in right bar |
| Embed column (one-click) | intelligence | vector:embed | `/cortex/vectors/embed` | POST | Yes — "Embed" in right bar |
| Browse vector columns | intelligence | vector:read | `/cortex/vectors/columns` | GET | No (table) |
| Upload Document AI sample | intelligence | document-ai:create | `/cortex/ml/document-ai/models` | POST | No (upload wizard) |
| Run anomaly detection | intelligence | ml:anomaly | `/cortex/ml/anomaly` | POST | No (tab CTA) |
| Run forecast | intelligence | ml:forecast | `/cortex/ml/forecast` | POST | No (tab CTA) |
| Register model | intelligence | registry:create | `/cortex/ml/registry/register` | POST | No (wizard) |
| Deploy registered model | intelligence | registry:deploy | `/cortex/ml/registry/{name}/deploy` | POST | Yes — "Deploy" in right bar |
| Generate SQL (Cortex Chat) | intelligence | chat:query | `/cortex/query/run-sandbox` | POST | No (send button in chat) |
| Use Semantic View toggle (Chat) | intelligence | chat:semantic | `/cortex/analyst/query` | POST | No (toggle inside chat) |
| Check role for sandbox | intelligence | chat:read | `/cortex/role-check` | GET | No (preflight) |
| Create Streamlit app | intelligence | streamlit:create | `/cortex/snowpark/streamlit` | POST | No (gallery CTA) |
| Create notebook | intelligence | notebook:create | `/cortex/notebooks` | POST | No (gallery CTA) |
| List notebooks | intelligence | notebook:read | `/cortex/notebooks` | GET | No (table) |
| Acknowledge recommendation | intelligence | recommendation:ack | `/recommendations/{id}/acknowledge` | POST | Yes — InsightActionButton variant=acknowledge |
| Resolve recommendation | intelligence | recommendation:resolve | `/recommendations/{id}/resolve` | POST | Yes — InsightActionButton variant=resolve |
| Dismiss recommendation | intelligence | recommendation:dismiss | `/recommendations/{id}/dismiss` | POST | Yes — InsightActionButton variant=dismiss |
| Fetch module KPIs | intelligence | kpi:read | `/cortex/kpis` | GET | No (right bar widget) |
| Fetch recommendations | intelligence | recommendation:read | `/recommendations?module=intelligence` | GET | No (right bar feed) |
| Fetch AI events | intelligence | events:read | `/ai-events?module=intelligence&limit=20` | GET | No (history timeline) |

**RBAC enforcement pattern:** wrap each action button in `<RbacGate module="intelligence" action="<action>">`. Buttons render as disabled with a lock icon when the user lacks the permission; they are hidden entirely for roles with no intelligence module access.

---

## Interventions IA

Each AI touchpoint below follows the pattern: **trigger → Snowflake/Cortex call → output → Cortex feature used**.

### 1. Cortex Chat — Generate SQL

- **Trigger:** User types a natural language question in the chat input and presses Send (or Enter).
- **Snowflake call:** `POST /cortex/query/run-sandbox` with `{ prompt, projectId, sessionId }`. Backend calls `SNOWFLAKE.CORTEX.COMPLETE` with the user's NL prompt and the active schema context to produce SQL, then executes the SQL in a read-only sandbox warehouse.
- **Output:** SQL block displayed in the chat thread (syntax-highlighted), followed by a result table (up to 200 rows). A per-query credit cost badge is shown beneath each response.
- **Cortex feature:** Cortex Complete (LLM inference) + read-only warehouse sandbox execution.

### 2. Cortex Chat — Semantic View Query

- **Trigger:** User enables the "Use Semantic View" toggle before sending a prompt. Active semantic view is selected from a dropdown that calls `GET /cortex/semantic-views`.
- **Snowflake call:** `POST /cortex/analyst/query` with `{ prompt, semanticViewName, projectId }`. Backend invokes `SNOWFLAKE.CORTEX.ANALYST` grounded on the chosen semantic layer definition.
- **Output:** Analyst-style answer card with: generated SQL (collapsed), natural-language summary, result table. Grounding citations reference the semantic view columns used.
- **Cortex feature:** Cortex Analyst (semantic grounding).

### 3. Fine-tune Job — Hyperparameter Recommender

- **Trigger:** Right bar is open on a fine-tune job row that is in `DRAFT` or `FAILED` status. User clicks "Get Suggestions".
- **Snowflake call:** `GET /cortex/ml/finetune/recommend?jobId={jobId}`. Backend introspects the training dataset size and previous run metrics, then calls `SNOWFLAKE.CORTEX.COMPLETE` with a structured prompt to produce ranked hyperparameter candidates.
- **Output:** Ordered list of hyperparameter suggestion cards in the right bar. Each card shows `{ learning_rate, epochs, batch_size, estimated_accuracy, estimated_credits }`. One-click "Apply" overwrites the job config and re-stages the draft.
- **Cortex feature:** Cortex Complete (parameter recommendation reasoning).

### 4. Fine-tune Job — Post-training Test Pipeline

- **Trigger:** Job status transitions to `SUCCEEDED`. Right bar shows a "Run Test" InsightActionButton. User clicks it.
- **Snowflake call:** `POST /cortex/ml/finetune/jobs/{jobId}/test` with `{ testDatasetRef }`. Backend runs inference against a held-out test split using the newly fine-tuned model.
- **Output:** Test results panel in the right bar: accuracy, F1, precision, recall, confusion-matrix heatmap (small). Compare against baseline model metrics.
- **Cortex feature:** Cortex Fine-tune (custom model inference on test split).

### 5. Semantic View — NL Tester

- **Trigger:** A semantic view row is selected in the table. Right bar displays an inline NL test prompt text area. User types a test question and submits.
- **Snowflake call:** `POST /cortex/analyst/query` with `{ prompt, semanticViewName }`.
- **Output:** Analyst response rendered inline in the right bar: generated SQL snippet + a compact result preview (up to 5 rows). If Analyst returns an error, the error message is shown with a "Edit Semantic View" link.
- **Cortex feature:** Cortex Analyst.

### 6. Vector Search — Embed Column

- **Trigger:** A vector column row is selected. Right bar shows "Embed" InsightActionButton. User clicks it to launch the one-click embed flow (confirm modal: column reference, embedding model, dimension count).
- **Snowflake call:** `POST /cortex/vectors/embed` with `{ columnRef, model, dimensions }`. Backend calls `SNOWFLAKE.CORTEX.EMBED_TEXT_*` function family via a Snowflake task.
- **Output:** SSE stream on `cortex:embed:{columnRef}:status` showing progress (rows embedded / total). On completion, the column's status badge flips to `EMBEDDED` and the right bar shows embedding stats (rows, dimensions, model used, credit cost).
- **Cortex feature:** Cortex Embed (vector embedding generation).

### 7. Vector Search — Cosine Similarity Example Query

- **Trigger:** Vector column row is selected and status is `EMBEDDED`. Right bar automatically renders a pre-filled cosine similarity query snippet.
- **Snowflake call:** None at render time. The snippet calls `VECTOR_COSINE_SIMILARITY` directly against the column when the user copies and runs it in a SQL editor.
- **Output:** Read-only code block with the example SQL, plus a "Copy" button and an "Open in Chat" button (pre-populates Cortex Chat with the query as context).
- **Cortex feature:** Cortex Vector Search (cosine similarity).

### 8. Document AI — Field Labelling and Model Training

- **Trigger:** User uploads sample documents and labels extraction fields in the Document AI wizard. After labelling, clicks "Train Model".
- **Snowflake call:** `POST /cortex/ml/document-ai/models` with `{ modelName, sampleDocumentRefs, fieldLabels }`. Backend creates a Document AI model in Snowflake ML.
- **Output:** SSE stream on `cortex:document-ai:{modelName}:status` showing training progress. On completion, right bar shows field-level accuracy scores.
- **Cortex feature:** Cortex Document AI (supervised extraction model training).

### 9. Anomaly Detection

- **Trigger:** User selects a time-series column and clicks "Run Anomaly Detection" in the Anomaly & Forecast tab.
- **Snowflake call:** `POST /cortex/ml/anomaly` with `{ tableRef, timestampColumn, targetColumn, projectId }`. Backend calls `SNOWFLAKE.ML.ANOMALY_DETECTION`.
- **Output:** Chart overlay on the time-series showing flagged anomaly points, plus a table of anomaly events with `{ timestamp, actual, expected, anomaly_score }`.
- **Cortex feature:** Cortex ML — Anomaly Detection.

### 10. Forecast

- **Trigger:** User selects a time-series column and clicks "Run Forecast" in the Anomaly & Forecast tab.
- **Snowflake call:** `POST /cortex/ml/forecast` with `{ tableRef, timestampColumn, targetColumn, horizon, projectId }`.
- **Output:** Extended time-series chart showing historical actuals plus forecast ribbon (mean + confidence interval). Downloadable as CSV.
- **Cortex feature:** Cortex ML — Forecast.

### 11. AI Events Write-through

- **Trigger:** Any of the above Cortex actions completes (success or failure).
- **Snowflake call:** `POST /ai-events` with `{ eventType, module: "intelligence", actor, projectId, creditCost, metadata }`.
- **Output:** Event persisted to the AI events log. Visible in the History timeline in the right bar.
- **Cortex feature:** N/A (audit write-through, not a Cortex inference call).

### 12. Module-level Recommendations Feed

- **Trigger:** Page load (or right bar opened with nothing selected). Calls `GET /recommendations?module=intelligence`.
- **Snowflake call:** Backend may invoke Cortex Complete to generate recommendation text from anomaly signals, cost overruns, or stale semantic views.
- **Output:** Scrollable card list in the right bar AI Tips section. Each card: severity chip (critical/warning/info), title, estimated savings, three InsightActionButtons (Acknowledge / Resolve / Dismiss).
- **Cortex feature:** Cortex Complete (recommendation generation, backend-side).

---

## Redesign Right-Bar

### When a row is selected

Display an artifact-detail card contextualised to the artifact type:

- **Artifact type badge** — colour-coded pill: `SEMANTIC VIEW`, `FINE-TUNE JOB`, `VECTOR COLUMN`, `DOCUMENT AI MODEL`, `SEARCH SERVICE`, `NOTEBOOK`, `STREAMLIT`, `ML MODEL`.
- **Name** — artifact identifier, copyable.
- **Status** — live badge driven by SSE (see Status SSE section); fallback to polled value on SSE disconnect.
- **Last modified date** — `YYYY-MM-DD HH:mm UTC` format.
- **Owner** — Snowflake role or user that created/last modified the artifact.
- **Database / schema path** — `<database>.<schema>` breadcrumb, each segment copyable.

Type-specific additional fields (only shown when the selected row matches the type):

| Artifact type | Extra fields |
|---|---|
| Semantic View | Table count (number of base tables joined), column count, last publish date |
| Vector Column | Dimensions, embedding model name, row count, embedding status |
| Fine-tune Job | Base model, epochs configured, training loss (last epoch), accuracy, F1 |
| Classification Model | Accuracy, F1, precision, recall, training dataset size |
| Container Service | Compute pool name, instance family, replica count, CPU/memory utilisation |
| Document AI Model | Field count, field-level accuracy table (field name → accuracy %) |
| Search Service | Source table, refresh schedule, last indexed at, index row count |
| Streamlit / Notebook | Runtime version, warehouse, last run at, last run duration |

Below the detail fields, render the context-appropriate quick-action InsightActionButtons (Publish, Embed, Run Test, Get Suggestions, Deploy, etc. — see Actions table above, filtered to the selected artifact type).

For fine-tune jobs in `SUCCEEDED` status, additionally render the hyperparameter suggestions card list (from `GET /cortex/ml/finetune/recommend`).

For semantic views, additionally render the NL test prompt text area with a "Test Query" submit button.

For vector columns with `EMBEDDED` status, additionally render the cosine similarity example query code block.

### When nothing is selected

Display two collapsed sections:

**Module KPI Strip** — compact metric tiles (2×2 grid):

| Metric | Source |
|---|---|
| Models active | `GET /cortex/kpis` → `models_active` |
| Queries today | `GET /cortex/kpis` → `queries_today` |
| Avg response (ms) | `GET /cortex/kpis` → `avg_response_ms` |
| Accuracy rate | `GET /cortex/kpis` → `accuracy_rate` |

**Cortex Usage Summary** — collapsed to 3 stat lines (not a full-width banner):

```
Credits used   [value]   [sparkline 7d]
Tokens         [value]
API calls      [value]   this period
```

Period selector (today / 7d / 30d) controls all three stat lines. Source: `GET /cortex/kpis` response fields `credits_used`, `tokens_consumed`, `api_calls`, `period`.

**AI Tips Feed** — below the two stat sections, render the recommendations card list from `GET /recommendations?module=intelligence` (see Interventions IA §12). Scrollable, max-height 50% of right-bar viewport. Each card shows: severity chip, title, estimated savings label, and three InsightActionButtons (Acknowledge / Resolve / Dismiss). Empty state: "No recommendations — all clear."

**History Timeline** — collapsible section at the bottom of the right bar. Source: `GET /ai-events?module=intelligence&limit=20`. Renders as a vertical timeline of the 20 most recent AI events, newest first. Each event row shows:

- Event type chip (CORTEX_PROMPT_SUBMITTED, SEARCH_SERVICE_CREATED, MODEL_FINETUNED, DOCUMENT_AI_RUN, SEMANTIC_VIEW_PUBLISHED, ANOMALY_DETECTED).
- Actor (user or service role).
- Relative timestamp (e.g. "3 min ago") with absolute tooltip.
- Credit cost per event (formatted as `$0.0042` or `— ` if zero).

"Load more" link fetches the next 20 with `?offset=20`.

---

## Henry Tasks

Prioritised gap backlog for the development team. P1 = must-have before GA; P2 = high value, target next sprint; P3 = nice-to-have, schedule after P2s.

### P1 — Must-have

**P1-1: Cortex Search Service wizard**
- **What:** Full creation wizard for Cortex Search Services from the Search Service tab. Covers: source table selection, column picker, refresh schedule, warehouse selection, confirm + create.
- **Endpoint:** `POST /cortex/search-services`
- **SSE channel:** `cortex:search-service:{serviceName}:status`
- **Acceptance:** Wizard opens from tab CTA, creates the service, right bar reflects live `BUILDING` → `READY` status transition via SSE. Error state surfaces Snowflake error message in an inline callout.

**P1-2: Document AI — sample upload + field labelling**
- **What:** Multi-step wizard: (1) Upload PDF/image samples (multi-file drag-drop), (2) visual field labeller (draw bounding boxes, assign field names + types), (3) train model.
- **Endpoint:** `POST /cortex/ml/document-ai/models`
- **SSE channel:** `cortex:document-ai:{modelName}:status`
- **Acceptance:** Wizard completes end-to-end; SSE drives training progress bar; right bar shows field-level accuracy on completion.

**P1-3: Fine-tune hyperparameter recommender + post-training test pipeline**
- **What:** Two linked features. (a) "Get Suggestions" button in right bar when a draft or failed fine-tune job is selected, calling the recommend endpoint and displaying ranked hyperparameter cards. (b) "Run Test" button after a job succeeds, calling the test endpoint and displaying accuracy/F1/confusion matrix.
- **Endpoints:** `GET /cortex/ml/finetune/recommend`, `POST /cortex/ml/finetune/jobs/{jobId}/test`
- **Acceptance:** Suggestions cards rendered and "Apply" correctly patches the job config. Test results panel renders with all four metrics + heatmap.

**P1-4: Anomaly Detection + Forecast tab**
- **What:** New "Anomaly & Forecast" tab with: column selector, run buttons, chart rendering (Recharts or similar), results table, and export to CSV.
- **Endpoints:** `POST /cortex/ml/anomaly`, `POST /cortex/ml/forecast`, `GET /cortex/ml/anomaly`, `GET /cortex/ml/forecast`
- **Acceptance:** Full round-trip: select column → run → SSE progress → chart rendered. Both anomaly flag overlays and forecast ribbon work. Empty state for no results.

---

### P2 — High value

**P2-1: Streamlit / Notebooks gallery tab**
- **What:** Card gallery showing all Snowpark Container notebooks and Streamlit apps for the active project. Cards show: name, runtime, last run, status badge. CTA buttons to create new app or notebook.
- **Endpoints:** `GET /cortex/notebooks`, `POST /cortex/notebooks`, `POST /cortex/snowpark/streamlit`
- **Acceptance:** Gallery loads; create flows complete; right bar shows notebook detail fields.

**P2-2: Model Registry — register / version / deploy workflow**
- **What:** Model Registry tab. Table of registered models with version history. Register button launches a wizard (model name, type, artifact URI, tags). Per-row Deploy button in right bar.
- **Endpoints:** `POST /cortex/ml/registry/register`, `POST /cortex/ml/registry/{name}/deploy`, `GET /cortex/ml/registry/{name}/versions`
- **Acceptance:** Registration and deploy flows complete; version list renders in right bar; accuracy/F1 from registry metadata shown in detail card.

**P2-3: Cortex Chat — Generate SQL + run in read-only sandbox**
- **What:** Chat interface (thread layout) with a text input, message history, SQL block rendering, and result table component. Role check preflight hides sandbox execution for roles that lack it.
- **Endpoints:** `POST /cortex/query/run-sandbox`, `GET /cortex/role-check`
- **Acceptance:** Full chat thread round-trip; credit cost badge per response; role-check hides "Run" when role is insufficient.

**P2-4: Cortex Chat — Use Semantic View toggle**
- **What:** Toggle in Cortex Chat to switch from raw SQL generation to Cortex Analyst grounded on a chosen semantic view. Semantic view dropdown populates from `GET /cortex/semantic-views`.
- **Endpoints:** `POST /cortex/analyst/query`, `GET /cortex/semantic-views`
- **Acceptance:** Toggle switches endpoint; analyst-style answer card renders with grounding citations; fallback to SQL mode if no semantic views exist.

**P2-5: Semantic Views — Publish popup + NL tester + version diff**
- **What:** Right bar enhancements for semantic view rows: (a) "Publish" button opening a confirm modal, (b) NL test prompt inline in right bar, (c) version diff panel showing column/relation changes between two selected versions.
- **Endpoints:** `POST /cortex/semantic-views/{name}/publish`, `GET /cortex/semantic-views/{name}/versions`, `POST /cortex/analyst/query`
- **Acceptance:** Publish updates status badge; NL tester returns analyst response inline; version diff shows added/removed/changed columns.

**P2-6: Vector Search — Embed column popup + one-click flow**
- **What:** Right bar "Embed" InsightActionButton opens a modal: column reference (pre-filled), embedding model selector, dimension count. Confirm triggers embed flow with SSE progress.
- **Endpoints:** `POST /cortex/vectors/embed`, `GET /cortex/vectors/columns`
- **Acceptance:** Full embed flow with SSE; status badge transitions `PENDING` → `EMBEDDING` → `EMBEDDED`; cosine similarity snippet appears after completion.

---

### P3 — Nice-to-have

**P3-1: AI_EVENTS write-through throughout the Intelligence module**
- **What:** Every Cortex action completion (success or failure) writes to `POST /ai-events` with `{ eventType, module: "intelligence", actor, projectId, creditCost, metadata }`. This feeds the History timeline and the global AI audit log.
- **Endpoint:** `POST /ai-events`
- **Acceptance:** History timeline in the right bar reflects all P1 and P2 Cortex actions with correct event type chips and credit costs.

**P3-2: Per-conversation credit ticker + Cortex usage right bar widget**
- **What:** (a) A running credit ticker in the Cortex Chat thread footer that sums credit costs for the current session. (b) A Cortex usage widget in the right bar (when nothing is selected) showing credits, tokens, and calls for the selected period.
- **Endpoint:** `GET /cortex/kpis`
- **Acceptance:** Ticker increments in real time after each chat response. Right bar usage widget updates on period change (today / 7d / 30d).

---

## Snowflake Features

The following Snowflake Cortex and Snowpark Container Services features are used or targeted by this module. Vendor names are allowed in architecture and admin views; customer-facing copy should use neutral terms (per brand rules).

| Snowflake feature | Used in | Status |
|---|---|---|
| SNOWFLAKE.CORTEX.COMPLETE | Cortex Chat (SQL gen), Hyperparameter Recommender, Recommendation generation | Backend-implemented; FE wizard gaps |
| SNOWFLAKE.CORTEX.ANALYST | Semantic View NL query, Chat semantic-view toggle | Backend-implemented; FE partial |
| SNOWFLAKE.CORTEX.EMBED_TEXT_* | Vector column embedding | Backend-implemented; FE one-click flow missing (P2-6) |
| SNOWFLAKE.CORTEX.FINETUNE | Fine-tune job creation and test | Backend-implemented; FE recommender + test missing (P1-3) |
| SNOWFLAKE.ML.ANOMALY_DETECTION | Anomaly detection | Backend-implemented; FE tab missing (P1-4) |
| SNOWFLAKE.ML.FORECAST | Forecast | Backend-implemented; FE tab missing (P1-4) |
| SNOWFLAKE.CORTEX.SEARCH | Cortex Search Service | Backend-implemented; FE wizard missing (P1-1) |
| SNOWFLAKE.ML.DOCUMENT_AI | Document AI model training and inference | Backend-implemented; FE wizard missing (P1-2) |
| SNOWFLAKE.ML.CLASSIFICATION | Classification model (part of Model Registry) | Backend-implemented; FE registry missing (P2-2) |
| Snowpark Container Services | Streamlit apps, Notebooks, Container Services | Backend-implemented; FE gallery missing (P2-1) |
| VECTOR_COSINE_SIMILARITY | Cosine similarity example query snippet | Client-side snippet generation; no backend call required |
| ML Model Registry | Model register / version / deploy | Backend-implemented; FE missing (P2-2) |
