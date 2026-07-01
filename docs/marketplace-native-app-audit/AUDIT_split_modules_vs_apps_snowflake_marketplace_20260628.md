# Audit de faisabilité — Découpage « Modules » vs « Applications Snowflake payantes (Marketplace) » + couche Terraform d'infra

**Date :** 2026-06-28
**Branche :** feat/backlog-v1
**Type :** Audit (lecture seule — aucune implémentation)
**Auteur :** Claude (Opus 4.8) — recon code + connaissance Snowflake Native App Framework / provider Terraform

> ⚠️ **Note de fiabilité.** La recon du code (this repo) est vérifiée fichier par fichier. Les détails Snowflake (Native App Framework, monétisation Marketplace, provider Terraform) sont basés sur ma connaissance du produit et **doivent être revérifiés sur `docs.snowflake.com` + `registry.terraform.io`** avant tout engagement de roadmap. Les points à confirmer sont taggés **[À VÉRIFIER DOC]**. L'agent de recherche doc a été interrompu — cet audit n'a donc PAS de citations d'URL fraîches.

---

## 0. La philosophie (reformulée)

Telle que je la comprends :

1. **Deux niveaux d'objets distincts :**
   - **Module** = brique fonctionnelle réutilisable *à l'intérieur* de la plateforme (ce que `modules.ts` décrit déjà : connect, workflow, gouvernance, BI, intelligent…). Cross-cutting : gouvernance + monitoring de la gouvernance + optimisation, gérés **comme des modules Terraform** (infra-as-code).
   - **Application** = le couple **backend + front d'un module**, packagé pour être **déployé** (et potentiellement **vendu** sur la Marketplace Snowflake payante) et **monitoré comme un projet de workflow**.

2. **Une couche d'infra dédiée** (un dossier `terraform/`) qui gère :
   - la **Unified Data Platform** (les ressources Snowflake : DB, schémas, rôles, warehouses, compute pools, network policies, resource monitors) ;
   - son **monitoring**, exposé dans **Administration**.

3. **Point d'entrée du chantier :** le **nouveau module « Applications »** — un module de *gestion d'applications* : déployer une app, la gouverner (RBAC + users), la monitorer. Il s'appuie sur le workflow de déploiement existant (les apps sont traitées comme des « projets de workflow »).

4. **Objectif final :** pouvoir **déployer une Snowflake Native App payante sur la Marketplace**, pilotée depuis le module de management d'app, avec sa gouvernance / gestion des utilisateurs.

**Verdict global d'emblée :** la philosophie est **saine et alignée avec le Native App Framework de Snowflake**, qui distingue précisément *Application Package* (le produit versionné/vendable) de *Application* (l'instance installée chez un consommateur). Le repo a déjà **80 % des primitives UI/front** (déploiement, approbations, SPCS, RBAC, monitoring). Ce qui manque est **100 % côté packaging/infra** : aucun artefact Native App, aucune IaC. C'est un chantier **réel mais structuré**, pas une refonte.

---

## 1. État des lieux du code (ce qui existe déjà)

### 1.1 Système de modules — ✅ prêt à servir de registre d'« applications »
`apps/data360/src/config/modules.ts` : 14 modules visibles + 3 cachés, chacun avec `id`, `name`, `apiName` (snake_case, = nom de module backend pour le RBAC), et sous-modules (ex. `intelligent` → `cortex`, `semantic_models`, `cortex_chat`).

→ **Ce registre est exactement la table de mapping dont une couche « 1 module = 1 application déployable » a besoin.** Il suffira d'y ajouter des métadonnées de packaging (voir §6).

### 1.2 Trois briques de déploiement d'app déjà présentes — ✅ fondations réelles

