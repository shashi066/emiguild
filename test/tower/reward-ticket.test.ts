import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getArtifactRewardTicketDisplay,
  getTowerRewardTicketDisplay,
} from '../../lib/reward-ticket';

test('normalizes Artifact and Tower rewards for one shared ticket card', () => {
  const artifact = getArtifactRewardTicketDisplay({
    id: 'artifact-ticket',
    rewardSnapshot: JSON.stringify({
      rewardType: 'PERCENT_DISCOUNT',
      discountPercentage: 15,
      description: '15% off a booking',
    }),
    set: { name: 'Ember Set' },
  });
  assert.deepEqual(artifact, {
    id: 'artifact-ticket',
    kind: 'discount',
    label: 'Booking Discount',
    value: '15%',
    description: '15% off a booking',
    origin: 'Ember Set',
    expiry: 'Expires end of today',
  });

  const tower = getTowerRewardTicketDisplay({
    id: 'tower-ticket',
    reward: { name: '30 Minutes Racing', type: 'RACING_TIME', value: 30 },
    expiresAt: '2030-08-22T18:30:00.000Z',
  });
  assert.equal(tower.kind, 'racing');
  assert.equal(tower.value, '30 min');
  assert.equal(tower.origin, 'Tower of Rewards');
  assert.match(tower.expiry, /^Valid until /);
  assert.equal(JSON.stringify(tower).includes('code'), false);
});
