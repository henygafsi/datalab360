# shared/insights — Detect → Notify → Act (the CTA glue)

The reusable layer that turns an **inert** recommendation / alert / finding into a
**one-click, honestly-gated CTA**. This is the frontend half of the
"actionable-insights overlay" (see the Obsidian vault: `_actionable-insights-overlay`,
`_action-backlog`). The backend asks it depends on live in `_backend-todo`.

## The rule (load-bearing)
A "ready action" is always one of four **honest** states — never a button that
silently 404s, never a fake success:

| State | What the user sees | When |
|---|---|---|
| **ready** | live CTA | route exists / capability unknown |
| **running** | spinner | in flight |
| **done** | check + success toast (+ bell ping) | 2xx |
| **unavailable** | disabled chip, tooltip *"Not available on this backend yet"* | runtime **404/501**, or `capable={false}` |
| **error** | the real error envelope (`getApiErrorMessage`) | any other failure |

Two tiers: a `capable` hint can *pre*-disable (advisory), but the **runtime
404/501 is authoritative** — so a backend-gap CTA needs **zero** redeploy to light
up the moment its route returns 200.

## Use it (the whole adoption is ~10 lines)
```tsx
import { InsightActionButton } from '@/app/shared/insights';
import { applyRecommendation } from '@/app/services/catalog';

<InsightActionButton
  label="Apply"
  onAction={() => applyRecommendation(reco.reco_id)}
  successToast="Recommendation applied"
  pingBell                       // it'll surface on the bell server-side
  onDone={(res) => setApplied(res)}
  confirm={{                     // optional — only for mutating/destructive acts
    title: 'Apply this recommendation?',
    body: reco.title,
    variant: 'warning',
  }}
/>
```

## Files
- `useActionGate.ts` — the state machine (`run(fn)` → ready/running/done/error/unavailable).
- `InsightActionButton.tsx` — the presentational gated button (confirm + toast + bell).
- `@/lib/http-status` — `isUnavailable` / `is404` / `is501` (works for AxiosError **and** the wrapped `ServerError`).

## Don'ts
- Don't render a CTA that calls a route you haven't gated — wrap it here so a 404
  disables it honestly instead of throwing.
- Don't fake "done" for work the backend only *suggested* (e.g. catalog `apply`
  returns a `suggested_call`) — show the next step, mark applied, never "executed".
- Keep `<ConfirmDialog>` for destructive confirms only; everything else is inline
  (per the Popup→Inline UX audit).
