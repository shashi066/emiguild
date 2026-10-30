const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
async function component() {
  const result = await build({ entryPoints: ['components/admin/AdminHappyTickets.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, jsx: 'automatic', plugins: [{ name: 'render-fixtures', setup(b) {
    b.onResolve({ filter: /next-auth\/react/ }, () => ({ path: 'session', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: "export const useSession=()=>({data:{user:{id:'admin'}},status:'authenticated'});", loader: 'js' }));
    b.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {};', loader: 'js' }));
  } }] });
  const name = path.join(process.cwd(), 'admin-render-fixture.cjs');
  const mod = new Module(name, module); mod.filename = name; mod.paths = module.paths;
  mod._compile(result.outputFiles[0].text, name);
  return mod.exports.AdminHappyTickets;
}
const config = { stationIds: ['ps5'], days: [1,2,3,4,5], startTime: '16:00', endTime: '23:00' };
test('authorized server snapshot renders personal totals without a client loading gate', async () => {
  const Admin = await component();
  const data = { section: 'tickets', page: 1, hasNext: false, pool: { version: 1, config }, counts: { accounts: 22, available: 110, banked: 0, issued: 8, redeemed: 0, expired: 0 }, stations: [], tickets: [], resets: [], events: [], nextCursor: null, members: [], member: null };
  const html = renderToStaticMarkup(React.createElement(Admin, { initialData: data, initialOwnerId: 'admin' }));
  assert.match(html, /Account totals/); assert.match(html, /110/);
  assert.match(html, /No claimed tickets/);
  assert.doesNotMatch(html, /Search name or email|Resets for existing accounts/);
  assert.doesNotMatch(html, /Loading tickets|Ticket pool/);
});
test('server read failure renders a useful retry instead of an endless spinner', async () => {
  const Admin = await component();
  const html = renderToStaticMarkup(React.createElement(Admin, { initialOwnerId: 'admin', initialError: 'Could not load tickets. Try again.' }));
  assert.match(html, /Could not load tickets/); assert.match(html, /Retry/);
  assert.doesNotMatch(html, /Loading tickets/);
});
