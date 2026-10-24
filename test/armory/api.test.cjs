const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const { NextRequest } = require('next/server');

async function route(name) {
  const result = await build({ entryPoints: [`app/api/armory/${name}/route.ts`], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'test-session', setup(build) {
      build.onResolve({ filter: /^@\/auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const auth = async () => globalThis.__armoryTestSession;', loader: 'js' }));
    } }],
  });
  const filename = path.join(process.cwd(), `test-${name}-route.cjs`);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  mod._compile(result.outputFiles[0].text, filename);
  return mod.exports;
}

test('fusion routes enforce session ownership and reject invalid requests', async () => {
  const fusion = await route('fusion');
  const request = (url, body) => new NextRequest(`http://localhost/api/armory/${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  globalThis.__armoryTestSession = null;
  assert.equal((await fusion.POST(request('fusion', {}))).status, 401);
  assert.equal((await fusion.GET(new NextRequest('http://localhost/api/armory/fusion?requestId=known-receipt-0001'))).status, 401);
  globalThis.__armoryTestSession = { user: { id: 'test-auth-user' } };
  assert.equal((await fusion.POST(request('fusion', { ingredients: [] }))).status, 400);
  assert.equal((await fusion.GET(new NextRequest('http://localhost/api/armory/fusion?requestId=bad'))).status, 400);
  delete globalThis.__armoryTestSession;
});
