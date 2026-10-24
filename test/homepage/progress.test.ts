import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomepageProgress, estimateHomepageProgress } from '../../lib/homepage-progress';

function setup(t: any, reduced = false, minimumDurationMs = 0) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const controller = createHomepageProgress({ minimumDurationMs, now: () => Date.now(), frame: callback => setTimeout(callback, 16) as unknown as number, cancelFrame: id => clearTimeout(id), reducedMotion: () => reduced });
  controller.start();
  t.after(() => controller.dispose());
  return controller;
}
test('estimated stages reach 70 and 90 but never 100', () => {
  assert.equal(estimateHomepageProgress(0), 0);
  assert.equal(estimateHomepageProgress(900), 70);
  assert.equal(estimateHomepageProgress(1500), 80);
  assert.equal(estimateHomepageProgress(2100), 90);
  assert.equal(estimateHomepageProgress(60000), 99);
});
test('slow data holds at 99 and changes status after ten visible seconds', t => {
  const c = setup(t);
  t.mock.timers.tick(2200);
  assert.equal(c.getSnapshot().value, 90);
  assert.equal(c.getSnapshot().phase, 'loading');
  t.mock.timers.tick(7800);
  assert.equal(c.getSnapshot().slow, true);
  assert.equal(c.getSnapshot().value, 99);
});
test('server data alone cannot complete a slowly hydrating hero', t => {
  const c = setup(t);
  c.mark('page'); t.mock.timers.tick(12000);
  assert.equal(c.getPhase(), 'loading');
  c.mark('hero');
  assert.equal(c.getPhase(), 'loading');
  t.mock.timers.tick(16);
  assert.equal(c.getSnapshot().value, 100);
  assert.equal(c.getPhase(), 'ready');
});
test('fast responses skip estimation and do not wait for logo or background resources', t => {
  const c = setup(t);
  c.mark('hero'); c.mark('page');
  t.mock.timers.tick(16);
  assert.deepEqual(c.getSnapshot(), { value: 100, phase: 'ready', slow: false });
});
test('readiness signals can arrive before the boundary effect starts', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  const c = createHomepageProgress({ minimumDurationMs: 0, now: () => Date.now(), frame: cb => setTimeout(cb, 16) as unknown as number, cancelFrame: id => clearTimeout(id) });
  c.mark('hero'); c.mark('page'); c.start();
  t.mock.timers.tick(16); assert.equal(c.getPhase(), 'ready'); c.dispose();
});
test('hidden time does not advance estimation or the slow warning', t => {
  const c = setup(t);
  t.mock.timers.tick(500); c.setVisible(false);
  const value = c.getSnapshot().value;
  t.mock.timers.tick(20000);
  assert.equal(c.getSnapshot().value, value);
  assert.equal(c.getSnapshot().slow, false);
  c.setVisible(true); t.mock.timers.tick(400);
  assert.equal(c.getSnapshot().value, 70);
});
test('completion queued in a hidden tab resumes when visible', t => {
  const c = setup(t);
  c.setVisible(false); c.mark('page'); c.mark('hero');
  t.mock.timers.tick(1000); assert.equal(c.getPhase(), 'loading');
  c.setVisible(true); t.mock.timers.tick(16); assert.equal(c.getPhase(), 'ready');
});
test('failure cancels queued success; retry requires fresh signals', t => {
  const c = setup(t);
  c.mark('page'); c.mark('hero'); c.fail();
  t.mock.timers.tick(10000); assert.equal(c.getPhase(), 'error');
  assert.notEqual(c.getSnapshot().value, 100);
  c.reset(); c.mark('page'); t.mock.timers.tick(2100);
  assert.equal(c.getPhase(), 'loading');
  c.mark('hero'); t.mock.timers.tick(16); assert.equal(c.getPhase(), 'ready');
});
test('ordinary background updates cannot restart a completed entry', t => {
  const c = setup(t);
  c.mark('page'); c.mark('hero'); t.mock.timers.tick(16);
  c.mark('page'); t.mock.timers.tick(10000);
  assert.equal(c.getPhase(), 'ready'); assert.equal(c.getSnapshot().value, 100);
});
test('reduced motion uses discrete static milestones', t => {
  const c = setup(t, true);
  t.mock.timers.tick(800); assert.equal(c.getSnapshot().value, 0);
  t.mock.timers.tick(100); assert.equal(c.getSnapshot().value, 70);
  t.mock.timers.tick(1100); assert.equal(c.getSnapshot().value, 70);
  t.mock.timers.tick(100); assert.equal(c.getSnapshot().value, 90);
});
test('dispose clears animation and progress callbacks', t => {
  const c = setup(t);
  c.mark('page'); c.mark('hero'); c.dispose();
  const snapshot = c.getSnapshot();
  t.mock.timers.tick(30000); assert.equal(c.getSnapshot(), snapshot);
});
test('duplicate readiness signals schedule only one completion frame', t => {
  const c = setup(t);
  let notifications = 0;
  const unsubscribe = c.subscribe(() => notifications++);
  c.mark('hero'); c.mark('hero'); c.mark('page'); c.mark('page');
  t.mock.timers.tick(16); assert.equal(notifications, 1); unsubscribe();
});

