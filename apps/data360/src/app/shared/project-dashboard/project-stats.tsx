import { Box, Title } from 'rizzui';
import cn from '@core/utils/class-names';
import ScoreCards from '@/app/shared/score-cards/ScoreCards';

export default function ProjectStats({ className }: { className?: string }) {
  // Data360-standard KPI surface. The fabricated template stat cards
  // (Total / Completed / In-Progress / Active "projects" with invented +10.2%
  // deltas and a hardcoded "+1.01% this week") were replaced by the shared
  // <ScoreCards/> — the real DQ · COST · PERF · GOV · forecast health row.
  //
  // This page has no project selector (and CLAUDE.md forbids popup selectors),
  // so the cards are account-scoped. Each renders "—" — never a fake 0 — when a
  // value isn't computed, shows skeletons while loading, offers a retry on hard
  // errors, and self-hides if the route isn't provisioned (404/501).
  return (
    <Box className={cn('@container', className)}>
      <Title
        as="h1"
        className="mb-6 text-base font-semibold sm:text-lg xl:text-xl"
      >
        Overview
      </Title>
      <ScoreCards />
    </Box>
  );
}
