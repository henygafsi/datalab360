import { redirect } from 'next/navigation';

/**
 * `/administration/feature-governance` — CONSOLIDATED into the Administration
 * HUB. The Feature Governance matrix (module × feature entitlements) is now the
 * `featureGov` tab of the single admin hub, so this standalone sub-page redirects
 * there rather than rendering a duplicate. Deep-links stay valid; the matrix
 * component itself (FeatureGovernanceMatrix.tsx) is unchanged and still embedded
 * by the hub's Entitlements & Features tab.
 */
export default function FeatureGovernanceRedirect() {
  redirect('/administration?tab=featureGov');
}
