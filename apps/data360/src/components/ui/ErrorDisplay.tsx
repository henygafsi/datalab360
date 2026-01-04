'use client';

import { Button } from 'rizzui';
import { RefreshCw, AlertCircle, Wifi, Clock, Lock, Server } from 'lucide-react';

export interface ErrorDisplayProps {
  error: Error | string | null;
  onRetry?: () => void;
  context?: 'users' | 'roles' | 'grants' | 'general';
  className?: string;
}

type ErrorType = 'timeout' | 'network' | 'auth' | 'server' | 'generic';

interface ErrorConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
  advice?: string;
}

function getErrorType(error: Error | string): ErrorType {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorName = typeof error === 'string' ? '' : error.name;

  if (errorName === 'TimeoutError' || errorMessage.includes('timeout') || errorMessage.includes('15 secondes')) {
    return 'timeout';
  }
  if (errorName === 'NetworkError' || errorMessage.includes('Network') || errorMessage.includes('connect')) {
    return 'network';
  }
  if (errorName === 'AuthenticationError' || errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('session')) {
    return 'auth';
  }
  if (errorMessage.includes('500') || errorMessage.includes('Internal Server') || errorMessage.includes('backend')) {
    return 'server';
  }
  return 'generic';
}

function getErrorConfig(type: ErrorType, context?: string): ErrorConfig {
  const contextName = context === 'users' ? 'utilisateurs' : context === 'roles' ? 'rôles' : context === 'grants' ? 'permissions' : 'données';

  switch (type) {
    case 'timeout':
      return {
        icon: <Clock className="h-16 w-16 text-amber-600" />,
        title: 'Le chargement prend trop de temps',
        description: `Le serveur met plus de 15 secondes à charger les ${contextName}. Cela peut arriver lors de grosses requêtes sur Snowflake.`,
        advice: '💡 Conseil : Contactez votre administrateur système pour optimiser les requêtes. En attendant, essayez de rafraîchir la page.',
      };

    case 'network':
      return {
        icon: <Wifi className="h-16 w-16 text-red-600" />,
        title: 'Impossible de se connecter au serveur',
        description: 'Le serveur backend ne répond pas. Vérifiez que le serveur est démarré et accessible.',
        advice: '💡 Conseil : Vérifiez votre connexion internet et contactez votre administrateur si le problème persiste.',
      };

    case 'auth':
      return {
        icon: <Lock className="h-16 w-16 text-orange-600" />,
        title: 'Votre session a expiré',
        description: 'Vous devez vous reconnecter pour accéder à cette page.',
        advice: '💡 Conseil : Rafraîchissez la page et connectez-vous à nouveau. Pensez à enregistrer vos modifications avant.',
      };

    case 'server':
      return {
        icon: <Server className="h-16 w-16 text-purple-600" />,
        title: 'Erreur du serveur',
        description: 'Le serveur a rencontré une erreur lors du traitement de votre demande.',
        advice: '💡 Conseil : Réessayez dans quelques instants. Si le problème persiste, contactez le support technique.',
      };

    case 'generic':
    default:
      return {
        icon: <AlertCircle className="h-16 w-16 text-red-600" />,
        title: 'Une erreur est survenue',
        description: `Impossible de charger les ${contextName} pour le moment.`,
        advice: '💡 Conseil : Réessayez. Si le problème persiste, contactez votre administrateur.',
      };
  }
}

export default function ErrorDisplay({
  error,
  onRetry,
  context = 'general',
  className = ''
}: ErrorDisplayProps) {
  if (!error) return null;

  const errorType = getErrorType(error);
  const config = getErrorConfig(errorType, context);
  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <div className={`rounded-2xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 ${className}`}>
      <div className="flex flex-col items-center gap-6 p-8 text-center">
        {/* Icon */}
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30">
          {config.icon}
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h3 className="text-xl font-bold text-red-900 dark:text-red-100">
            {config.title}
          </h3>

          <p className="text-sm leading-relaxed text-red-700 dark:text-red-300">
            {config.description}
          </p>

          {config.advice && (
            <div className="mt-4 rounded-lg bg-red-100 px-4 py-3 dark:bg-red-900/40">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {config.advice}
              </p>
            </div>
          )}

          {/* Technical details (collapsible) */}
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
              Détails techniques (pour les développeurs)
            </summary>
            <div className="mt-2 rounded-md bg-red-100 p-3 font-mono text-xs text-red-800 dark:bg-red-900/30 dark:text-red-300">
              {errorMessage}
            </div>
          </details>
        </div>

        {/* Retry button */}
        {onRetry && (
          <Button
            onClick={onRetry}
            className="bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800 dark:from-red-700 dark:to-red-800"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Réessayer
          </Button>
        )}
      </div>
    </div>
  );
}
