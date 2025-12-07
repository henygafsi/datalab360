# Data360 Cache Architecture Documentation

## Overview

This document describes the cache usage patterns from backend (FastAPI) to frontend (Next.js/React), including integration points for application-driven events.

---

## Current Frontend Cache Architecture

### 1. State Management Layer (Jotai)

#### Persistent Atoms (localStorage)
```
┌─────────────────────────────────────────────────────────────┐
│                    Browser LocalStorage                      │
├─────────────────────────────────────────────────────────────┤
│  isomorphic-layout     │  Layout preference (hydrogen, etc) │
│  isomorphic-preset     │  Theme color preset                │
│  isomorphic-preset-name│  Color preset name                 │
│  checkout              │  Shopping cart state               │
│  token                 │  Auth token                        │
│  auth.*                │  Auth credentials (reauth)         │
└─────────────────────────────────────────────────────────────┘
```

**Files:**
- [use-layout.ts](../apps/data360/src/layouts/use-layout.ts) - Layout persistence
- [use-theme-color.ts](../apps/data360/src/layouts/settings/use-theme-color.ts) - Theme persistence
- [checkout.ts](../apps/data360/src/store/checkout.ts) - Cart persistence

#### In-Memory Atoms
```typescript
// Modal/Drawer state - no persistence needed
const modalAtom = atom({ isOpen: false, view: null, size: 'md' });
const drawerAtom = atom({ isOpen: false, view: null, placement: 'right' });
```

---

### 2. API Service Layer

#### Current Pattern: No Built-in Caching
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Component  │ ──> │  API Service │ ──> │  FastAPI     │
│   (useEffect)│     │  (axios)     │     │  Backend     │
└──────────────┘     └──────────────┘     └──────────────┘
        │                                         │
        │         Fresh data on every request     │
        └─────────────────────────────────────────┘
```

**Current Services Structure:**
```
apps/data360/src/app/services/
├── auth/
│   └── silentReauth.ts          # Credentials in storage
├── gouvernance/
│   ├── index.ts                 # Centralized API calls
│   ├── fetch_users.ts           # cache: 'no-store'
│   ├── fetch_roles.ts           # cache: 'no-store'
│   └── grants.ts                # cache: 'no-store'
├── mapping/
│   ├── getTables.ts             # axios, no cache
│   ├── getSchema.ts             # axios, no cache
│   └── getDatabases.ts          # axios, no cache
├── charts/
│   ├── fetchChartData.ts        # axios, no cache
│   └── useChartData.ts          # Request deduplication
└── bi-reporting/
    └── dashboards-local.ts      # localStorage only
```

---

### 3. Custom Hooks with Request Management

#### useChartData - Request Deduplication
```typescript
// apps/data360/src/app/services/charts/useChartData.ts
const useChartData = (params) => {
  const lastRequestKeyRef = useRef<string>('');

  useEffect(() => {
    const requestKey = JSON.stringify(params);
    if (requestKey === lastRequestKeyRef.current) return; // Skip duplicate
    lastRequestKeyRef.current = requestKey;
    // ... fetch data
  }, [params]);
};
```

#### useGouvernanceQuery - Generic Fetching Hook
```typescript
// apps/data360/src/hooks/use-gouvernance.ts
const useGouvernanceQuery = <T>(fetcher, deps) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    fetcher().then(setData).finally(() => setLoading(false));
  }, deps);

  return { data, loading, refetch };
};
```

---

## Backend Integration: FastAPI Event-Driven Cache

### Proposed Architecture with SSE/WebSocket Events

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐     │
│  │  API Routes │    │ Event Bus   │    │ Cache Invalidation  │     │
│  │  (CRUD)     │───>│ (Redis/Mem) │───>│ Publisher           │     │
│  └─────────────┘    └─────────────┘    └─────────────────────┘     │
│                                                  │                   │
│                                                  ▼                   │
│                                        ┌─────────────────────┐      │
│                                        │  SSE/WebSocket      │      │
│                                        │  /api/events/stream │      │
│                                        └─────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   │ Event Stream
                                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Next.js Frontend                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐                                            │
│  │  EventSource Hook   │ ◄── SSE Connection                         │
│  │  useBackendEvents() │                                            │
│  └─────────────────────┘                                            │
│            │                                                         │
│            │ Dispatch invalidation events                           │
│            ▼                                                         │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │  Cache Manager      │───>│  Query Invalidation │                 │
│  │  (Jotai/Context)    │    │  (refetch triggers) │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
│            │                                                         │
│            ▼                                                         │
│  ┌─────────────────────┐                                            │
│  │  UI Components      │ ◄── Auto-refresh on invalidation           │
│  └─────────────────────┘                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Guide

### Step 1: Backend Event Types (FastAPI)

```python
# backend/app/events/types.py
from enum import Enum
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime

