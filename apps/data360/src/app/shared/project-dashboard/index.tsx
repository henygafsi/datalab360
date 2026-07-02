import { Box } from 'rizzui';
import ProjectStats from './project-stats';
import ProjectSummary from './project-summary';
import RecentActivities from './recent-activities';

/**
 * Project dashboard — honest, real-data surface.
 *
 * The original template shipped seven fabricated widgets (invented project
 * counts, a React.js/WordPress/Laravel "Activities" chart, a fake "Client List"
 * with randomuser.me avatars, a hardcoded Gantt with a "Fred Chaparro" tooltip,
 * a dayjs-generated task calendar, and a static "Rachel Green added a task…"
 * feed). None of them called the backend. They were removed.
 *
 * What renders now is exclusively real or honestly empty:
 *   • ProjectStats   — the shared <ScoreCards/> health row (account-scoped DQ ·
 *                      COST · PERF · GOV · forecast). "—" when not computed.
 *   • ProjectSummary — the real account-wide project list from
 *                      GET /projects/unified. Selecting a row picks the active
 *                      project (no popup — CLAUDE.md forbids them).
 *   • RecentActivities — the selected project's real event log from
 *                      GET /projects/{id}/events. Honest empty state until a
 *                      project is selected.
 *
 * There is intentionally no account-wide activity feed: GET /projects/events/all
 * does not exist on the backend, so the feed is per-project via the summary
 * selection rather than fabricated.
 */
export default function ProjectDashboard() {
  return (
    <Box className="@container/pd">
      <ProjectStats className="mb-6 3xl:mb-8" />
      <Box className="grid grid-flow-row grid-cols-1 gap-6 @3xl/pd:grid-cols-12 3xl:gap-8">
        <ProjectSummary className="@3xl/pd:col-span-full @7xl/pd:col-span-8" />
        <RecentActivities className="@3xl/pd:col-span-full @7xl/pd:col-span-4" />
      </Box>
    </Box>
  );
}
