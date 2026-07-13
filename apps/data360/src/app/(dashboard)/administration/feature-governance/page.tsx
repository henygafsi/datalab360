import { redirect } from 'next/navigation';

/**
 * `/administration/feature-governance` — CONSOLIDATED into the Access Control
 * Center. The Feature Governance matrix (module × feature entitlements) is now
 * the `featureGov` tab of the single admin access surface, so this standalone
 * sub-page redirects there rather than rendering a duplicate. Deep-links stay
 * valid; the matrix component itself (FeatureGovernanceMatrix.tsx) is unchanged
 * and still imported by the access-center page.
 */
export default function FeatureGovernanceRedirect() {
  redirect('/administration/access-center?tab=featureGov');
}