| Brique | Emplacement | Ce qu'elle fait aujourd'hui |
|---|---|---|
| **Module Workflow** | `(dashboard)/workflow/` + `services/workflow/` (1289 l.) | Lifecycle de déploiement avec **approbations** : `POST /workflow/{id}/deployments`, `…/approve\|reject\|execute`, pre-check / post-verify gates. Dev tools : Git repos, compute pools, container services, notebooks. |
| **Module deploy-app** | `(dashboard)/deploy-app/` + `services/deployments/` | Wizard de déploiement. **App kinds : `streamlit \| container \| chart \| connector`**. Lifecycle 5 étapes (review→configure→dry_run→deploy→verify), statuts PENDING→…→SUCCEEDED/FAILED. `POST /deployments/track`. |
| **Intelligent → Snowpark Services** | `(dashboard)/intelligent/snowpark-services-content.tsx` | **SPCS UI déjà là** : Compute Pools, Services (conteneurs), **Data Apps (Streamlit)**, Image Repos. Endpoints `/cortex/snowpark/{compute-pools,services,streamlit,image-repos,endpoints}`. Permissions `manage-streamlit`, `manage-services`, `manage-compute-pools`. |

→ **Conséquence forte :** le « module Applications » demandé **ne part pas de zéro**. C'est largement une **unification/élévation** de `workflow` + `deploy-app` + `snowpark-services` sous une surface « gestion d'applications », plus l'ajout de la couche **packaging Native App** (qui, elle, n'existe pas).

### 1.3 Couche services — ✅ pattern homogène et packageable
`services/<module>/` : `index.ts` (surface API typée via `apiClient`), `types.ts`, fichiers de domaine. Tous passent par `apiClient` + `api-contracts.ts`. Gestion gracieuse des 404/501 (action `unavailable`).
→ Chaque module est déjà un **bundle front cohérent** ; le découper en « package d'application » est mécaniquement faible (le code est déjà rangé par domaine).

### 1.4 Surfaces de monitoring/admin — ✅ repurposables en « monitoring infra »
- `admin/` (ops plateforme) : `ServerMetricsPanel`, `RoleGrantsPanel`, `RealAccessPanel`, `ActivityDashboard`, `api-health/`, `performance/`, `data360-config/`, `platform-settings/`.
- `administration/` (gouvernance/accès) : `access-center/` (provisioning par demande), `feature-governance/`.
→ La « monitoring de l'infra des applications dans Administration » a déjà ses **conteneurs visuels**. Il manque la **source de données infra** (état Terraform, état des Native Apps installées, billing events).

### 1.5 Ce qui n'existe PAS aujourd'hui — ❌ le cœur du chantier
- ❌ **Aucun artefact Native App** : pas de `manifest.yml`, pas de `setup_script.sql`, pas d'Application Package. Les « apps » actuelles sont des **Streamlit / conteneurs SPCS**, pas des Native Apps Marketplace.
- ❌ **Aucune IaC** : zéro `.tf`, pas de dossier `infra/`/`terraform/`, pas de provider Snowflake. CI = GitLab shell + Vercel ; backend = **FastAPI monolithe** sur `api.datalab360.io` (séparé, hors repo).
- ❌ **Backend non modulaire au sens déployable** : un seul process FastAPI, routers par domaine, une seule DB `CP_DATA360` partagée.

---

## 2. Modèle cible : « Module » vs « Application » (alignement Snowflake)

Le vocabulaire de Snowflake colle à l'intention :

| Concept utilisateur | Objet Snowflake | Dans ce repo |
|---|---|---|
| **Module** (brique réutilisable, gouvernée par IaC) | objets de base : `DATABASE`, `SCHEMA`, `ROLE`, `WAREHOUSE`, `COMPUTE POOL`, `RESOURCE MONITOR`, `NETWORK POLICY` — décrits en **modules Terraform** | `modules.ts` + services/<module> |
| **Application (produit vendable)** | **`APPLICATION PACKAGE`** — objet versionné (`ADD VERSION`/`ADD PATCH`), contient `manifest.yml` + `setup_script` + logique + Streamlit/SPCS | À CRÉER — n'existe pas |
| **Application (instance installée chez le client)** | **`APPLICATION`** créée `FROM APPLICATION PACKAGE` chez le consommateur | À CRÉER |
| **Mise en vente** | **`LISTING`** (Marketplace) attachée au package, monétisée | À CRÉER (Provider Studio / `CREATE LISTING`) |

