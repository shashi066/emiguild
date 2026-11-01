const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
async function loadRoute() {
  const result = await build({ entryPoints: ['app/api/daily-spin/route.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name: 'session', setup(build) {
      build.onResolve({ filter: /^@\/auth$/ }, () => ({ path: 'auth', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const auth = async () => globalThis.__spinSession;', loader: 'js' }));
    } }] });
  const filename = path.join(process.cwd(), 'spin-api-test.cjs');
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = module.paths;
  mod._compile(result.outputFiles[0].text, filename); return mod.exports;
}
test('Spin handlers reject unauthenticated, cross-origin and malformed requests before touching rewards', async () => {
  const route = await loadRoute();
  const request = (body, origin = 'http://localhost') => new Request('http://localhost/api/daily-spin', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body });
  globalThis.__spinSession = null;
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.POST(request('{}'))).status, 401);
  globalThis.__spinSession = { user: { id: 'fixture-owner' } };
  assert.equal((await route.POST(request('{}', 'https://evil.example'))).status, 403);
  assert.equal((await route.POST(request('{broken'))).status, 400);
  assert.equal((await route.POST(request(JSON.stringify({ requestId: 'bad' })))).status, 400);
  assert.equal((await route.POST(request(JSON.stringify({ result: 'LEGENDARY', pity: 29 })))).status, 400);
  delete globalThis.__spinSession;
});
