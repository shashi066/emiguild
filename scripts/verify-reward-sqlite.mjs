// Fresh SQLite verification only. Never opens the local preview or production database.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const database = path.resolve('prisma/november-test-clean.db');
const directory = mkdtempSync(path.join(tmpdir(), 'emiguild-reward-sqlite-'));
const baseline = path.join(directory, 'baseline.prisma');
writeFileSync(baseline, execFileSync('git', ['show', '4f71e06:prisma/schema.prisma'], { encoding: 'utf8', windowsHide: true }));
const env = { ...process.env, DATABASE_URL: 'file:' + database.replaceAll('\\', '/') };
const sql = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', baseline, '--script'], { env, encoding: 'utf8', windowsHide: true });
const baselineSql = path.join(directory, 'baseline.sql');
writeFileSync(baselineSql, sql);
execFileSync('python', ['-X', 'utf8', '-c', `
import sqlite3,pathlib,sys
database=pathlib.Path(sys.argv[1]).resolve()
assert database.name=='november-test-clean.db' and database.parent.name=='prisma'
con=sqlite3.connect(database)
# This exact disposable test database may be recreated. No other file is opened.
con.close()
database.unlink()
con=sqlite3.connect(database)
con.executescript(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8'))
con.execute('INSERT INTO users(id,name,email,password,updatedAt) VALUES(?,?,?,?,?)',('baseline-user','Baseline fixture','baseline@example.test','fixture',0))
con.execute('INSERT INTO stations(id,name,description,specs,hourlyRate,updatedAt) VALUES(?,?,?,?,?,?)',('baseline-station','Baseline PS5','fixture','fixture',150,0))
con.execute('INSERT INTO bookings(id,userId,stationId,date,startTime,endTime,duration,totalPrice,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)',('baseline-booking','baseline-user','baseline-station','2025-01-01','16:00','17:00',1,150,0))
con.commit()
con.executescript(pathlib.Path('prisma/migrations/20261028000000_reward_features/migration.sqlite.sql').read_text(encoding='utf-8'))
con.execute('UPDATE users SET happyLastClaimedAt=? WHERE id=?',(123456789,'baseline-user'))
con.execute('INSERT INTO happy_tickets(id,userId,rulesSnapshot,expiresAt) VALUES(?,?,?,?)',('preserved-ticket','baseline-user','{}',1893456000000))
con.execute('INSERT INTO happy_redemptions(id,ticketId,bookingId,activeBookingId,activeTicketId,discount) VALUES(?,?,?,?,?,?)',('preserved-use','preserved-ticket','baseline-booking','baseline-booking','preserved-ticket',150))
con.execute('INSERT INTO guild_resets(id,kind,status,createdById,reason) VALUES(?,?,?,?,?)',('shared-legacy','BANKED','PENDING','baseline-user','Legacy fixture'))
con.commit()
con.executescript(pathlib.Path('prisma/migrations/20261029000000_personal_happy_tickets/migration.sqlite.sql').read_text(encoding='utf-8'))
con.execute('INSERT INTO happy_pool(id,version,config,updatedAt) VALUES(?,?,?,?)',('main',7,'{"stationIds":["baseline-station"],"days":[1,2],"startTime":"16:00","endTime":"23:00"}',123456789))
con.commit()
con.executescript(pathlib.Path('prisma/migrations/20261029010000_happy_settings/migration.sqlite.sql').read_text(encoding='utf-8'))
import json
saved=json.loads(con.execute("select value from settings where key='happy_ticket_config'").fetchone()[0])
assert saved['version']==7 and saved['config']['stationIds']==['baseline-station']
tables={r[0] for r in con.execute("select name from sqlite_master where type='table'")}
assert {'reward_receipts','happy_tickets','happy_redemptions','guild_resets','reward_audit'} <= tables
assert not ({'happy_pool','happy_accounts','happy_pool_events','november_audit'} & tables)
assert con.execute('select totalPrice from bookings where id=?',('baseline-booking',)).fetchone()[0]==150
assert con.execute('select happyLastClaimedAt,happyRateWindowAt,happyRateCount from users where id=?',('baseline-user',)).fetchone()==(123456789,None,0)
assert con.execute('select happyAvailable from users where id=?',('baseline-user',)).fetchone()[0]==5
assert con.execute('select status from guild_resets where id=?',('shared-legacy',)).fetchone()[0]=='CANCELLED'
assert con.execute('select count(*) from happy_redemptions where id=?',('preserved-use',)).fetchone()[0]==1
assert not con.execute('pragma foreign_key_check').fetchall()
try:
 con.execute('UPDATE users SET happyAvailable=6 WHERE id=?',('baseline-user',))
 raise AssertionError('Pool constraint missing')
except sqlite3.IntegrityError: pass
con.close()
print('SQLite: baseline plus reward and personal-balance migrations; five tables; baseline user/booking preserved; personal balance constraint and foreign keys passed.')
`, database, baselineSql], { env, stdio: 'inherit', windowsHide: true });
const drift = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-url', env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { env, encoding: 'utf8', windowsHide: true });
if (drift.includes('CREATE TABLE') || drift.includes('ALTER TABLE') || drift.includes('DROP ')) throw new Error('SQLite migration differs from schema.');
console.log('SQLite: no Prisma schema drift. Test database: ' + database);
