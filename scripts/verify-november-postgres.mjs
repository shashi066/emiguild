// Optional local verification tooling: install embedded-postgres outside the repo,
// then set NOVEMBER_PG_MODULE to its dist/index.js. No production URL is read.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

if (!process.env.NOVEMBER_PG_MODULE) throw new Error('Set NOVEMBER_PG_MODULE to the disposable embedded-postgres module.');
const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.NOVEMBER_PG_MODULE).href);
const dir = mkdtempSync(path.join(tmpdir(), 'emiguild-november-pg-'));
const password = randomBytes(18).toString('hex');
const port = 55439;
const database = `emiguild_november_${randomBytes(5).toString('hex')}`;
const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), user: 'postgres', password, port, persistent: true,
  postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => { if (String(message).includes('FATAL')) console.error('PostgreSQL startup failure'); } });
const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, NOVEMBER_TEST_DATABASE_URL: url };
const node = (file, args, options = {}) => execFileSync(process.execPath, [file, ...args], { cwd: process.cwd(), env, stdio: 'inherit', windowsHide: true, ...options });
let client;
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase(database);
  client = pg.getPgClient(database); await client.connect();
  const baseline = path.join(dir, 'before.prisma');
  writeFileSync(baseline, execFileSync('git', ['show', '4f71e06:prisma/schema.production.prisma'], { encoding: 'utf8', windowsHide: true }));
  const sql = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', baseline, '--script'], { env, encoding: 'utf8', windowsHide: true });
  await client.query(sql);
  await client.query(`
    INSERT INTO users(id,name,email,password,"updatedAt") VALUES ('baseline-user','Baseline fixture','baseline@example.test','fixture',NOW());
    INSERT INTO stations(id,name,description,specs,"hourlyRate","updatedAt") VALUES ('baseline-station','Baseline PS5','fixture','fixture',150,NOW());
    INSERT INTO bookings(id,"userId","stationId",date,"startTime","endTime",duration,"totalPrice","updatedAt") VALUES ('baseline-booking','baseline-user','baseline-station','2025-01-01','16:00','17:00',1,150,NOW());
  `);
  await client.query(readFileSync('prisma/migrations/20261028000000_reward_features/migration.sql', 'utf8'));
  const preserved = (await client.query(`SELECT "totalPrice" FROM bookings WHERE id='baseline-booking'`)).rows;
  if (preserved.length !== 1 || preserved[0].totalPrice !== 150) throw new Error('Baseline booking changed.');
  const featureTables = ['reward_receipts','happy_pool','happy_tickets','happy_redemptions','guild_resets','reward_audit'];
  const found = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(row => row.tablename);
  if (!featureTables.every(name => found.includes(name)) || ['happy_accounts','happy_pool_events','november_audit'].some(name => found.includes(name))) throw new Error('Reward schema is not the clean six-table model.');
  const drift = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.production.prisma', '--script'], { env, encoding: 'utf8', windowsHide: true });
  if (drift.includes('CREATE TABLE') || drift.includes('ALTER TABLE') || drift.includes('DROP ')) throw new Error('PostgreSQL migration differs from the production schema.');
  console.log('PostgreSQL: baseline plus single clean reward migration applied; six feature tables; no Prisma schema drift.');
  node('node_modules/prisma/build/index.js', ['generate', '--schema=prisma/schema.production.prisma']);
  node('node_modules/tsx/dist/cli.mjs', ['--test', '--test-concurrency=1', 'test/november/rules.test.ts', 'test/november/integration.test.ts', 'test/november/admin-booking-edit.test.ts', 'test/november/request-client.test.ts']);
  node('test/november/booking-http.test.cjs', []);
  console.log('Disposable PostgreSQL verification passed.');
} finally {
  if (client) await client.end().catch(() => {});
  await pg.stop().catch(() => {});
  node('node_modules/prisma/build/index.js', ['generate', '--schema=prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: 'file:./november-test.db' } });
}
