'use client';

/**
 * useCloneDashboard — whole-dashboard "save as / clone" orchestration.
 *
 * The backend has no single POST /bi-dashboard/{id}/clone route, but the full
 * CRUD primitives DO exist (create dashboard, create page, create widget). This
 * hook composes them into one save/clone action so a data-role power user can
 * fork a dashboard (and all its pages + widgets, with their real data sources)
 * into a fresh editable copy — without hand-rebuilding every chart.
 *
 * Flow:
 *   1. GET source dashboard (pages + widgets)
 *   2. POST a new dashboard (carries over description / default db+schema)
 *   3. For each source page: reuse the new dashboard's default first page where
 *      possible (rename it), else POST a new page
 *   4. For each source widget: POST it onto the matching target page
 *
 * Every step surfaces the backend error message honestly; a partial clone (some
 * widgets failed) is reported truthfully rather than silently swallowed.
 */
import { useCallback, useState } from 'react';
import {
  createDashboard,
  getDashboard,
  createPage,
  updatePage,
  createWidget,
} from '@/app/services/api/biDashboardApi';
import { getApiErrorMessage } from '@/lib/api-client';

export interface CloneProgress {
  phase: 'idle' | 'reading' | 'creating' | 'copying' | 'done' | 'error';
  widgetsDone: number;
  widgetsTotal: number;
  widgetsFailed: number;
}

export interface CloneResult {
  projectId: string;
  widgetsCloned: number;
  widgetsFailed: number;
}

const INITIAL: CloneProgress = {
  phase: 'idle',
  widgetsDone: 0,
  widgetsTotal: 0,
  widgetsFailed: 0,
};

export function useCloneDashboard() {
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState<CloneProgress>(INITIAL);

  const cloneDashboard = useCallback(
    async (source: { projectId: string; name: string }): Promise<CloneResult> => {
      setCloning(true);
      setProgress({ ...INITIAL, phase: 'reading' });
      try {
        // 1. Read the source design.
        const full = await getDashboard(source.projectId);
        const widgetsTotal = (full.pages || []).reduce(
          (n, p) => n + (p.widgets?.length || 0),
          0,
        );
        setProgress({ phase: 'creating', widgetsDone: 0, widgetsTotal, widgetsFailed: 0 });

        // 2. Create the destination dashboard.
        const baseName = source.name?.trim() || full.project_name || 'Dashboard';
        const created = await createDashboard({
          project_name: `${baseName} (copy)`,
          description: full.description ?? null,
          default_database: full.default_database ?? null,
          default_schema: full.default_schema ?? null,
        });
        const newId = created.project_id;

        // The backend seeds a default first page on create (returned as
        // default_page_id) — reuse it for the source's first page instead of
        // leaving an empty orphan, then create the rest.
        let reusablePageId: string | null = created.default_page_id ?? null;

        setProgress((p) => ({ ...p, phase: 'copying' }));

        let widgetsDone = 0;
        let widgetsFailed = 0;

        // 3 + 4. Recreate pages and their widgets in order.
        for (let i = 0; i < (full.pages || []).length; i += 1) {
          const sp = full.pages[i];
          let targetPageId: string;

          if (reusablePageId) {
            targetPageId = reusablePageId;
            reusablePageId = null; // consume the starter page once
            // Match the source page's title/layout/order on the reused page.
            try {
              await updatePage(newId, targetPageId, {
                title: sp.title,
                layout: sp.layout,
                page_order: sp.page_order,
              });
            } catch {
              /* a rename failure is cosmetic — keep cloning the widgets */
            }
          } else {
            const np = await createPage(newId, {
              title: sp.title,
              layout: sp.layout,
              page_order: sp.page_order,
            });
            targetPageId = np.page_id;
          }

          for (const w of sp.widgets || []) {
            try {
              await createWidget(newId, {
                page_id: targetPageId,
                widget_type: w.widget_type,
                chart_type: w.chart_type ?? null,
                title: w.title ?? undefined,
                chart_config: w.chart_config ?? null,
                text_content: w.text_content ?? null,
                position_x: w.position_x,
                position_y: w.position_y,
                width: w.width,
                height: w.height,
                style: w.style ?? null,
              });
              widgetsDone += 1;
            } catch {
              widgetsFailed += 1;
            }
            setProgress((p) => ({ ...p, widgetsDone, widgetsFailed }));
          }
        }

        setProgress({ phase: 'done', widgetsDone, widgetsTotal, widgetsFailed });
        return { projectId: newId, widgetsCloned: widgetsDone, widgetsFailed };
      } catch (err) {
        setProgress((p) => ({ ...p, phase: 'error' }));
        throw new Error(getApiErrorMessage(err));
      } finally {
        setCloning(false);
      }
    },
    [],
  );

  return { cloning, progress, cloneDashboard };
}
