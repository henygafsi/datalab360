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
  | 'governance-users'
  | 'governance-roles'
  | 'governance-grants'
  | 'governance-security-matrix'
  | 'governance-policies'
  | 'data-quality'
  | 'observability'
  | 'intelligent'
  | 'bi-dashboard'
  | 'client-accounts'
  | 'auth';

export interface ApiErrorContext {
  status?: number;
  detail?: string | unknown;
  message?: string;
  feature?: FeatureKey;
  /** Backend error_code (e.g. SESSION_NOT_IN_PROCESS) */
  error_code?: string;
  /** Snowflake connector: errno, sqlstate, msg */
  snowflake?: { errno?: number; sqlstate?: string; msg?: string };
}

const SESSION_EXPIRED = 'Session expirée. Veuillez vous reconnecter.';
const SESSION_NOT_IN_PROCESS = 'Session non disponible (backend multi-workers). Utilisez --workers 1 ou reconnectez-vous.';
const FORBIDDEN = "Vous n'avez pas les droits pour cette action.";
const NOT_FOUND = 'Ressource introuvable.';
const VALIDATION = 'Données invalides. Vérifiez les champs ou la requête Snowflake.';
const SERVER = 'Erreur serveur. Réessayez ou contactez l\'équipe technique.';
const NETWORK = 'Impossible de joindre le serveur. Vérifiez votre connexion.';
const TIMEOUT = 'Délai dépassé. Le serveur met trop de temps à répondre.';

/** Smart captions for Snowflake errno (Snowflake connector best practices). */
const SNOWFLAKE_ERRNO_CAPTIONS: Record<number, string> = {
  904: 'Objet (table, schéma ou base) inexistant. Vérifiez les noms ou init_metadata.',
  90105: 'Objet inexistant. Vérifiez les permissions.',
  250001: 'Privilèges insuffisants. Vérifiez les rôles et grants Snowflake.',
  390111: 'Session Snowflake expirée. Reconnectez-vous.',
  252006: 'Connexion ou curseur fermé. Backend avec --workers 1 ou reconnectez-vous.',
  250002: 'Connexion fermée. Reconnectez-vous.',
};

const BY_FEATURE: Partial<Record<FeatureKey, Record<number, string>>> = {
  'account-overview': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Tableau de bord ou activité introuvable.',
    500: 'Erreur lors du chargement du tableau de bord. Vérifiez la connexion Snowflake.',
    503: SESSION_NOT_IN_PROCESS,
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
  'governance-users': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Utilisateur introuvable.',
    409: 'Cet utilisateur existe déjà.',
    422: 'Données utilisateur invalides.',
    500: 'Erreur lors de la gestion des utilisateurs.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'governance-roles': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Rôle ou droits introuvables.',
    422: VALIDATION,
    500: 'Erreur lors de la gestion des rôles.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'governance-grants': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    500: 'Erreur lors de la mise à jour des droits.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'governance-security-matrix': {
    401: SESSION_EXPIRED,
    403: FORBIDDEN,
    404: 'Matrice de sécurité non initialisée.',
    500: 'Erreur lors du chargement de la matrice.',
    [-1]: TIMEOUT,
    [-2]: NETWORK,
  },
  'governance-policies': {
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
  'bi-dashboard': {
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
 * Uses error_code, snowflake (errno, msg), then status mapping.
 */
export function getErrorMessageForFeature(
  feature: FeatureKey,
  ctx: ApiErrorContext
): string {
  if (ctx.error_code === 'SESSION_NOT_IN_PROCESS') return SESSION_NOT_IN_PROCESS;
  if (ctx.snowflake?.errno != null && SNOWFLAKE_ERRNO_CAPTIONS[ctx.snowflake.errno]) {
    return SNOWFLAKE_ERRNO_CAPTIONS[ctx.snowflake.errno];
  }
  if (ctx.snowflake?.msg && typeof ctx.snowflake.msg === 'string' && ctx.snowflake.msg.length < 280) {
    return ctx.snowflake.msg;
  }
  const status = normalizeStatus(ctx.status);
  const byStatus = BY_FEATURE[feature];
  const mapped = byStatus?.[status] ?? byStatus?.[500] ?? byStatus?.[503] ?? SERVER;
  if (mapped) return mapped;
  if (status === 401) return SESSION_EXPIRED;
  if (status === 503) return SESSION_NOT_IN_PROCESS;
  if (status === 403) return FORBIDDEN;
  if (status === 422 || status === 400) return VALIDATION;
  if (status >= 500 || status < 0) return SERVER;
  if (typeof ctx.detail === 'string' && ctx.detail.length > 0 && ctx.detail.length < 200) {
    return ctx.detail;
  }
  return ctx.message || SERVER;
}

/**
 * Helper for axios/API client catch: extract status, detail, error_code, snowflake from error response.
 */
export function getErrorMessageFromError(
  feature: FeatureKey,
  err: {
    response?: {
      status?: number;
      data?: { detail?: unknown; error_code?: string; snowflake?: { errno?: number; sqlstate?: string; msg?: string } };
    };
    message?: string;
  }
): string {
  const data = err.response?.data;
  return getErrorMessageForFeature(feature, {
    status: err.response?.status,
    detail: data?.detail,
    message: err.message,
    error_code: data?.error_code,
    snowflake: data?.snowflake,
  });
}
