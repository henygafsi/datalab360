/**
 * User-facing error messages by feature.
 * Maps API errors (status, detail) to clear, actionable messages per page/feature.
 */

export type FeatureKey =
  | 'account-overview'
  | 'data-source-connection'
  | 'explore-design'
  | 'mapping'
  | 'workflow'
  | 'gouvernance-users'
  | 'gouvernance-roles'
  | 'gouvernance-grants'
  | 'gouvernance-security-matrix'
  | 'gouvernance-policies'
  | 'data-quality'
  | 'observability'
  | 'intelligent'
  | 'bi-reporting'
  | 'client-accounts'
  | 'auth';

export interface ApiErrorContext {
  status?: number;
  detail?: string | unknown;
  message?: string;
  feature?: FeatureKey;
}

const SESSION_EXPIRED = 'Session expirée. Veuillez vous reconnecter.';
const FORBIDDEN = "Vous n'avez pas les droits pour cette action.";
const NOT_FOUND = 'Ressource introuvable.';
const VALIDATION = 'Données invalides. Vérifiez les champs.';
const SERVER = 'Erreur serveur. Réessayez ou contactez l\'équipe technique.';
const NETWORK = 'Impossible de joindre le serveur. Vérifiez votre connexion.';
const TIMEOUT = 'Délai dépassé. Le serveur met trop de temps à répondre.';

const BY_FEATURE: Partial<Record<FeatureKey, Record<number, string>>> = {
  'account-overview': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Tableau de bord ou activité introuvable.',
    500: 'Erreur lors du chargement du tableau de bord. Vérifiez la connexion Snowflake.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'data-source-connection': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Stages ou connexions introuvables.',
    500: 'Erreur lors du chargement des stages ou du data lake.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'explore-design': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Projet ou déploiement introuvable.',
    422: 'Données du projet invalides.',
    500: 'Erreur Explore & Design. Vérifiez Snowflake.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  mapping: {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Bases, schémas ou projets introuvables.',
    422: VALIDATION,
    500: 'Erreur lors du chargement du mapping.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  workflow: {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Workflow ou déploiement introuvable.',
    422: 'Configuration du workflow invalide.',
    500: 'Erreur workflow. Vérifiez les tâches Snowflake.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'gouvernance-users': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Utilisateur introuvable.',
    409: 'Cet utilisateur existe déjà.',
    422: 'Données utilisateur invalides.',
    500: 'Erreur lors de la gestion des utilisateurs.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'gouvernance-roles': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Rôle ou droits introuvables.',
    422: VALIDATION,
    500: 'Erreur lors de la gestion des rôles.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'gouvernance-grants': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    500: 'Erreur lors de la mise à jour des droits.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'gouvernance-security-matrix': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Matrice de sécurité non initialisée.',
    500: 'Erreur lors du chargement de la matrice.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'gouvernance-policies': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Politique introuvable.',
    422: VALIDATION,
    500: 'Erreur lors de la gestion des politiques.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'data-quality': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Rapport ou projet introuvable.',
    500: 'Erreur lors du chargement des rapports qualité.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  observability: {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Métriques ou lignage introuvables.',
    500: 'Erreur lors du chargement de l\'observabilité.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  intelligent: {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Modèles sémantiques ou Cortex introuvables.',
    500: 'Erreur Cortex / IA. Vérifiez que le service Cortex est disponible.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'bi-reporting': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Tableau BI introuvable.',
    500: 'Erreur lors du chargement des rapports BI.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'client-accounts': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Comptes organisation introuvables.',
    500: 'Erreur lors du chargement des comptes clients.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  auth: {
    401: 'Identifiants incorrects ou session expirée.',
    403: FORBIDDEN,
    422: 'Email ou mot de passe invalide.',
    500: 'Erreur d\'authentification. Réessayez.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
};

function normalizeStatus(status: number | undefined): number {
  if (status == null) return 500;
  if (status === 0 || status < -3) return -2; // network-like
  return status;
}

/**
 * Returns a user-friendly error message for the given feature and API error.
 * Use in catch blocks: getErrorMessageForFeature('account-overview', { status: 500, detail: '...' })
 */
export function getErrorMessageForFeature(
  feature: FeatureKey,
  ctx: ApiErrorContext
): string {
  const status = normalizeStatus(ctx.status);
  const byStatus = BY_FEATURE[feature];
  const mapped = byStatus?.[status] ?? byStatus?.[500] ?? SERVER;
  if (mapped) return mapped;
  if (status === 401) return SESSION_EXPIRED;
  if (status === 403) return FORBIDDEN;
  if (status >= 500 || status < 0) return SERVER;
  if (typeof ctx.detail === 'string' && ctx.detail.length > 0 && ctx.detail.length < 200) {
    return ctx.detail;
  }
  return ctx.message || SERVER;
}

/**
 * Helper for axios/API client catch: extract status and detail from error response.
 */
export function getErrorMessageFromError(
  feature: FeatureKey,
  err: { response?: { status?: number; data?: { detail?: unknown } }; message?: string }
): string {
  const status = err.response?.status;
  const detail = err.response?.data?.detail;
  return getErrorMessageForFeature(feature, { status, detail, message: err.message });
}
