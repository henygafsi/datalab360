# CORS Error Fix - Backend Required

## Problem

Les APIs de mapping rencontrent des erreurs CORS:

```
Access to XMLHttpRequest at 'https://api.datalab360.io:8443/mapping/databases'
from origin 'http://localhost:3000' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Cause

Le backend FastAPI ne retourne pas les headers CORS nécessaires pour permettre les requêtes cross-origin depuis le frontend Next.js.

## Solution Backend (Python/FastAPI)

### 1. Installer le middleware CORS

Si ce n'est pas déjà fait:

```bash
pip install fastapi[all]
```

### 2. Configurer CORS dans le main FastAPI app

Ajouter cette configuration dans votre fichier principal FastAPI (ex: `main.py` ou `app.py`):

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Configuration CORS
origins = [
    "http://localhost:3000",      # Next.js dev server
    "http://localhost:3001",      # Backup port
    "https://datalab360.io",      # Production frontend (adjust as needed)
    "https://www.datalab360.io",  # Production www
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,           # Liste des origines autorisées
    allow_credentials=True,          # Autoriser les cookies/credentials
    allow_methods=["*"],             # Autoriser toutes les méthodes (GET, POST, etc.)
    allow_headers=["*"],             # Autoriser tous les headers
    expose_headers=["*"],            # Exposer tous les headers
)
```

### 3. Alternative: Autoriser toutes les origines (UNIQUEMENT EN DEV)

⚠️ **ATTENTION**: Ne pas utiliser en production!

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],             # Autoriser TOUTES les origines (dev uniquement)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. Vérifier l'ordre des middlewares

Le middleware CORS doit être ajouté **AVANT** les autres middlewares et routes:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 1. CORS en PREMIER
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Autres middlewares après
# app.add_middleware(...)

# 3. Routes en dernier
@app.get("/mapping/databases")
async def get_databases():
    # ...
```

## APIs Concernées

Les endpoints suivants ont besoin de CORS:

1. `GET /mapping/databases`
2. `GET /mapping/schemas/{database_name}`
3. `GET /mapping/tables/{database_name}/{schema_name}`
4. Tous les autres endpoints `/mapping/*`

## Test après correction

Une fois CORS configuré, tester avec curl:

```bash
curl -I -X OPTIONS https://api.datalab360.io:8443/mapping/databases \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
```

Vous devriez voir ces headers dans la réponse:

```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: authorization, content-type
Access-Control-Allow-Credentials: true
```

## Frontend Status

Le frontend est **correctement configuré** et envoie les bonnes requêtes avec:
- ✅ Header `Authorization: Bearer {token}`
- ✅ Header `Content-Type: application/json`
- ✅ Bonne URL d'API

Le problème est **uniquement côté backend**.

## Documentation FastAPI

Référence officielle: https://fastapi.tiangolo.com/tutorial/cors/
