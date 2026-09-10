import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addIstDateDays,
  getIstDateKey,
  getGuess36TicketExpiry,
  getGuess36EntryCutoff,
  getPreviousIstDateKey,
  isGuess36EntryOpen,
  isValidIstDateKey,
} from '../../lib/guess-36-clock';

test('uses server-authoritative IST calendar boundaries', () => {
  assert.equal(getIstDateKey(new Date('2035-02-03T18:29:59.999Z')), '2035-02-03');
  assert.equal(getIstDateKey(new Date('2035-02-03T18:30:00.000Z')), '2035-02-04');
  assert.equal(getPreviousIstDateKey(new Date('2035-02-03T18:30:00.000Z')), '2035-02-03');
  assert.equal(addIstDateDays('2036-02-28', 1), '2036-02-29');
});

test('locks daily entries for the final five IST minutes', () => {
  const beforeCutoff = new Date('2035-02-03T18:24:59.999Z');
  const cutoff = new Date('2035-02-03T18:25:00.000Z');
  assert.equal(getGuess36EntryCutoff(beforeCutoff).toISOString(), cutoff.toISOString());
  assert.equal(isGuess36EntryOpen(beforeCutoff), true);
  assert.equal(isGuess36EntryOpen(cutoff), false);
  assert.equal(isGuess36EntryOpen(new Date('2035-02-03T18:29:59.999Z')), false);
  assert.equal(isGuess36EntryOpen(new Date('2035-02-03T18:30:00.000Z')), true);
});

test('expires rewards at the end of the draw day in IST', () => {
  assert.equal(
    getGuess36TicketExpiry(new Date('2035-02-04T00:00:00.000Z')).toISOString(),
    '2035-02-04T18:30:00.000Z',
  );
  assert.equal(isValidIstDateKey('2035-02-03'), true);
  assert.equal(isValidIstDateKey('2035-02-30'), false);
  assert.equal(isValidIstDateKey('03-02-2035'), false);
});
