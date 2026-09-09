import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Guess36Client } from '../../components/Guess36Client';
import { DEFAULT_GUESS_36_REWARDS } from '../../lib/guess-36-rules';
import type { Guess36PublicState } from '../../lib/guess-36-types';

const base: Guess36PublicState = {
  enabled: true, enabledModes: ['NUMBER', 'PARITY', 'RANGE'], authenticated: true, eligible: true, serverNow: '2026-09-07T10:00:00.000Z',
  today: { date: '2026-09-07', status: 'OPEN', nextRoundAt: '2026-09-07T18:30:00.000Z', entryClosesAt: '2026-09-07T18:25:00.000Z', rewards: DEFAULT_GUESS_36_REWARDS, entry: null },
  previous: { date: '2026-09-06', status: 'DRAWN', winningNumber: 36, myPick: null, outcome: 'NOT_ENTERED', reward: null },
  history: [{ date: '2026-09-05', winningNumber: 12 }],
  rewardTickets: [{ id: 'ticket', reward: DEFAULT_GUESS_36_REWARDS.EXACT, expiresAt: '2026-09-07T18:30:00.000Z' }],
};

function render(state: Guess36PublicState) {
  return renderToStaticMarkup(React.createElement(Guess36Client, { initialState: state }));
}

test('the original picker renders one board, mode selector, and reward summary', () => {
  const normal = render(base);
  assert.equal((normal.match(/aria-label="Number \d+"/g) ?? []).length, 36);
  assert.equal((normal.match(/aria-label="Pick type"/g) ?? []).length, 1);
  assert.equal((normal.match(/class="guess-36-reward-preview"/g) ?? []).length, 1);
  for (const state of [
    { ...base, authenticated: false },
    { ...base, enabled: false },
    { ...base, today: { ...base.today, entry: { selection: { type: 'EVEN' as const }, createdAt: base.serverNow } } },
  ]) assert.equal((render(state).match(/aria-label="Number \d+"/g) ?? []).length, 0);
});

test('yesterday highlight precedes the picker and preserves lower details for players and visitors', () => {
  for (const authenticated of [true, false]) {
    const html = render({ ...base, authenticated });
    assert.ok(html.indexOf('class="guess-36-header"') < html.indexOf('class="guess-36-yesterday"'));
    assert.ok(html.indexOf('class="guess-36-yesterday"') < html.indexOf('class="guess-36-game"'));
    assert.ok(html.indexOf('class="guess-36-game"') < html.indexOf('class="guess-36-result '));
    assert.match(html, /Yesterday&#x27;s Number/);
    assert.match(html, /<time dateTime="2026-09-06">6 Sept?<\/time>/);
    assert.match(html, /aria-label="Guess 36 result 36">36<\/div>/);
    assert.equal((html.match(/class="guess-36-winning-number"/g) ?? []).length, 1);
    assert.match(html, /No pick for this round/);
    assert.equal(html.includes('winner-summary'), false);
    assert.equal(html.includes('winner yesterday'), false);
    assert.match(html, /Recent Numbers/);
    assert.match(html, /Reward Tickets/);
  }
});

test('pending yesterday shows once without substituting history or exposing an unpublished number', () => {
  const html = render({ ...base, previous: { ...base.previous, status: 'PENDING', outcome: 'PENDING' } });
  assert.equal((html.match(/Result pending/g) ?? []).length, 1);
  assert.equal(html.includes('class="guess-36-winning-number"'), false);
  assert.equal(html.includes('class="guess-36-result '), false);
  assert.equal(html.includes('aria-label="Guess 36 result 36"'), false);
  assert.equal(html.includes('aria-label="Guess 36 result 12"'), false);
});

test('personal winning reward and losing pick remain below the picker', () => {
  for (const outcome of ['WIN', 'LOSS'] as const) {
    const html = render({ ...base, previous: { ...base.previous, outcome, myPick: { type: 'NUMBER', value: outcome === 'WIN' ? 36 : 1 }, reward: outcome === 'WIN' ? DEFAULT_GUESS_36_REWARDS.EXACT : null } });
    const details = html.slice(html.indexOf('class="guess-36-result '), html.indexOf('class="guess-36-history"'));
    assert.ok(details.includes('Your pick:'));
    assert.ok(details.includes(outcome === 'WIN' ? 'You won 60 Minutes Gaming!' : 'Not this time. A new day, a new chance.'));
    assert.equal(details.includes('guess-36-winning-number'), false);
  }
});

test('the cutoff locks new picks while confirmed picks remain visible', () => {
  const closed = { ...base, today: { ...base.today, status: 'CLOSED' as const } };
  const html = render(closed);
  assert.match(html, /Today&#x27;s picks are locked/);
  assert.match(html, /Result at midnight/);
  assert.match(html, /Picks Locked/);
  assert.equal((html.match(/aria-label="Number \d+"/g) ?? []).length, 0);

  const confirmed = render({ ...closed, today: { ...closed.today, entry: { selection: { type: 'ODD' }, createdAt: base.serverNow } } });
  assert.match(confirmed, /You&#x27;re Locked In!/);
  assert.equal(confirmed.includes('Today&#x27;s picks are locked'), false);
});