class EventType(str, Enum):
    # Gouvernance Events
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    ROLE_CREATED = "role.created"
    ROLE_UPDATED = "role.updated"
    ROLE_DELETED = "role.deleted"
    GRANT_CREATED = "grant.created"
    GRANT_REVOKED = "grant.revoked"

    # Mapping Events
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    MAPPING_DEPLOYED = "mapping.deployed"

    # Data Events
    TABLE_REFRESHED = "table.refreshed"
    SCHEMA_UPDATED = "schema.updated"

    # Policy Events
    POLICY_CREATED = "policy.created"
    POLICY_UPDATED = "policy.updated"
    POLICY_DELETED = "policy.deleted"

class CacheEvent(BaseModel):
    event_type: EventType
    entity_id: Optional[str] = None
    entity_type: str
    timestamp: datetime
    data: Optional[Any] = None
    invalidate_keys: list[str] = []  # Cache keys to invalidate
```

### Step 2: Backend SSE Endpoint

```python
# backend/app/api/events.py
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
import asyncio
import json

router = APIRouter()

# In-memory event queue (use Redis in production)
event_subscribers: dict[str, asyncio.Queue] = {}

async def event_generator(request: Request, user_id: str):
    queue = asyncio.Queue()
    event_subscribers[user_id] = queue

    try:
        while True:
            if await request.is_disconnected():
                break

            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # Send keepalive
                yield f": keepalive\n\n"
    finally:
        del event_subscribers[user_id]

