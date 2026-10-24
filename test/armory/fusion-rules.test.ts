import assert from 'node:assert/strict';
import test from 'node:test';
import { FUSION_ODDS, normalizeFusion, rollFusionTier, type FusionTier } from '../../lib/armory-fusion-rules';

test('every integer roll matches the published tier probabilities and boundaries', () => {
  for (const tier of Object.keys(FUSION_ODDS) as FusionTier[]) {
    const counts: Record<string, number> = {};
    for (let roll = 0; roll < 100; roll++) { const result = rollFusionTier(tier, roll); counts[result] = (counts[result] ?? 0) + 1; }
    assert.deepEqual(counts, FUSION_ODDS[tier]);
  }
  for (const roll of [-1, 100, 0.5, NaN]) assert.throws(() => rollFusionTier('BRONZE', roll));
});
test('normalization combines duplicate ingredients and rejects malformed requests', () => {
  const requestId = 'test-request-0000001';
  assert.deepEqual(normalizeFusion({ requestId, ingredients: [{ artifactId: 'b', quantity: 1 }, { artifactId: 'a', quantity: 1 }, { artifactId: 'b', quantity: 1 }] }).ingredients, [{ artifactId: 'a', quantity: 1 }, { artifactId: 'b', quantity: 2 }]);
  for (const quantity of [0, -1, 1, 2, 4, 3.1, '3']) assert.throws(() => normalizeFusion({ requestId, ingredients: [{ artifactId: 'a', quantity }] }));
  assert.throws(() => normalizeFusion(null));
  assert.throws(() => normalizeFusion({ requestId: 'bad', ingredients: [{ artifactId: 'a', quantity: 3 }] }));
});
