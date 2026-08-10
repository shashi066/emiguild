import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchPremierLeagueFixtureMatches,
  ukFixtureKickoffToUtcIso,
} from '../../lib/watch-party';

test('loads all Premier League 2026-27 fixtures from local JSON', async () => {
  const state = await fetchPremierLeagueFixtureMatches();

  assert.equal(state.competitionCode, 'PL');
  assert.equal(state.competitionName, 'Premier League');
  assert.equal(state.season, 2026);
  assert.equal(state.matches.length, 380);
});

test('filters Premier League fixtures by date range and matchweek', async () => {
  const byDate = await fetchPremierLeagueFixtureMatches({
    dateFrom: '2026-08-21',
    dateTo: '2026-08-21',
  });
  assert.equal(byDate.matches.length, 1);
  assert.equal(byDate.matches[0].providerMatchId, 'PL2627-001');

  const byMatchweek = await fetchPremierLeagueFixtureMatches({ matchday: '1' });
  assert.equal(byMatchweek.matches.length, 10);
  assert.ok(byMatchweek.matches.every((match) => match.matchday === 1));
});

test('filters Premier League fixtures by team name', async () => {
  const state = await fetchPremierLeagueFixtureMatches({ team: 'Arsenal' });

  assert.equal(state.matches.length, 38);
  assert.equal(state.teams.length, 20);
  assert.ok(
    state.matches.every((match) => (
      match.homeTeam.includes('Arsenal') || match.awayTeam.includes('Arsenal')
    )),
  );
});

test('returns team dropdown options without loading fixtures', async () => {
  const state = await fetchPremierLeagueFixtureMatches({ teamsOnly: 'true' });

  assert.equal(state.matches.length, 0);
  assert.equal(state.teams.length, 20);
  assert.ok(state.teams.includes('Arsenal'));
  assert.ok(state.teams.includes('Liverpool'));
});

test('converts UK kickoff time with Europe London timezone rules', () => {
  assert.equal(
    ukFixtureKickoffToUtcIso('2026-08-21', '20:00'),
    '2026-08-21T19:00:00.000Z',
  );
  assert.equal(
    ukFixtureKickoffToUtcIso('2026-12-01', '20:00'),
    '2026-12-01T20:00:00.000Z',
  );
});

test('keeps TBA Premier League fixtures selectable without a kickoff', async () => {
  const state = await fetchPremierLeagueFixtureMatches({ dateFrom: '2026-08-22', dateTo: '2026-08-22' });
  const tba = state.matches.find((match) => match.providerMatchId === 'PL2627-003');

  assert.ok(tba);
  assert.equal(tba.kickoffAt, null);
  assert.equal(tba.status, 'date_published_provisional');
});
