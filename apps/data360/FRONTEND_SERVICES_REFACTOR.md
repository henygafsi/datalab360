# Refactorisation des Services Frontend - Alignement avec les Contrats API

## Résumé

Refactorisation complète des services frontend pour :
1. Utiliser un système centralisé de configuration API basé sur les contrats YAML backend
2. Standardiser l'authentification via `@/lib/auth` et `@/lib/api-client`
3. Aligner tous les appels API avec les contrats définis dans `backend/docs/flow_contracts.yaml`

## Changements Principaux

### 1. Nouveau Système de Contrats API (`src/lib/api-contracts.ts`)

Création d'un fichier centralisé qui définit tous les endpoints API selon les contrats backend :
- `API_CONTRACTS.auth` : register, login
- `API_CONTRACTS.dashboard` : meModules, orgClientDashboard, orgAccountsOverview
- `API_CONTRACTS.metadata` : initMetadata
- `API_CONTRACTS.dataSource` : createInternalStage, uploadToStage, uploadAndLoad, listStages, listStageFiles
- `API_CONTRACTS.exploreDesign` : createProject, getProjects, createDeployment
- `API_CONTRACTS.mapping` : getProjects
- `API_CONTRACTS.workflow` : createWorkflow, getWorkflows, executeWorkflow, scheduleDeployment
- `API_CONTRACTS.biRetail` : salesOverview, salesDashboard

Chaque contrat expose une méthode `getUrl()` qui construit l'URL complète avec les paramètres appropriés.

### 2. Standardisation de l'Authentification

**Avant** : Chaque service créait sa propre fonction `getAuthInfo()` ou `getAuthHeaders()` utilisant `getSession()` directement.

**Après** : Tous les services utilisent maintenant `getAuthHeaders()` de `@/lib/auth`, qui :
- Fonctionne en server-side (SSR) et client-side
- Gère automatiquement l'expiration des tokens
- Ajoute les headers `Authorization`, `X-Account-Name`, et `X-Username` de manière cohérente

### 3. Services Refactorisés

#### `src/app/services/auth/login.ts`
- ✅ Utilise `API_CONTRACTS.auth.login.getUrl()`
- ✅ Utilise `API_CONFIG.BASE_URL` au lieu de `process.env.NEXT_PUBLIC_API_URL`

#### `src/app/services/auth/register.ts`
- ✅ Utilise `API_CONTRACTS.auth.register.getUrl()`
- ✅ Utilise `API_CONFIG.BASE_URL`

#### `src/app/services/workflow/index.ts`
- ✅ Remplace toutes les occurrences de `getSession()` par `getAuthHeaders()` de `@/lib/auth`
- ✅ Utilise `API_CONTRACTS.workflow.*` pour les endpoints principaux
- ✅ Utilise `API_CONFIG.BASE_URL`

#### `src/app/(dashboard)/data-source-connection/connectionServices.tsx`
- ✅ Supprime les fonctions locales `getAuthInfo()` et `getAuthHeaders()`
- ✅ Utilise `getAuthHeaders()` de `@/lib/auth`
- ✅ Utilise `API_CONTRACTS.dataSource.*` pour les endpoints principaux
- ✅ Utilise `API_CONFIG.BASE_URL`

#### `src/app/services/explore-design/index.ts`
- ✅ Remplace la fonction locale `getAuthHeaders()` par celle de `@/lib/auth`
- ✅ Utilise `API_CONTRACTS.exploreDesign.*` pour les endpoints principaux
- ✅ Utilise `API_CONFIG.BASE_URL`

## Avantages

1. **Cohérence** : Tous les services utilisent les mêmes helpers d'authentification et de configuration
2. **Maintenabilité** : Les changements d'endpoints se font en un seul endroit (`api-contracts.ts`)
3. **Type Safety** : TypeScript peut vérifier que les contrats sont utilisés correctement
4. **Documentation** : Les contrats servent de documentation vivante entre frontend et backend
5. **Débogage** : Plus facile de tracer les appels API grâce à la centralisation

## Prochaines Étapes Recommandées

1. **Services restants** : Appliquer la même refactorisation aux autres services :
   - `src/app/services/mapping/*`
   - `src/app/services/gouvernance/*`
   - `src/app/services/cortex/*`
   - `src/app/services/bi-reporting/*`

2. **Pages** : Vérifier que toutes les pages utilisent les services refactorisés correctement

3. **Tests** : Ajouter des tests unitaires pour les contrats API

4. **Documentation** : Mettre à jour la documentation des services pour référencer les contrats

## Notes Techniques

- Le build Next.js fonctionne correctement après ces changements
- L'erreur "Cannot find module './549.js'" a été résolue (probablement liée au cache de build)
- Tous les imports sont maintenant cohérents et utilisent les chemins absolus avec `@/`
