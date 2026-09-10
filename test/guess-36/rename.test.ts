import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { renameLocalGuess36 } from '../../scripts/rename-local-guess-36';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'guess36-rename-test-'));
  const url = `file:${join(directory, 'fixture.db').replaceAll('\\', '/')}`;
  const db = new PrismaClient({ datasources: { db: { url } } });
  for (const sql of [
    'CREATE TABLE lucky_hour_rounds (id TEXT PRIMARY KEY, roundDate TEXT, rewardsSnapshot TEXT, updatedAt TEXT)',
    'CREATE UNIQUE INDEX lucky_hour_rounds_roundDate_key ON lucky_hour_rounds(roundDate)',
    'CREATE TABLE lucky_hour_entries (id TEXT PRIMARY KEY, roundId TEXT, selectedNumber INTEGER, CONSTRAINT lucky_hour_entries_roundId_fkey FOREIGN KEY (roundId) REFERENCES lucky_hour_rounds(id))',
    'CREATE INDEX lucky_hour_entries_roundId_idx ON lucky_hour_entries(roundId)',
    'CREATE TABLE settings (id TEXT PRIMARY KEY, key TEXT UNIQUE, value TEXT, label TEXT, updatedAt TEXT)',
    'CREATE TABLE armory_tickets (id TEXT PRIMARY KEY, source TEXT, rewardSnapshot TEXT, code TEXT, expiresAt TEXT, updatedAt TEXT)',
  ]) await db.$executeRawUnsafe(sql);
  await db.$executeRaw`INSERT INTO lucky_hour_rounds VALUES ('round', '2026-09-01', '{"EXACT":{"name":"Stored reward"}}', 'original')`;
  await db.$executeRaw`INSERT INTO lucky_hour_entries VALUES ('entry', 'round', 35)`;
  await db.$executeRaw`INSERT INTO settings VALUES ('setting', 'lucky_hour_enabled', 'false', 'Lucky Hour Enabled', 'original')`;
  const snapshot = JSON.stringify({ source: 'EMI 36', reward: { type: 'PASS', name: 'Stored Pass' } });
  await db.$executeRaw`INSERT INTO armory_tickets VALUES ('ticket', 'LUCKY_HOUR', ${snapshot}, 'ELH-EXISTING', 'deadline', 'original')`;
  await db.$executeRaw`INSERT INTO armory_tickets VALUES ('tower', 'TOWER', ${snapshot}, 'TWR-EXISTING', 'deadline', 'original')`;
  return { db, url, directory, close: async () => { await db.$disconnect(); await rm(directory, { recursive: true }); } };
}

test('local rename preserves entries, snapshots, ticket codes, expiry, and unrelated sources', async () => {
  const f = await fixture();
  try {
    const rounds = await f.db.$queryRaw`SELECT * FROM lucky_hour_rounds`;
    const entries = await f.db.$queryRaw`SELECT * FROM lucky_hour_entries`;
    const tower = await f.db.$queryRaw`SELECT * FROM armory_tickets WHERE source = 'TOWER'`;
    const result = await renameLocalGuess36(f.url, f.directory);
    assert.equal(result.renamed, true);
    assert.deepEqual(await f.db.$queryRaw`SELECT * FROM guess_36_rounds`, rounds);
    assert.deepEqual(await f.db.$queryRaw`SELECT * FROM guess_36_entries`, entries);
    assert.deepEqual(await f.db.$queryRaw`SELECT * FROM armory_tickets WHERE source = 'TOWER'`, tower);
    assert.deepEqual(await f.db.$queryRaw`SELECT key, value, label, updatedAt FROM settings`, [
      { key: 'guess_36_enabled', value: 'false', label: 'Guess 36 Enabled', updatedAt: 'original' },
    ]);
    const [ticket] = await f.db.$queryRaw<Array<{ code: string; rewardSnapshot: string; expiresAt: string; updatedAt: string }>>`
      SELECT code, rewardSnapshot, expiresAt, updatedAt FROM armory_tickets WHERE source = 'GUESS_36'
    `;
    assert.deepEqual(ticket, { code: 'ELH-EXISTING', rewardSnapshot: JSON.stringify({ source: 'Guess 36', reward: { type: 'PASS', name: 'Stored Pass' } }), expiresAt: 'deadline', updatedAt: 'original' });
    const backup = new PrismaClient({ datasources: { db: { url: `file:${result.backupPath.replaceAll('\\', '/')}` } } });
    try { assert.deepEqual(await backup.$queryRaw`SELECT * FROM lucky_hour_entries`, entries); }
    finally { await backup.$disconnect(); }
    assert.deepEqual(await f.db.$queryRaw`PRAGMA foreign_key_check`, []);
    const indexes = await f.db.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type = 'index'`;
    assert.ok(indexes.some((index) => index.name === 'guess_36_rounds_roundDate_key'));
    assert.ok(indexes.every((index) => !index.name.includes('lucky_hour')));
    const schema = await f.db.$queryRaw<Array<{ sql: string | null }>>`SELECT sql FROM sqlite_master`;
    assert.ok(schema.every((item) => !item.sql?.includes('lucky_hour')));
    assert.equal((await renameLocalGuess36(f.url, f.directory)).renamed, false);
  } finally { await f.close(); }
});

test('local rename rejects conflicting settings atomically and refuses non-SQLite databases', async () => {
  await assert.rejects(renameLocalGuess36('postgresql://localhost/validation'), /Only a local SQLite/);
  const f = await fixture();
  try {
    await f.db.$executeRaw`INSERT INTO settings VALUES ('conflict', 'guess_36_enabled', 'true', 'Existing', 'original')`;
    await assert.rejects(renameLocalGuess36(f.url, f.directory), /Conflicting setting/);
    assert.deepEqual(await f.db.$queryRaw`SELECT selectedNumber FROM lucky_hour_entries`, [{ selectedNumber: 35 }]);
    assert.deepEqual(await f.db.$queryRaw`SELECT source FROM armory_tickets WHERE id = 'ticket'`, [{ source: 'LUCKY_HOUR' }]);
    assert.deepEqual(await f.db.$queryRaw`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guess_36_rounds'`, []);
  } finally { await f.close(); }
});