test('re-entry after disposal starts a new sequence, including retained route segments', t => {
  const c = setup(t);
  c.mark('page'); c.mark('hero'); t.mock.timers.tick(16);
  assert.equal(c.getPhase(), 'ready'); c.dispose();
  assert.equal(c.getSnapshot().value, 0);
  c.mark('page'); c.mark('hero'); c.start();
  assert.equal(c.getPhase(), 'loading');
  t.mock.timers.tick(16); assert.equal(c.getPhase(), 'ready');
});

test('ready homepage waits seven seconds then reveals on the next frame', t => {
  const c = setup(t, false, 7000);
  c.mark('page'); c.mark('hero');
  t.mock.timers.tick(6999); assert.equal(c.getPhase(), 'loading');
  assert.equal(c.getSnapshot().value, 99);
  t.mock.timers.tick(1); assert.equal(c.getPhase(), 'loading');
  t.mock.timers.tick(16); assert.equal(c.getPhase(), 'ready');
});
test('late readiness holds the completed estimate without adding another seven seconds', t => {
  const c = setup(t, false, 7000);
  t.mock.timers.tick(12000); assert.equal(c.getSnapshot().value, 99);
  c.mark('page'); c.mark('hero'); t.mock.timers.tick(16);
  assert.equal(c.getPhase(), 'ready');
});
test('leaving during the minimum cancels its completion callback', t => {
  const c = setup(t, false, 7000);
  c.mark('page'); c.mark('hero'); t.mock.timers.tick(1000); c.dispose();
  t.mock.timers.tick(10000); assert.equal(c.getPhase(), 'loading');
  assert.equal(c.getSnapshot().value, 0);
});
test('reduced motion retains the seven-second entry minimum', t => {
  const c = setup(t, true, 7000);
  c.mark('page'); c.mark('hero'); t.mock.timers.tick(2100);
  assert.equal(c.getSnapshot().value, 90); assert.equal(c.getPhase(), 'loading');
  t.mock.timers.tick(4900); t.mock.timers.tick(16); assert.equal(c.getPhase(), 'ready');
});

test('the last stretch visits each integer from 90 to 99 and never invents 100', t => {
  const c = setup(t, false, 7000);
  t.mock.timers.tick(2100);
  for (let value = 90; value <= 99; value++) {
    assert.equal(c.getSnapshot().value, value);
    assert.equal(c.getPhase(), 'loading');
    t.mock.timers.tick(500);
  }
  t.mock.timers.tick(20000);
  assert.equal(c.getSnapshot().value, 99);
});

test('progress starts independently of image loading, with no image readiness signal', t => {
  const c = setup(t, false, 7000);
  assert.equal(c.getSnapshot().value, 0);
  t.mock.timers.tick(100);
  assert.ok(c.getSnapshot().value > 0);
  assert.equal(c.getPhase(), 'loading');
  // A missing logo never prevents the page/hero signals from completing entry.
  c.mark('page'); c.mark('hero');
  t.mock.timers.tick(6900); t.mock.timers.tick(16);
  assert.equal(c.getSnapshot().value, 100);
});
