import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceHomeEntryNavigation, createHomeEntryNavigation, shouldShowHomeEntry } from '../../lib/home-entry-policy';

test('direct homepage entry and a new full refresh allow the brand sequence', () => {
  assert.equal(shouldShowHomeEntry(createHomeEntryNavigation('/')), true);
  let state = createHomeEntryNavigation('/');
  state = advanceHomeEntryNavigation(state, '/tower');
  state = advanceHomeEntryNavigation(state, '/');
  assert.equal(shouldShowHomeEntry(state), false);
  assert.equal(shouldShowHomeEntry(createHomeEntryNavigation('/')), true);
});
for (const route of ['/tower', '/daily-spin', '/guess-36', '/armory', '/vault', '/tournaments', '/login']) {
  test(`Home → ${route} → Back to Home skips the branded loader`, () => {
    let state = createHomeEntryNavigation('/');
    state = advanceHomeEntryNavigation(state, route);
    assert.equal(shouldShowHomeEntry(state), false);
    state = advanceHomeEntryNavigation(state, '/');
    assert.equal(shouldShowHomeEntry(state), false);
  });
  test(`direct ${route} entry → first Home visit skips the branded loader`, () => {
    const state = advanceHomeEntryNavigation(createHomeEntryNavigation(route), '/');
    assert.equal(shouldShowHomeEntry(state), false);
  });
}
test('browser Back and Forward never re-enable the initial entry sequence', () => {
  let state = createHomeEntryNavigation('/');
  for (const path of ['/tower', '/', '/tower', '/', '/vault', '/']) {
    state = advanceHomeEntryNavigation(state, path);
    assert.equal(shouldShowHomeEntry(state), false);
  }
});
test('same-path rerenders, query changes, and refreshes within the document do not reset the policy', () => {
  const initial = createHomeEntryNavigation('/');
  assert.equal(advanceHomeEntryNavigation(initial, '/'), initial);
  const returned = advanceHomeEntryNavigation(advanceHomeEntryNavigation(initial, '/vault'), '/');
  assert.equal(advanceHomeEntryNavigation(returned, '/'), returned);
  assert.equal(shouldShowHomeEntry(returned), false);
});
test('unknown initial paths conservatively bypass a branded entry', () => {
  assert.equal(shouldShowHomeEntry(advanceHomeEntryNavigation(createHomeEntryNavigation(null), '/')), false);
});
test('retry and delayed readiness on an internal Home visit cannot re-enable the entry gate', () => {
  const returned = advanceHomeEntryNavigation(createHomeEntryNavigation('/guess-36'), '/');
  for (let i = 0; i < 5; i++) assert.equal(shouldShowHomeEntry(advanceHomeEntryNavigation(returned, '/')), false);
});
