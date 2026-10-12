import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { publicHelpRequest, publicChatSchema, generatePublicHelp, createPublicChatHandler, type PublicChatDependencies } from '../../lib/assistant/chat';
import { ASSISTANT_CHAT_MODES } from '../../lib/assistant/chat-mode';
import { readChatMemory, writeChatMemory, clearChatMemory } from '../../lib/assistant/chat-memory';
import { AssistantGenerationError, chatErrorCategory, logChatFailure } from '../../lib/assistant/chat-errors';
import { parsePublicAnswer } from '../../lib/assistant/public-help';
import type { AssistantMessage } from '../../types/assistant';

function storageFixture() {
  const data = new Map<string, string>();
  return { data, source: () => ({ get length() { return data.size; }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }) };
}

test('identity, model and tab-memory facts are server-owned in every mode', () => {
  for (const mode of ASSISTANT_CHAT_MODES) {
    const request = publicHelpRequest('Which model?', [], {}, 'configured-model', mode);
    assert.match(request.instructions, /Emiily, EmiGuild's AI assistant, powered by OpenAI/);
    assert.match(request.instructions, /not ChatGPT/);
    assert.match(request.instructions, /Server-configured model: "configured-model"/);
    assert.match(request.instructions, /latest 12 successful/);
    assert.match(request.instructions, /Sign-out, account changes and Start over/);
    assert.equal(request.store, false);
  }
});

test('long answers and history share the 8000-character boundary', () => {
  const content = 'a'.repeat(8000);
  assert.equal(parsePublicAnswer(JSON.stringify({ scope: 'general', answer: content, linkIds: [] }), 'GENERAL_ASSISTANT').content, content);
  assert.equal(publicChatSchema.safeParse({ message: 'continue', history: [{ role: 'assistant', content }] }).success, true);
  assert.equal(publicChatSchema.safeParse({ message: 'continue', history: [{ role: 'assistant', content: content + 'a' }] }).success, false);
  assert.throws(() => parsePublicAnswer(JSON.stringify({ scope: 'general', answer: content + 'a', linkIds: [] }), 'GENERAL_ASSISTANT'));
});

test('tab memory restores bounded display and successful context, isolates accounts and clears chat only', () => {
  const { data, source } = storageFixture();
  const messages: AssistantMessage[] = Array.from({ length: 30 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: String(index) }));
  writeChatMemory('one', messages, messages, source);
  const saved = readChatMemory('one', source)!;
  assert.equal(saved.messages.length, 24); assert.equal(saved.transcript.length, 12);
  assert.equal(saved.messages[0].content, '6'); assert.equal(saved.transcript[0].content, '18');
  assert.equal(readChatMemory('two', source), null);
  data.set('unrelated', 'keep');
  clearChatMemory(source);
  assert.equal(readChatMemory('one', source), null); assert.equal(data.get('unrelated'), 'keep');
});

test('failed display entries stay outside restored AI context; restored navigation uses approved links', () => {
  const { source } = storageFixture();
  const success: AssistantMessage[] = [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }];
  writeChatMemory('one', [...success, { role: 'assistant', content: 'Failed', links: [{ label: 'bad', href: 'https://evil.test' }] }], success, source);
  const saved = readChatMemory('one', source)!;
  assert.equal(saved.messages.length, 3); assert.equal(saved.transcript.length, 2);
  assert.deepEqual(saved.messages[2].links, []);
});

test('malformed, oversized, wrong-version and disabled tab storage fall back to temporary memory', () => {
  const { data, source } = storageFixture();
  for (const raw of ['{', JSON.stringify({ version: 2, messages: [], transcript: [] }), 'a'.repeat(400001), JSON.stringify({ version: 1, messages: [{ role: 'system', content: 'bad' }], transcript: [] })]) {
    data.set('emi-assistant-chat-v1:one', raw);
    assert.equal(readChatMemory('one', source), null);
    assert.equal(data.size, 0);
  }
  const disabled = () => { throw new Error('Storage denied'); };
  assert.equal(readChatMemory('one', disabled), null);
  assert.doesNotThrow(() => writeChatMemory('one', [], [], disabled));
  assert.doesNotThrow(() => clearChatMemory(disabled));
});

test('provider responses classify truncation and malformed output, accept long answers, and never retry', async (t) => {
  let calls = 0;
  let status = 'completed';
  let text = JSON.stringify({ scope: 'general', answer: 'a'.repeat(5000), linkIds: [] });
  let fail = false;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (fail) return new Response(JSON.stringify({ error: { message: 'private provider error', type: 'server_error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ id: 'resp_test', object: 'response', status, output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 10 } }), { headers: { 'Content-Type': 'application/json' } });
  });
  const generate = () => generatePublicHelp({ model: 'test', apiKey: 'sk-test', dailyLimit: 10, chatMode: 'GENERAL_ASSISTANT' }, { message: '10 examples', history: [] }, {}, new AbortController().signal, () => {});
  assert.equal((await generate()).content.length, 5000);
  status = 'incomplete';
  await assert.rejects(generate(), (error) => chatErrorCategory(error) === 'incomplete_output');
  status = 'completed'; text = '{';
  await assert.rejects(generate(), (error) => chatErrorCategory(error) === 'invalid_response');
  fail = true;
  await assert.rejects(generate(), (error) => chatErrorCategory(error) === 'provider_failure');
  assert.equal(calls, 4);
  assert.equal(chatErrorCategory(new OpenAI.APIConnectionTimeoutError()), 'timeout');
});

test('every failure emits a safe category, keeps exactly one debit, and logs no exception content', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  for (const category of ['provider_failure', 'timeout', 'incomplete_output', 'invalid_response'] as const) {
    let debits = 0, releases = 0, calls = 0;
    const usage = { date: '2026-10-12', limit: 10, remaining: 9, resetsAt: '2026-10-12T18:30:00Z' };
    const deps: PublicChatDependencies = {
      currentUser: async () => ({ id: 'private-account' }), enabled: async () => true,
      config: async () => ({ model: 'test', apiKey: 'sk-private', dailyLimit: 10 }), knowledge: async () => ({}),
      usage: async () => usage, reserve: async () => { debits++; return { ...usage, allowed: true }; },
      release: async () => { releases++; }, record: async (_actor, counters) => { assert.equal(counters.errorCount, 1); },
      generate: async () => { calls++; throw new AssistantGenerationError(category); },
    };
    const body = await (await createPublicChatHandler(deps)(new NextRequest('http://localhost/api/assistant/chat', { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'private chat' }) }))).text();
    assert.match(body, new RegExp(`"code":"${category}"`));
    assert.match(body, /used one AI allowance/);
    assert.deepEqual([debits, releases, calls], [1, 0, 1]);
  }
  logChatFailure(new Error('sk-private private chat private-account'), 'provider_failure');
  assert.doesNotMatch(JSON.stringify(logs), /sk-private|private chat|private-account/);
});
