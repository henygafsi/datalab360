'use client';

/**
 * Deploy App — top-level module shell.
 *
 * Thin orchestrator: scaffold an app via a 5-step wizard, then deep-link to
 * the existing Snowpark Services module (Streamlit / Container / Image
 * Repos / Compute Pools) to actually deploy. This page renders the landing
 * (DeployAppHome) and owns the wizard open/close + initial-kind state.
 *
 * Personas:
 *   - Superadmin → fleet-managed deploys + audit events
 *   - Admin      → workflow-output → Streamlit dashboard in 4 clicks
 *   - QA         → throwaway sandbox app, auto-stop ON, "drop after test"
 *
 * NO SPCS UI lives here — every "deploy" button hands off via query string
 * to /intelligent?tab=snowpark-services&sub=<…>&prefill=<base64>.
 */
import { useState, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import DeployAppHome from './components/DeployAppHome';
import DeployAppWizard, {
  type AppKind,
  type WizardSnapshot,
} from './components/DeployAppWizard';

// Admin-only: gate the route itself so non-admins get an explanatory restricted
// state instead of the deploy shell with 403ing data calls.
export default function DeployAppPage() {
  return (
    <AdminRouteGuard surface="Deploy App">
      <DeployAppPageContent />
    </AdminRouteGuard>
  );
}

function DeployAppPageContent() {
  // Auto-fires PAGE_VIEW on mount (via the hook's pathname effect); exposes
  // trackFeatureClick for the wizard-open entry points below.
  const { trackFeatureClick } = useTrackEvent();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<AppKind | null>(null);
  const [resumeSnapshot, setResumeSnapshot] = useState<WizardSnapshot | null>(
    null,
  );

  const openFromKind = useCallback(
    (kind: AppKind) => {
      trackFeatureClick('open_wizard', { from: 'kind', kind });
      setResumeSnapshot(null);
      setInitialKind(kind);
      setWizardOpen(true);
    },
    [trackFeatureClick],
  );

  const openFromDraft = useCallback(
    (snap: WizardSnapshot) => {
      trackFeatureClick('resume_draft', {
        kind: snap.kind ?? undefined,
        step: snap.step,
      });
      setInitialKind(null);
      setResumeSnapshot(snap);
      setWizardOpen(true);
    },
    [trackFeatureClick],
  );

  const openFresh = useCallback(() => {
    trackFeatureClick('open_wizard', { from: 'new' });
    setResumeSnapshot(null);
    setInitialKind(null);
    setWizardOpen(true);
  }, [trackFeatureClick]);

  return (
    /*
     * Viewport-fit shell (no page scroll — user directive 2026-07-10). The
     * page renders inside the carbon dashboard chrome: header (85px) + main
     * pt-6 (24px) above, lg:pb-16 (64px) + footer (73px) below = 246px.
     * `min-h-screen` previously let the landing grow the document (the
     * deployments list alone pushed it past 9000px). DeployAppHome now owns
     * TABS (Build / Deployments) and each tab body scrolls internally.
     */
    <div className="flex h-[calc(100dvh-222px)] min-h-[480px] flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Toaster position="bottom-right" />
      <DeployAppHome
        onNewApp={openFresh}
        onPickKind={openFromKind}
        onResumeDraft={openFromDraft}
      />
      <DeployAppWizard
        open={wizardOpen}
        initialKind={initialKind}
        resumeSnapshot={resumeSnapshot}
        onClose={() => setWizardOpen(false)}
      />
    </div>
  );
}
