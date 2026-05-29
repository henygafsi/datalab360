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
import DeployAppHome from './components/DeployAppHome';
import DeployAppWizard, {
  type AppKind,
  type WizardSnapshot,
} from './components/DeployAppWizard';

export default function DeployAppPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<AppKind | null>(null);
  const [resumeSnapshot, setResumeSnapshot] = useState<WizardSnapshot | null>(
    null,
  );

  const openFromKind = useCallback((kind: AppKind) => {
    setResumeSnapshot(null);
    setInitialKind(kind);
    setWizardOpen(true);
  }, []);

  const openFromDraft = useCallback((snap: WizardSnapshot) => {
    setInitialKind(null);
    setResumeSnapshot(snap);
    setWizardOpen(true);
  }, []);

  const openFresh = useCallback(() => {
    setResumeSnapshot(null);
    setInitialKind(null);
    setWizardOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
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
