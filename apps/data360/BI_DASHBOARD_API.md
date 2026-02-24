# BI Dashboard API — Frontend Integration Guide

## Overview

Power BI-style dashboard designer. The backend **stores the dashboard design** (pages, widgets, filters, layout) AND **serves chart data** via unified endpoints. The frontend **renders** the design and fetches data per widget.

**Base path:** `/api/v1/bi-dashboard`

> **Breaking change:** The `business_reporting` module (`/bi_reporting/*`) has been removed. All endpoints are now under `/api/v1/bi-dashboard`.

---

## Migration from `business_reporting`

| Old Endpoint | New Endpoint |
|---|---|
| `POST /bi_reporting/charts/data` | `POST /api/v1/bi-dashboard/charts/data` |
| `GET /bi_reporting/retail-kpis` | `GET /api/v1/bi-dashboard/retail-kpis` |

Request/response bodies are **identical** — only the URL changed.

---

## Endpoints

### Dashboard Project

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/bi-dashboard` | Create dashboard (returns `project_id` + default `page_id`) |
| GET | `/api/v1/bi-dashboard/{project_id}` | Get full design (pages + widgets + filters) |
| PUT | `/api/v1/bi-dashboard/{project_id}` | Update metadata |
| DELETE | `/api/v1/bi-dashboard/{project_id}` | Delete dashboard |

### Pages

| Method | Path | Description |
|--------|------|-------------|
| POST | `/{project_id}/pages` | Add page |
| GET | `/{project_id}/pages` | List pages |
| PUT | `/{project_id}/pages/{page_id}` | Update page |
| DELETE | `/{project_id}/pages/{page_id}` | Delete page + its widgets/filters |

### Widgets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/{project_id}/widgets` | Add widget to page |
| GET | `/{project_id}/widgets?page_id=` | List widgets (filter by page optional) |
| PUT | `/{project_id}/widgets/{widget_id}` | Update widget |
| DELETE | `/{project_id}/widgets/{widget_id}` | Delete widget |

### Filters

| Method | Path | Description |
|--------|------|-------------|
| POST | `/{project_id}/filters` | Add filter (global or page) |
| GET | `/{project_id}/filters?page_id=` | List filters |
| DELETE | `/{project_id}/filters/{filter_id}` | Delete filter |

### Versioning

| Method | Path | Description |
|--------|------|-------------|
| POST | `/{project_id}/snapshot` | Save current design as immutable version |

### Chart Data & KPIs

| Method | Path | Cache | Description |
|--------|------|-------|-------------|
| POST | `/api/v1/bi-dashboard/charts/data` | 15 min | Execute chart SQL from `ChartConfig` body |
| GET | `/api/v1/bi-dashboard/retail-kpis` | 5 min | Retail KPIs (ROI, margin, revenue by subsidiary, cross-sell) |

**Retail KPIs query params:**
- `database` — DWH database (default: `RETAIL_DW`)
- `schema` — DWH schema (default: `DWH`)
- `days` — Period in days (default: 365, range: 1–730)

---

## Widget Types

| widget_type | chart_type | chart_config | text_content | Description |
|-------------|------------|--------------|--------------|-------------|
| `chart` | `bar`, `line`, `pie`, `donut`, `area`, `scatter`, `heatmap`, `funnel`, `gauge`, `treemap` | required | — | Data visualization |
| `kpi_card` | — | required (measures only, no x) | — | Single KPI number with seuils |
| `table` | — | required | — | Tabular data display |
| `text` | — | — | required | Static text / markdown / title |

---

## Request Bodies

### Create Dashboard
```json
{
  "project_name": "Sales Dashboard",
  "description": "Monthly KPIs",
  "default_database": "RETAIL_DW",
  "default_schema": "DWH",
  "tags": ["retail", "kpi"]
}
```

### Add Widget
```json
{
  "page_id": "page-001",
  "widget_type": "chart",
  "chart_type": "bar",
  "title": "Revenue by Region",
  "chart_config": {
    "database": "RETAIL_DW",
    "schema": "DWH",
    "table": "FACT_SALES",
    "x": "REGION",
    "measures": [{ "column": "REVENUE", "aggregator": "SUM" }],
    "filters": [],
    "groupBy": [],
    "limit": null
  },
  "position_x": 0,
  "position_y": 0,
  "width": 12,
  "height": 4,
  "style": { "color_scheme": "blue", "show_legend": true }
}
```

