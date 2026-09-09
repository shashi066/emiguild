import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

const tableRenames = [
  ['lucky_hour_rounds', 'guess_36_rounds'],
  ['lucky_hour_entries', 'guess_36_entries'],
] as const;
const settingRenames = [
  ['lucky_hour_enabled', 'guess_36_enabled', 'Guess 36 Enabled'],
  ['lucky_hour_rewards', 'guess_36_rewards', 'Guess 36 Rewards'],
] as const;
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function renameLocalGuess36(databaseUrl: string, backupDirectory = tmpdir()) {
  if (!databaseUrl.startsWith('file:')) throw new Error('Only a local SQLite file: database can be renamed.');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const backupPath = join(backupDirectory, `emiguild-before-guess36-${randomUUID()}.db`);
  try {
    // VACUUM INTO produces a consistent standalone backup, including committed WAL data.
    await db.$executeRawUnsafe(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    const result = await db.$transaction(async (tx) => {
      const tables = await tx.$queryRaw<Array<{ name: string }>>`SELECT name FROM sqlite_master WHERE type = 'table'`;
      const exists = (name: string) => tables.some((table) => table.name === name);
      const oldCount = tableRenames.filter(([old]) => exists(old)).length;
      const newCount = tableRenames.filter(([, next]) => exists(next)).length;
      if (!((oldCount === 2 && newCount === 0) || (oldCount === 0 && newCount === 2))) {
        throw new Error('Conflicting or incomplete Guess 36 tables; no changes applied.');
      }
      let renamed = oldCount === 2;

      const before = [];
      for (const [old, next] of tableRenames) {
        before.push(await tx.$queryRawUnsafe(`SELECT * FROM ${identifier(oldCount ? old : next)} ORDER BY id`));
      }
      for (const [old, next] of tableRenames) {
        if (oldCount) await tx.$executeRawUnsafe(`ALTER TABLE ${identifier(old)} RENAME TO ${identifier(next)}`);
      }
      const indexes = await tx.$queryRaw<Array<{ name: string; sql: string }>>`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'index' AND tbl_name IN ('guess_36_rounds', 'guess_36_entries') AND sql IS NOT NULL
      `;
      const [entriesTable] = await tx.$queryRaw<Array<{ sql: string }>>`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'guess_36_entries'
      `;
      // SQLite renames tables but not named constraints. Rebuild this leaf table without changing its rows.
      if (entriesTable.sql.includes('lucky_hour_')) {
        const temporarySql = entriesTable.sql.replace(
          /^CREATE TABLE ("guess_36_entries"|guess_36_entries)\s*\(/i,
          'CREATE TABLE "guess36_entries_rename" (',
        ).replaceAll('lucky_hour_', 'guess_36_');
        assert.ok(temporarySql.includes('CREATE TABLE "guess36_entries_rename" ('), 'Unexpected entry table definition.');
        const columns = await tx.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("guess_36_entries")');
        const columnList = columns.map((column) => identifier(column.name)).join(', ');
        await tx.$executeRawUnsafe(temporarySql);
        await tx.$executeRawUnsafe(`INSERT INTO "guess36_entries_rename" (${columnList}) SELECT ${columnList} FROM "guess_36_entries"`);
        await tx.$executeRawUnsafe('DROP TABLE "guess_36_entries"');
        await tx.$executeRawUnsafe('ALTER TABLE "guess36_entries_rename" RENAME TO "guess_36_entries"');
        renamed = true;
      }
      for (const index of indexes) {
        await tx.$executeRawUnsafe(`DROP INDEX IF EXISTS ${identifier(index.name)}`);
        await tx.$executeRawUnsafe(index.sql.replaceAll('lucky_hour_', 'guess_36_'));
      }
      for (const [old, next, label] of settingRenames) {
        const oldSetting = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM settings WHERE key = ${old}`;
        if (!oldSetting.length) continue;
        const conflict = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM settings WHERE key = ${next}`;
        if (conflict.length) throw new Error(`Conflicting setting ${next}; no changes applied.`);
        await tx.$executeRaw`UPDATE settings SET key = ${next}, label = ${label} WHERE key = ${old}`;
        renamed = true;
      }
      const tickets = await tx.$queryRaw<Array<{ id: string; rewardSnapshot: string }>>`
        SELECT id, rewardSnapshot FROM armory_tickets WHERE source = 'LUCKY_HOUR'
      `;
      for (const ticket of tickets) {
        const snapshot = JSON.parse(ticket.rewardSnapshot);
        if (['EMI 36', 'EMI Lucky 36', 'EMI Lucky Hour', 'LUCKY_HOUR'].includes(snapshot.source)) snapshot.source = 'Guess 36';
        await tx.$executeRaw`
          UPDATE armory_tickets SET source = 'GUESS_36', rewardSnapshot = ${JSON.stringify(snapshot)} WHERE id = ${ticket.id}
        `;
      }
      for (const [index, [, next]] of tableRenames.entries()) {
        assert.deepEqual(await tx.$queryRawUnsafe(`SELECT * FROM ${identifier(next)} ORDER BY id`), before[index]);
      }
      const violations = await tx.$queryRawUnsafe<Array<unknown>>('PRAGMA foreign_key_check');
      assert.equal(violations.length, 0, 'Foreign key verification failed; rename rolled back.');
      return { renamed: renamed || tickets.length > 0, tickets: tickets.length };
    }, { timeout: 30000 });
    return { ...result, backupPath };
  } catch (error) {
    console.error(`Database backup retained at ${backupPath}`);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnvConfig(process.cwd());
  renameLocalGuess36(process.env.DATABASE_URL ?? '').then(console.log).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