→ **Le découpage demandé est exactement la dichotomie native du framework.** « Splitter en module et application » n'est pas une invention maison à risque : c'est la structure recommandée par Snowflake.

---

## 3. Ce qu'exige une Snowflake Native App (artefacts requis)

Pour transformer un module en application installable/vendable, il faut produire (typiquement déposé sur un **named stage** du package) :

1. **`manifest.yml`** (racine du package) — déclare :
   - `manifest_version`, métadonnées de version/patch ;
   - **`artifacts`** : pointeur vers le `setup_script`, le `readme`, et un éventuel `default_streamlit` ;
   - **`privileges`** : les **privilèges au niveau compte** que l'app demande au consommateur (ex. `CREATE COMPUTE POOL`, `EXECUTE TASK`, `IMPORTED PRIVILEGES`…) ;
   - **`references`** : les objets du compte consommateur que l'app doit recevoir (tables, secrets, EAI) via *reference definitions* — le consommateur les accorde explicitement.
2. **`setup_script.sql`** — exécuté à l'install **et à chaque upgrade**. Crée : **application roles** (`CREATE APPLICATION ROLE`), schémas versionnés, procédures/UDF, objets Streamlit, services SPCS, et **GRANT** aux application roles. Fortement contraint (pas de DDL arbitraire hors du périmètre app). **[À VÉRIFIER DOC]** la liste exacte des instructions autorisées par version de framework.
3. **`README.md`** — affiché au consommateur.
4. **(optionnel) Streamlit** — `default_streamlit` dans le manifest → l'UI du module peut tourner *dans* l'app.
5. **(optionnel mais clé ici) SPCS** — pour faire tourner **un backend conteneurisé** (FastAPI) dans l'app : image repository + **compute pool** (créé côté consommateur, déclaré dans le manifest), spec de service. **[À VÉRIFIER DOC]** contraintes SPCS-in-Native-App (egress, EAI, ports, endpoints publics).

**Cycle de vie :** `CREATE APPLICATION PACKAGE` → upload artefacts sur stage → `ALTER APPLICATION PACKAGE … ADD VERSION/PATCH` → test local `CREATE APPLICATION … FROM APPLICATION PACKAGE USING VERSION` → attacher un `LISTING`.

> **Implication architecturale majeure (le point dur).** Le backend Data360 est un **FastAPI monolithe hébergé hors-Snowflake** (`api.datalab360.io`). Une Native App **ne peut pas appeler un backend externe librement** : soit (a) on **containerise le backend dans SPCS** à l'intérieur de l'app, soit (b) on utilise une **External Access Integration** (egress contrôlé) — mais un produit Marketplace qui dépend d'un backend SaaS externe est **mal vu en security review** et casse le modèle « tout tourne dans le compte du consommateur ». **C'est le plus gros écart technique du chantier** (voir §8 risques).

---

## 4. Marketplace **payante** / monétisation (ce qu'il faut)

Pour un **listing payant** (vs gratuit/privé) : **[À VÉRIFIER DOC — section monétisation Provider Studio]**

