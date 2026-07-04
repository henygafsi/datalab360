# Administration → ONE-PAGE refactor + platform anti-empty-shell standard (2026-07-03)

Directive: one scrollable Administration view (no tab-hopping), kill the empty-shell/redirect-only tab pattern **everywhere**; embed the tested-access matrix; role switch in user info.

## 1 · IA: 10 tabs → 6 inline sections (one scroll, anchor rail)

| Old tab (`?tab=`) | Fate | New section |
|---|---|---|
| health (Platform Health) | inline | **§1 Platform Health & APIs** |
| serverMetrics | merge into §1 | §1 (server metrics grid) |
| apiHealth (redirect → /admin/api-health) | inline summary + deep-link | §1 (API op-rate strip) |
| performance (redirect → /admin/performance) | inline KPI strip + deep-link | §1 |
| access (Access Control) | inline | **§2 Access & Roles** |
| — (new) | new | §2 **Tested Access matrix** (role × page × feature) |
| featureGov (Entitlements, redirect-ish) | merge | **§3 Features & Entitlements** (single matrix) |
| features (Feature Registry, 79 features) | merge into §3 | §3 (registry rows = matrix rows) |
| costGov | inline | **§4 Cost Governance** |
| projects | inline | **§5 Projects** |
| config | inline | **§6 Config & Settings** |

Navigation: sticky left **anchor rail** (scroll-spy, `#health #access #features #cost #projects #config`) — anchors, not routes; `?tab=` values 301-map to anchors for old links. Every section collapsible; header shows count/status even when collapsed (never