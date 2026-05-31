'use client';

/**
 * PolicyFormPanel — back-compat re-export of the shared {@link ActionRail}.
 *
 * The non-blocking right-side panel that governance forms use was generalized
 * into `@/app/shared/action-rail`. This module is kept so existing governance
 * imports (`import PolicyFormPanel from '@/app/shared/governance/policy-form-panel'`)
 * keep working unchanged. New code should import `ActionRail` directly.
 *
 * The prop contract is identical: `ActionRailProps` is a superset of the
 * original `PolicyFormPanelProps` (every added prop is optional, and the
 * `accentClassName` default of `bg-violet-500` is preserved), so this alias is
 * a drop-in replacement.
 */
import { default as ActionRail, type ActionRailProps } from '@/app/shared/action-rail/ActionRail';

export type PolicyFormPanelProps = ActionRailProps;

export default ActionRail;