1. **Provider profile** validé (Provider Studio dans Snowsight) + acceptation des **Snowflake Provider Terms** + **activation de la monétisation** sur le compte (régions/pays supportés requis ; Snowflake gère l'encaissement et reverse au provider).
2. **Modèles de prix** supportés (à confirmer la liste exacte) : essai gratuit, **usage-based** (via **billing events** — `SYSTEM$CREATE_BILLING_EVENT` / table de billing events), **forfait** mensuel/annuel, **per-consumer** négocié.
3. **Security review obligatoire** : tout listing payant et/ou toute app demandant des privilèges passe une **revue de sécurité** (scan automatisé + revue manuelle). Délais non négligeables. **[À VÉRIFIER DOC]** durée typique.
4. **Auto-fulfillment / cross-region** : pour vendre à des consommateurs dans d'autres régions/clouds, il faut **répliquer** le package (auto-fulfillment activé au niveau organisation). **[À VÉRIFIER DOC]**.
5. **Exigences légales** : conditions d'utilisation, support, SLA affichés sur le listing.

→ Le repo a déjà une **brique de tracking de déploiement et d'approbations** (`/deployments/track`, `workflow/.../approve`) ; il faudra y greffer la notion de **billing events** et d'**état de listing** (draft/in-review/published), qui n'existe pas.

---

## 5. Gouvernance & gestion des users dans l'app

Le framework fournit le modèle RBAC ; il faut le mapper avec le système RBAC **à 2 niveaux** déjà présent (module-level via `/user/me/modules`, action-level via `/gouvernance/d360-roles/my-permissions`, `useCanPerform`).

- **Application roles** (`CREATE APPLICATION ROLE` dans le setup script) = rôles *internes à l'app*, accordés aux **account roles** du consommateur. C'est par là que le consommateur « donne accès » à ses users.
- **References + privileges** = consentement explicite du consommateur (objets + privilèges compte) — le manifest les déclare, l'UI Snowflake (ou un Streamlit de l'app) les fait accorder.
- **Monitoring provider de l'usage** : **event tables** / télémétrie ; le provider voit des **agrégats** de consommation (pas les données du consommateur). Les **billing events** alimentent à la fois la facturation et le monitoring d'usage. **[À VÉRIFIER DOC]** ce que le provider voit exactement (consumer-level vs agrégé).

→ **Travail de mapping à faire :** `modules.ts` apiName ↔ application roles ; `useCanPerform` actions ↔ grants aux application roles. Le modèle conceptuel est compatible ; l'implémentation est neuve.

---

## 6. La couche Terraform d'infra (le dossier `terraform/`)

**Provider :** `snowflakedb/terraform-provider-snowflake` (ex-`Snowflake-Labs/snowflake`, v1+ depuis 2025).

**Structure de dossier recommandée (proposition) :**
```
terraform/
  modules/
    platform-core/      # databases, schemas, warehouses partagés (Unified Data Platform)
    rbac/               # snowflake_account_role + grant_privileges_to_account_role
    network/            # snowflake_network_policy
    monitoring/         # snowflake_resource_monitor + vues ACCOUNT_USAGE/ORGANIZATION_USAGE
    spcs/               # compute pools + image repos (pour backends conteneurisés)
    app-package/        # snowflake_application_package + stage + versions   [À VÉRIFIER DOC]
  envs/
    dev/ staging/ prod/ # compositions par environnement (backend state distant)
```

**Ressources provider — niveau de support :**
- ✅ **Bien supporté** : `snowflake_database`, `snowflake_schema`, `snowflake_warehouse`, `snowflake_account_role`, `snowflake_grant_privileges_to_account_role`, `snowflake_stage`, `snowflake_share`, `snowflake_resource_monitor`, `snowflake_network_policy`, `snowflake_user`.
- ⚠️ **À vérifier / maturité variable** : `snowflake_compute_pool`, `snowflake_streamlit`, `snowflake_image_repository`. **[À VÉRIFIER DOC]**.
- ❓ **Probablement NON couvert en first-class** : `snowflake_application_package` / `snowflake_application` complets, et **surtout la publication d'un LISTING Marketplace**. Historiquement le provider **ne gère pas** le cycle Native App + monétisation de bout en bout. La création/soumission de **listing payant se fait via Provider Studio (manuel) ou `CREATE LISTING` (SQL, encore en preview selon versions)**, *pas* via Terraform. **[À VÉRIFIER DOC — point critique de la roadmap]**.

