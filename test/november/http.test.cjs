const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
async function route(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    plugins: [{ name:'session', setup(b) {
      b.onResolve({filter:/^@\/auth$/}, () => ({path:'auth',namespace:'mock'}));
      b.onLoad({filter:/.*/,namespace:'mock'}, () => ({contents:'export const auth=async()=>globalThis.__happyHttpSession;',loader:'js'}));
    } }] });
  const name = path.join(process.cwd(),'november-api-test.cjs');
  const mod = new Module(name,module);mod.filename=name;mod.paths=module.paths;mod._compile(result.outputFiles[0].text,name);return mod.exports;
}
const request = (body,origin='http://localhost') => new Request('http://localhost/api/happy-tickets/claim',{method:'POST',headers:{origin,'Content-Type':'application/json'},body});
test('Happy Ticket claim rejects unauthenticated, cross-origin and malformed requests',async()=>{
  const claim=await route('app/api/happy-tickets/claim/route.ts');
  globalThis.__happyHttpSession=null;assert.equal((await claim.POST(request('{}'))).status,401);
  globalThis.__happyHttpSession={user:{id:'fixture-user'}};
  assert.equal((await claim.POST(request('{}','https://evil.example'))).status,403);
  assert.equal((await claim.POST(request('{broken'))).status,400);
  assert.equal((await claim.POST(request('{"requestId":"short"}'))).status,400);
  assert.equal((await claim.POST(request('{"requestId":"valid-request-000001","userId":"other"}'))).status,400);
  delete globalThis.__happyHttpSession;
});
test('Happy Ticket admin operations and receipt recovery reject unauthorized access',async()=>{
  const admin=await route('app/api/admin/happy-tickets/route.ts');
  globalThis.__happyHttpSession=null;
  assert.equal((await admin.GET(new Request('http://localhost/api/admin/happy-tickets'))).status,403);
  assert.equal((await admin.POST(request('{}'))).status,403);
  globalThis.__happyHttpSession={user:{id:'fixture-admin',role:'ADMIN'}};
  assert.equal((await admin.POST(request('{}','https://evil.example'))).status,403);
  const receipts=await route('app/api/rewards/receipts/[operation]/[requestId]/route.ts');
  assert.equal((await receipts.GET(new Request('http://localhost'),{params:Promise.resolve({operation:'CHALLENGE_EDIT',requestId:'valid-request-000001'})})).status,404);
  assert.equal((await receipts.GET(new Request('http://localhost'),{params:Promise.resolve({operation:'HAPPY_CLAIM',requestId:'short'})})).status,400);
  delete globalThis.__happyHttpSession;
});
