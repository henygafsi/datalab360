/**
 * Deployment tracking — DEPRECATED compatibility shim.
 *
 * The deployment service layers were consolidated into the single canonical
 * `@/app/services/deployments` module. This file re-exports that surface so
 * existing importers (DeploymentContext, notification-dropdown,
 * deployment-progress-chip, useDeploymentTracking) keep working unchanged.
 *
 * New code should import from `@/app/services/deployments` directly.
 */
export * from '../deployments';