→ **Conclusion infra :** Terraform est **excellent pour la « Unified Data Platform » et son monitoring** (DB/rôles/warehouses/compute pools/resource monitors/ACCOUNT_USAGE) — c'est-à-dire **exactement la partie « modules » + monitoring dans Administration** de la philosophie. Mais le **packaging Native App + publication Marketplace payante restera partiellement manuel / piloté par scripts** (Snowflake CLI `snow app`, SQL, Provider Studio), pas 100 % Terraform. **À cadrer comme une réalité, pas un échec.**

**Monitoring d'infra (la partie « Administration ») :** `snowflake_resource_monitor` + vues `SNOWFLAKE.ACCOUNT_USAGE.*` / `ORGANIZATION_USAGE.*` (warehouse_metering, query_history, storage, application usage) → c'est la source de données qui manque aux panels `admin/` existants pour devenir un vrai monitoring d'infra et d'optimisation (coût).

---

## 7. Le module « Applications » (point de départ proposé)

C'est le **plus petit incrément qui démontre la philosophie**. Il n'introduit PAS encore le risque Marketplace payante ; il pose la surface de management.

**Ce qu'il agrège (déjà présent) :**
- Liste des apps déployées (Streamlit/conteneur/connector) ← `deploy-app` + `snowpark-services`.
- Lifecycle + approbations ← `workflow/.../deployments`.
- Monitoring par app (santé, runs, coût) ← repurpose `admin/ServerMetricsPanel` + futures vues ACCOUNT_USAGE.
- Gouvernance/users par app ← `useCanPerform` + application roles (futur).

**Ce qu'il ajoute (neuf) :**
- Un **registre d'applications** (étendre `modules.ts` avec : `packageName`, `appKind`, `listingStatus`, `version/patch`, `billingModel`).
- Un **onglet « Packaging »** par app : état manifest/setup_script, version courante, dernier upgrade.
- Un **onglet « Marketplace »** : statut du listing (draft → in-review → published), modèle de prix, billing events agrégés.

**Lien « app = projet de workflow » :** réutiliser `useProjectContext` + le lifecycle workflow pour traiter chaque app comme un projet déployable/monitorable. Cohérent avec l'archi existante (pas de sélecteur popup, projet persistant par module — cf. conventions CLAUDE.md).

---

## 8. Risques & écarts (par sévérité)

| # | Risque / écart | Sévérité | Détail |
|---|---|---|---|
| R1 | **Backend FastAPI externe ≠ modèle Native App** | 🔴 Élevé | Une app Marketplace doit tourner **dans le compte du consommateur**. Il faut **containeriser le backend par module dans SPCS** (ou EAI contrôlée). Refonte du couplage front↔`api.datalab360.io`. C'est le vrai coût. |
| R2 | **Backend monolithe, une seule DB** | 🔴 Élevé | « 1 module = 1 app » suppose de **découper le monolithe** par domaine (au moins logiquement : schémas/rôles/services séparés). Gros travail backend (hors repo front). |
| R3 | **Native App + listing payant non couverts par Terraform** | 🟠 Moyen | Le cycle packaging/publication restera **semi-manuel** (Snowflake CLI `snow app`, SQL, Provider Studio). L'IaC couvre l'infra, pas la mise en marché. **[À VÉRIFIER DOC]** |
| R4 | **Security review + monétisation = délais externes** | 🟠 Moyen | Premier listing payant = revue sécurité Snowflake + activation monétisation. Délai non maîtrisé en interne. **[À VÉRIFIER DOC]** |
| R5 | **Contraintes setup_script / SPCS-in-app** | 🟠 Moyen | DDL restreint, egress contrôlé, compute pool côté consommateur. À prototyper tôt. **[À VÉRIFIER DOC]** |
| R6 | **Double système RBAC à réconcilier** | 🟡 Faible | Mapper module-level + action-level (`useCanPerform`) ↔ application roles. Conceptuellement compatible. |
| R7 | **Branding** | 🟡 Faible | Règle CLAUDE.md : pas de « Snowflake/Cortex » en copy client. Or un listing Marketplace **est** Snowflake-facing → vendor names autorisés dans les vues admin/architecture, à isoler du front client. |

---

