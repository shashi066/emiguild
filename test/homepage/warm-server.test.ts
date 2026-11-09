import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('lib/warm-server.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function browser(storage = new Map<string, string>()) {
  let now = 1_000_000_000_000;
  const calls: { url: string; options: RequestInit }[] = [];
  const context = {
    exports: {} as { warmServer: () => void }, window: {} as object | undefined,
    navigator: { onLine: true, connection: { saveData: false } },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } },
    Date: class extends Date { static now() { return now; } },
    fetch: async (url: string, options: RequestInit) => { calls.push({ url, options }); },
  };
  vm.runInNewContext(code, context);
  return { context, calls, warm: () => context.exports.warmServer(), advance: (ms: number) => { now += ms; } };
}

test('warm-up avoids server rendering, offline and Data Saver requests', () => {
  const fixture = browser();
  fixture.context.window = undefined; fixture.warm();
  fixture.context.window = {}; fixture.context.navigator.onLine = false; fixture.warm();
  fixture.context.navigator.onLine = true; fixture.context.navigator.connection.saveData = true; fixture.warm();
  assert.equal(fixture.calls.length, 0);
});

test('hover, press and idle events share one request per two-minute window', () => {
  const fixture = browser();
  fixture.warm(); fixture.warm(); fixture.warm(); assert.equal(fixture.calls.length, 1);
  fixture.advance(119_999); fixture.warm(); assert.equal(fixture.calls.length, 1);
  fixture.advance(1); fixture.warm(); assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].url, '/api/warm');
  assert.equal(fixture.calls[0].options.cache, 'no-store');
});

test('a page reload preserves the tab warm-up limit', () => {
  const storage = new Map<string, string>(); browser(storage).warm();
  const restored = browser(storage); restored.warm(); assert.equal(restored.calls.length, 0);
  restored.advance(120_000); restored.warm(); assert.equal(restored.calls.length, 1);
});

test('blocked storage and failed networking do not throw or cause repeated warm-ups', async () => {
  const fixture = browser();
  fixture.context.sessionStorage.getItem = () => { throw Error('blocked'); };
  fixture.context.sessionStorage.setItem = () => { throw Error('blocked'); };
  fixture.context.fetch = async (url, options) => { fixture.calls.push({ url, options }); throw Error('offline'); };
  assert.doesNotThrow(() => { fixture.warm(); fixture.warm(); });
  await Promise.resolve(); assert.equal(fixture.calls.length, 1);
});