### Add KPI Card Widget
```json
{
  "page_id": "page-001",
  "widget_type": "kpi_card",
  "title": "Total Revenue",
  "chart_config": {
    "database": "RETAIL_DW",
    "schema": "DWH",
    "table": "FACT_SALES",
    "measures": [{ "column": "REVENUE", "aggregator": "SUM", "seuils": [
      { "operator": "<", "value": 100000, "label": "Bad" },
      { "operator": ">=", "value": 100000, "label": "Good" }
    ]}]
  },
  "position_x": 0,
  "position_y": 0,
  "width": 4,
  "height": 2
}
```

### Add Text Widget
```json
{
  "page_id": "page-001",
  "widget_type": "text",
  "title": "Section Header",
  "text_content": "## Monthly Performance\nUpdated daily.",
  "position_x": 0,
  "position_y": 0,
  "width": 24,
  "height": 1
}
```

### Chart Data (POST /charts/data)
```json
{
  "database": "RETAIL_DW",
  "schema": "DWH",
  "table": "FACT_SALES",
  "x": "REGION",
  "measures": [
    { "column": "REVENUE", "aggregator": "SUM", "seuils": [] }
  ],
  "filters": [
    { "column": "YEAR", "operator": "=", "value": 2025 }
  ],
  "groupBy": [],
  "limit": 100,
  "topN": { "column": "REVENUE", "order": "DESC", "limit": 10 }
}
```

**Response:**
```json
{
  "config": { ... },
  "query": "SELECT ... FROM ...",
  "data": [
    { "REGION": "North", "REVENUE": 150000, "REVENUE_status": "Good" }
  ]
}
```

---

## Frontend Rendering Flow

```
1. GET /api/v1/bi-dashboard/{project_id}
   → Returns: { pages: [{ widgets: [...], filters: [...] }], global_filters: [...] }

2. For each widget where widget_type in (chart, kpi_card, table):
   POST /api/v1/bi-dashboard/charts/data
   Body: widget.chart_config
   → Returns: { data: [...], query: "..." }

3. Render widget based on:
   - widget_type → component type (BarChart, KPICard, DataTable, Markdown)
   - chart_type → chart variant (bar, line, pie...)
   - position_x/y + width/height → grid placement
   - style → colors, fonts, borders
   - text_content → for text widgets only
```

---

## Grid Layout

24-column grid (like Bootstrap/Ant Design):
- `position_x` / `position_y` — grid coordinates (0-based)
- `width` — columns (1–24, default 6)
- `height` — rows (1–24, default 4)

```
┌──────────────────────────────┐  24 cols
│ [KPI Card w=4] [KPI] [KPI]  │  row 0, h=2
│                              │
│ [Bar Chart ─────── w=12]     │  row 2, h=4
│                              │
│ [Pie w=6] [Table ──── w=6]  │  row 6, h=4
└──────────────────────────────┘
```

---

## Example Flow

```
1. POST /api/v1/bi-dashboard
   → { project_id: "abc", default_page_id: "page-001" }

2. POST /api/v1/bi-dashboard/abc/widgets
   Body: { page_id: "page-001", widget_type: "kpi_card", title: "Revenue", chart_config: {...}, width: 4, height: 2 }

3. POST /api/v1/bi-dashboard/abc/widgets
   Body: { page_id: "page-001", widget_type: "chart", chart_type: "bar", title: "By Region", chart_config: {...}, position_y: 2, width: 12 }

4. POST /api/v1/bi-dashboard/abc/widgets
   Body: { page_id: "page-001", widget_type: "text", text_content: "# Notes", position_y: 6, width: 24, height: 1 }

5. GET /api/v1/bi-dashboard/abc
   → Full design with all pages/widgets/filters

6. Frontend: for each data widget → POST /api/v1/bi-dashboard/charts/data with widget.chart_config

7. POST /api/v1/bi-dashboard/abc/snapshot
   → Saves design as version v-002
```

---

## Files Changed (for backend devs)

| Action | File |
|--------|------|
| **Deleted** | `app/modules/business_reporting/` (models, services, router) |
| **Updated** | `app/modules/projects/bi_dashboard/models.py` — now contains ChartConfig, SeuilConfig, MeasureConfig, FilterConfig, TopNConfig |
| **Updated** | `app/modules/projects/bi_dashboard/services.py` — now contains build_and_execute_chart, evaluate_seuils, get_schema_map, validate_db_schema_table_columns |
| **Updated** | `app/modules/projects/bi_dashboard/router.py` — now contains POST /charts/data + GET /retail-kpis |
| **Updated** | `app/main.py` — removed reporting_router |
| **Updated** | `app/modules/route_config.py` — removed bi_reporting entry |