## 9. Verdict de faisabilité

- **Faisable et bien aligné** : la dichotomie module/application correspond au Native App Framework ; le front a déjà déploiement, approbations, SPCS UI, RBAC 2-niveaux et surfaces de monitoring.
- **Le vrai chantier est backend + packaging, pas front** : containeriser/découper le FastAPI (R1/R2), produire manifest/setup_script, et accepter que la mise en marché payante soit **semi-manuelle** (R3/R4).
- **Terraform = grande valeur sur l'infra/monitoring** (Unified Data Platform + Administration), **valeur partielle sur le packaging Native App**.
- **Bon point d'entrée** : le **module « Applications »** comme surface d'unification (workflow + deploy-app + snowpark-services) **avant** d'attaquer le packaging Native App payant.

---

## 10. Roadmap par phases (proposition, non engageante)

**Phase 0 — Confirmer la doc (prérequis, 0 code).**
Revérifier sur docs.snowflake.com tous les **[À VÉRIFIER DOC]** : support Terraform Native App/listing, modèles de prix, security review, SPCS-in-app, instructions setup_script. *Sans ça, la roadmap est spéculative.*

**Phase 1 — Module « Applications » (front, faible risque).**
Unifier `workflow`+`deploy-app`+`snowpark-services` sous une surface de management ; registre d'apps (étendre `modules.ts`) ; onglets Packaging/Marketplace en lecture (états mockés/réels). Branche `feat/backlog-v1`, build-green, local.

**Phase 2 — Couche Terraform d'infra (Unified Data Platform + monitoring).**
Dossier `terraform/` : platform-core, rbac, monitoring (resource monitors + ACCOUNT_USAGE), spcs. Brancher les vues sur les panels `admin/`/`administration/`. **Aucun déploiement sans go explicite** (cf. mémoire `feedback_deploy_only_local`).

**Phase 3 — Premier Native App (1 module pilote, gratuit/privé d'abord).**
Choisir le module le moins couplé au backend (candidat : un module Streamlit-only). Produire manifest/setup_script, packager, installer en local, tester l'upgrade. **Pas encore payant.**

**Phase 4 — Containerisation backend pilote (SPCS) si nécessaire (R1).**
Pour un module à backend, prototyper FastAPI-in-SPCS dans l'app. Décision go/no-go selon le coût réel.

**Phase 5 — Monétisation & listing payant.**
Provider profile, monétisation, billing events, security review, listing. Externe + long.

---

## Annexe A — Fichiers clés référencés (vérifiés)
- `apps/data360/src/config/modules.ts` — registre des modules.
- `apps/data360/src/app/(dashboard)/workflow/` + `services/workflow/index.ts` — lifecycle déploiement + approbations.
- `apps/data360/src/app/(dashboard)/deploy-app/` + `services/deployments/index.ts` — wizard, app kinds, `/deployments/track`.
- `apps/data360/src/app/(dashboard)/intelligent/snowpark-services-content.tsx` — SPCS UI (compute pools, services, Streamlit, image repos).
- `apps/data360/src/app/(dashboard)/admin/` + `administration/` — surfaces monitoring/gouvernance repurposables.
- `src/lib/api-contracts.ts`, `src/lib/api-client.ts` — couplage backend.
- `.gitlab-ci.yml` — CI actuelle (Vercel), **aucune IaC**.

## Annexe B — À vérifier sur la doc (checklist Phase 0)
1. Terraform : ressources Native App / `LISTING` réellement disponibles et matures (provider snowflakedb).
2. Monétisation : liste exacte des modèles de prix + activation par région/pays.
3. Security review payant : périmètre + délais.
4. SPCS-in-Native-App : egress/EAI, compute pool consumer-side, endpoints publics.
5. `setup_script` : instructions autorisées par `manifest_version` courant.
6. Provider monitoring : granularité de ce que voit le provider (agrégé vs per-consumer) via event tables / billing events.
7. Auto-fulfillment cross-region pour vente multi-régions.
