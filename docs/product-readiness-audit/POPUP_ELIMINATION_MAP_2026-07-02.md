# Popup-Elimination Map (2026-07-02)

Rule: zero data in popups — understand/validate/act in a docked right-bar (reference: explore-design ContextRightBar + shared RightTabPanel). Classes: A data-display popup (move to bar axis) · B form/wizard (dock or AI-builds-object inline) · C confirm (keep) · D already docked.

## Headlines
- **BiSmartRightBar is defined but mounted NOWHERE** — the BI editor still runs on portal drawers (AutoCreateModal, AiDashboardWizard, DashboardTemplates, AddChartPanel, ChartPaletteRail portal, DrillThroughPanel[data-A], ConfigShell modal-variant).
- **Only workflow auto-opens with a purposeful default view.** data-quality/sources/data-products/governance-inspectors/access-center/observability/intelligent bars are selection-gated (`return null` until a row is picked) — platform-wide "default overview section" pass needed.
- Pure data-A popups to relocate: workflow RunCompareDrawer + TaskLogsDrawer + NodeBigPicturePopover · bi DrillThroughPanel · org-accounts account-detail-modal (account-360) · command-center ApprovalDetailModal · datalake file preview.
- Popup-clean already: mapping, project, data-quality, sources, data-products, intelligent, observability (create-forms already docked), admin.

## Ranked conversion order
1. bi-dashboard (L): mount BiSmartRightBar, retire the 6 portal/modal flows, flip ConfigShell to panel.
2. workflow (M): fold 3 data drawers into WorkflowSmartPanel; AI wizard → AI-builds-canvas (in flight).
3. client-accounts/org-accounts (M): docked account context bar; account-detail-modal → details/cost axis; AccountCreationWizard → inline build.
4. data-source-connection (M): dock DatalakeBrowser preview/upload; ConnectorAiHelper → inline AI provisioning.
5. account-overview (M): ApprovalDetailModal → docked ActionsPanel details.
6. governance shared create-forms (M): add-role/add-user/AssignPolicy modals → docked panels.
7. administration CostGovernancePanel cap-form + AccessControlCenter dialog; deploy-app wizard (M).
8. Cross-cutting auto-open pass (S each): default overview sections for data-quality, sources, data-products, governance inspectors, access-center.

## Top "AI builds the UI object directly" targets
workflow pipeline graph (in flight) · BI auto-create drops charts on grid · connector AI provisions inline · account creation inline · DQ rule authored on the column.