@router.get("/events/stream")
async def stream_events(request: Request, user_id: str):
    return StreamingResponse(
        event_generator(request, user_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

# Called when data changes
async def publish_event(event: CacheEvent):
    event_data = event.model_dump(mode='json')
    for user_id, queue in event_subscribers.items():
        await queue.put(event_data)
```

### Step 3: Frontend Cache Manager

```typescript
// apps/data360/src/lib/cache/cache-manager.ts
import { atom } from 'jotai';

export type CacheKey =
  | 'users'
  | 'roles'
  | 'grants'
  | 'projects'
  | 'tables'
  | 'schemas'
  | 'policies'
  | `user:${string}`
  | `role:${string}`
  | `project:${string}`;

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

export interface CacheState {
  entries: Map<CacheKey, CacheEntry<unknown>>;
  invalidatedKeys: Set<CacheKey>;
}

// Global cache state atom
export const cacheStateAtom = atom<CacheState>({
  entries: new Map(),
  invalidatedKeys: new Set(),
});

// Cache invalidation atom (write-only)
export const invalidateCacheAtom = atom(
  null,
  (get, set, keys: CacheKey[]) => {
    const state = get(cacheStateAtom);
    const newInvalidated = new Set(state.invalidatedKeys);
    keys.forEach(key => newInvalidated.add(key));

    set(cacheStateAtom, {
      ...state,
      invalidatedKeys: newInvalidated,
    });
  }
);

// Check if cache key is valid
export const isCacheValid = (state: CacheState, key: CacheKey): boolean => {
  if (state.invalidatedKeys.has(key)) return false;

  const entry = state.entries.get(key);
  if (!entry) return false;

  return Date.now() - entry.timestamp < entry.ttl;
};
```

### Step 4: Backend Events Hook

```typescript
// apps/data360/src/hooks/use-backend-events.ts
'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { useSession } from 'next-auth/react';
import { invalidateCacheAtom, CacheKey } from '@/lib/cache/cache-manager';

interface BackendEvent {
  event_type: string;
  entity_id?: string;
  entity_type: string;
  timestamp: string;
  invalidate_keys: string[];
}

const EVENT_TYPE_TO_CACHE_KEYS: Record<string, CacheKey[]> = {
  'user.created': ['users'],
  'user.updated': ['users'],
  'user.deleted': ['users'],
  'role.created': ['roles'],
  'role.updated': ['roles', 'users'], // Users might have role changes
  'role.deleted': ['roles', 'users'],
  'grant.created': ['grants'],
  'grant.revoked': ['grants'],
  'project.created': ['projects'],
  'project.updated': ['projects'],
  'mapping.deployed': ['projects', 'tables', 'schemas'],
  'policy.created': ['policies'],
  'policy.updated': ['policies'],
  'policy.deleted': ['policies'],
};

export function useBackendEvents() {
  const { data: session } = useSession();
  const invalidateCache = useSetAtom(invalidateCacheAtom);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!session?.user?.id) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    const url = `${baseUrl}/api/events/stream?user_id=${session.user.id}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: BackendEvent = JSON.parse(event.data);

        // Get cache keys to invalidate
        const keysFromType = EVENT_TYPE_TO_CACHE_KEYS[data.event_type] || [];
        const keysFromEvent = data.invalidate_keys as CacheKey[];
        const allKeys = [...new Set([...keysFromType, ...keysFromEvent])];

        if (allKeys.length > 0) {
          console.log(`[Cache] Invalidating keys:`, allKeys, `due to ${data.event_type}`);
          invalidateCache(allKeys);
        }
      } catch (error) {
        console.error('[SSE] Failed to parse event:', error);
      }
    };

    eventSource.onerror = () => {
      console.warn('[SSE] Connection error, reconnecting in 5s...');
      eventSource.close();
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    };

    eventSource.onopen = () => {
      console.log('[SSE] Connected to backend events');
    };
  }, [session?.user?.id, invalidateCache]);

  useEffect(() => {
    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);
}
```

### Step 5: Cache-Aware Data Hook

```typescript
// apps/data360/src/hooks/use-cached-query.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  cacheStateAtom,
  CacheKey,
  CacheEntry,
  isCacheValid
} from '@/lib/cache/cache-manager';

interface UseCachedQueryOptions<T> {
  cacheKey: CacheKey;
  fetcher: () => Promise<T>;
  ttl?: number; // Default: 5 minutes
  enabled?: boolean;
}

interface UseCachedQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  isStale: boolean;
}

export function useCachedQuery<T>({
  cacheKey,
  fetcher,
  ttl = 5 * 60 * 1000, // 5 minutes default
  enabled = true,
}: UseCachedQueryOptions<T>): UseCachedQueryResult<T> {
  const cacheState = useAtomValue(cacheStateAtom);
  const setCacheState = useSetAtom(cacheStateAtom);

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const isStale = !isCacheValid(cacheState, cacheKey);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      setData(result);

      // Update cache
      setCacheState((prev) => {
        const newEntries = new Map(prev.entries);
        newEntries.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          ttl,
        });

        // Remove from invalidated keys
        const newInvalidated = new Set(prev.invalidatedKeys);
        newInvalidated.delete(cacheKey);

        return {
          entries: newEntries,
          invalidatedKeys: newInvalidated,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch'));
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, fetcher, ttl, enabled, setCacheState]);

  // Initial load or refetch on invalidation
  useEffect(() => {
    if (!enabled) return;

    // Check if we have valid cached data
    const cached = cacheState.entries.get(cacheKey);
    if (cached && isCacheValid(cacheState, cacheKey)) {
      setData(cached.data as T);
      setIsLoading(false);
      return;
    }

    // Fetch if no cache or stale
    fetchData();
  }, [cacheKey, enabled, isStale]); // Re-run when stale changes

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
    isStale,
  };
}
```

### Step 6: Usage Example

```typescript
// apps/data360/src/app/(dashboard)/gouvernance/users/page.tsx
'use client';

import { useCachedQuery } from '@/hooks/use-cached-query';
import { useBackendEvents } from '@/hooks/use-backend-events';
import { fetchUsers } from '@/app/services/gouvernance/fetch_users';

export default function UsersPage() {
  // Connect to backend events for cache invalidation
  useBackendEvents();

  // Use cached query - auto-refetches when cache is invalidated
  const { data: users, isLoading, error, isStale } = useCachedQuery({
    cacheKey: 'users',
    fetcher: () => fetchUsers(),
    ttl: 10 * 60 * 1000, // 10 minutes
  });

  if (isLoading) return <Loading />;
  if (error) return <Error message={error.message} />;

  return (
    <div>
      {isStale && <RefreshIndicator />}
      <UsersTable data={users} />
    </div>
  );
}
```

---

## Event Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                            DATA FLOW                                  │
└──────────────────────────────────────────────────────────────────────┘

1. User Action (e.g., Create User)
   │
   ▼
2. Frontend API Call
   │  POST /api/gouvernance/users
   ▼
3. FastAPI Backend
   │  - Validates request
   │  - Creates user in database
   │  - Publishes event: { type: "user.created", ... }
   ▼
4. Event Published to SSE Stream
   │  All connected clients receive event
   ▼
5. Frontend useBackendEvents() Hook
   │  - Receives SSE event
   │  - Maps event type to cache keys
   │  - Calls invalidateCache(['users'])
   ▼
6. Cache State Updated
   │  - 'users' key marked as invalidated
   ▼
7. useCachedQuery() Hook Reacts
   │  - Detects isStale = true
   │  - Triggers refetch automatically
   ▼
8. UI Re-renders with Fresh Data
```

---

## Cache Invalidation Strategy

| Event Type | Cache Keys Invalidated | Reason |
|------------|----------------------|--------|
| `user.created` | `users` | New user added to list |
| `user.updated` | `users`, `user:{id}` | User data changed |
| `user.deleted` | `users`, `user:{id}` | User removed |
| `role.created` | `roles` | New role available |
| `role.updated` | `roles`, `users` | Role changes affect users |
| `grant.created` | `grants` | New permission granted |
| `grant.revoked` | `grants` | Permission removed |
| `project.created` | `projects` | New project |
| `mapping.deployed` | `projects`, `tables`, `schemas` | Schema changes |
| `policy.*` | `policies` | Policy changes |

---

## Configuration

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CACHE_TTL_DEFAULT=300000  # 5 minutes in ms
NEXT_PUBLIC_SSE_RECONNECT_DELAY=5000  # 5 seconds
```

### Cache TTL Recommendations

| Data Type | TTL | Reason |
|-----------|-----|--------|
| Users | 10 min | Changes infrequently |
| Roles | 30 min | Very stable |
| Grants | 5 min | Security-sensitive |
| Projects | 5 min | Active development |
| Tables/Schemas | 15 min | Changes on deploy |
| Policies | 5 min | Security-sensitive |
| Charts | 1 min | Real-time data |

---

## Migration Path

### Phase 1: Add Cache Infrastructure
1. Create `/lib/cache/cache-manager.ts`
2. Create `/hooks/use-cached-query.ts`
3. Add cache state atoms

### Phase 2: Add SSE Connection
1. Implement FastAPI SSE endpoint
2. Create `/hooks/use-backend-events.ts`
3. Add to root layout provider

### Phase 3: Migrate Services
1. Update `use-gouvernance.ts` to use `useCachedQuery`
2. Update other data hooks progressively
3. Add cache keys to all data fetching

### Phase 4: Add Optimistic Updates (Optional)
1. Implement optimistic cache updates
2. Add rollback on API failure
3. Show pending states in UI

---

## Debugging

### Cache State Inspector
```typescript
// Add to development builds only
export function CacheDebugger() {
  const cacheState = useAtomValue(cacheStateAtom);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded">
      <h3>Cache State</h3>
      <pre>{JSON.stringify({
        entries: Array.from(cacheState.entries.keys()),
        invalidated: Array.from(cacheState.invalidatedKeys),
      }, null, 2)}</pre>
    </div>
  );
}
```

### SSE Connection Status
```typescript
// In useBackendEvents hook
eventSource.onopen = () => {
  console.log('[SSE] Connected');
  // Update connection status atom
};

eventSource.onerror = () => {
  console.warn('[SSE] Disconnected');
};
```
