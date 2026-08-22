import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { caseInsensitiveContains } from '../../lib/prisma-search';

test('builds a portable case-insensitive Prisma contains filter', () => {
  assert.deepEqual(caseInsensitiveContains('MiXeD', 'file:./dev.db'), { contains: 'MiXeD' });
  assert.deepEqual(caseInsensitiveContains('MiXeD', ''), { contains: 'MiXeD' });
  assert.deepEqual(caseInsensitiveContains('MiXeD', 'mysql://example.test/db'), { contains: 'MiXeD' });

  for (const databaseUrl of [
    'postgres://example.test/db',
    'postgresql://example.test/db',
    'prisma://accelerate.prisma-data.net/?api_key=test',
    'prisma+postgres://accelerate.prisma-data.net/?api_key=test',
    '  POSTGRESQL://example.test/db  ',
  ]) {
    assert.deepEqual(
      caseInsensitiveContains('MiXeD', databaseUrl),
      { contains: 'MiXeD', mode: 'insensitive' },
    );
  }
});

test('routes every server-backed text search through the shared helper', () => {
  const paths = [
    '../../app/api/bookings/route.ts',
    '../../lib/armory-marketplace.ts',
    '../../lib/armory.ts',
    '../../lib/tower.ts',
    '../../lib/watch-party.ts',
  ];

  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.equal(source.includes('caseInsensitiveContains'), true, path);
    assert.equal(/\{\s*contains:/.test(source), false, path);
  }

  const towerSource = readFileSync(new URL('../../lib/tower.ts', import.meta.url), 'utf8');
  const armorySource = readFileSync(new URL('../../lib/armory.ts', import.meta.url), 'utf8');
  assert.equal(towerSource.includes("startsWith: `${sourceRefBase}:`"), true);
  assert.equal(armorySource.includes('startsWith: claimDate'), true);
});
