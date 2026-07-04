# deploy/ — production structure, Docker & preventive CI/CD

Everything here is **new** (no existing file touched). Review, then move each file to its canonical spot (noted per file). Replaces the fragile main-only rsync with reproducible images + gates that **stop a broken deploy before it ships**.

> This session runs under a macOS TCC block on `~/Documents`, so these were authored from the live 1026-endpoint contract + project memory, not by reading current source. Validate the two assumptions flagged below.

## Clean target structure
```
data360_pro/
├─ backend/                       # FastAPI (app.main:app)
│  ├─ app/                        # ← ships in image
│  ├─ tests/                      # ← excluded from image, run in CI
│  ├─ requirements.txt
│  ├─ Dockerfile                 ← deploy/backend.Dockerfile
│  ├─ .dockerignore              ← deploy/.dockerignore
│  └─ .gitlab-ci.yml             ← deploy/ci/gitlab-ci.yml
└─ datalab360Front/               # pnpm turborepo
   ├─ apps/data360/               # Next 14 app "iso"  (needs output:'standalone')
   ├─ packages/*                  # shared libs (if any)
   ├─ Dockerfile                 ← deploy/frontend.Dockerfile
   ├─ .dockerignore              ← deploy/.dockerignore
   └─ scripts/                   ← deploy/scripts/*  (health + audit)
```

## What is "unnecessary for production" (the boundary)
Two mechanisms, not manual deletion:
1. **`.dockerignore`** keeps it out of the *image* — secrets (`.env`, `*.p8`, `*.pem`, `.platform-credentials.txt`), `node_modules`/`.venv` (rebuilt), `.next`/`.turbo`/`dist`, `e2e/`, `tests/`, `docs/`, `*.md`, mockups, logs, `*.bak`, `__pycache__`. Result: small, secret-free images.
2. **`scripts/audit-unused.sh`** cleans the *repo* — dry-run report by default, `--apply` to delete build artifacts/caches/backups/throwaway AI scaffolding; `--docs` to also drop markdown/mockups. Run it in your own terminal (the sandbox here can't enumerate the FS).

**Unused *source* (`.py`/`.tsx`) is deliberately NOT auto-deleted** — that breaks dynamic imports, lazy routes, and string-loaded modules. Use analyzers that emit a *reviewed* list:
```
# frontend
pnpm dlx knip                      # unused files, exports, deps
pnpm dlx ts-prune                  # unused exports
# backend
pip install vulture && vulture app/ --min-confidence 80
grep -rn "importlib\|include_router\|__import__" app/   # cross-check dynamic loads before deleting
```
Delete only what survives review. `deploy/scratch/coverage_diff.json` (if copied over) already lists 307 FE dead API *calls* as a starting cross-check.

## Preventive runs (the point of the whole thing)
Pipeline order — **each gate blocks the next** (`deploy/ci/gitlab-ci.yml`):

| Stage | Gate | Catches |
|---|---|---|
| preflight | `backend-preflight.sh` | broken **imports** (the #1 deploy-killer), dropped/renamed routes vs baseline, syntax errors, dep conflicts, tracked `.env` |
| preflight | `pnpm lint` + `tsc --noEmit` + `knip` | FE type errors, dead code (advisory) |
| build | Docker multi-stage | image build re-runs the import gate; fails if code won't import |
| **verify** | **`endpoint-health.mjs`** | boots the image, probes **every GET** in the contract, **fails on any 5xx or 404-regression** (dropped route) — real reachability, not a fake-id probe |
| deploy | manual on `main` | promote image; post-deploy re-probes the live host for drift |

### Run the gates locally
```bash
# backend code-health
cd backend && ROUTE_BASELINE=routes.snapshot.json ../datalab360Front/deploy/scripts/backend-preflight.sh
# endpoint reachability (boot the stack first)
docker compose -f deploy/docker-compose.yml up -d api
BASE=http://localhost:8000 TOKEN=$JWT node deploy/scripts/endpoint-health.mjs
# full local parity + one-shot health gate
docker compose -f deploy/docker-compose.yml --profile verify up --build
```
Save each run's `endpoint-health-report.json` as the **baseline** for the next run → the gate then flags only *new* breakage (regressions), not pre-existing gaps.

## Two assumptions to confirm (I couldn't read source)
1. **Front:** `apps/data360/next.config.mjs` must set `output: 'standalone'` for `frontend.Dockerfile`. Add it if missing.
2. **Backend:** entrypoint is `app.main:app` and deps are in `requirements.txt`. If it's `pyproject.toml`/poetry, the Dockerfile already branches; confirm the module path.

## First move (safe order)
1. `chmod +x deploy/scripts/*.sh deploy/scripts/*.mjs`
2. `deploy/scripts/audit-unused.sh` (dry-run) → eyeball → `--apply`
3. Drop `.dockerignore` into both roots; `git rm --cached app/.env` on the backend (+ rotate — it's on the GitLab remote).
4. `docker compose -f deploy/docker-compose.yml up --build` → confirm both containers healthy.
5. Wire `.gitlab-ci.yml`; set CI vars `SVC_HEALTH_JWT`, `PROD_API_URL`, `NEXT_PUBLIC_API_URL`.
