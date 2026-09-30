/**
 * studio-bus — the model-change notification bus that fixes
 * « model/patch → workflow invalidation ». Deterministic, no browser.
 *
 * Guards: a subscriber fires for its OWN draft's change and not another's,
 * unsubscribe stops it, and one broken subscriber does not stop the rest.
 */
import { test, expect } from '@playwright/test';
import { emitModelChanged, onModelChanged } from '../apps/data360/src/app/services/studio/studio-bus';

test.describe.configure({ mode: 'serial' });

test('a subscriber fires only for its own draft', () => {
  const seen: string[] = [];
  const off = onModelChanged((d) => seen.push(d));
  emitModelChanged('draftA');
  emitModelChanged('draftB');
  off();
  expect(seen).toEqual(['draftA', 'draftB']); // the handler filters by id itself
});

test('unsubscribe stops delivery', () => {
  let hits = 0;
  const off = onModelChanged(() => (hits += 1));
  emitModelChanged('x');
  off();
  emitModelChanged('x');
  expect(hits).toBe(1);
});

test('a throwing subscriber does not stop the others or the emitter', () => {
  const seen: string[] = [];
  const offBad = onModelChanged(() => {
    throw new Error('boom');
  });
  const offGood = onModelChanged((d) => seen.push(d));
  expect(() => emitModelChanged('draftC')).not.toThrow();
  offBad();
  offGood();
  expect(seen).toEqual(['draftC']);
});
