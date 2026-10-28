import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrainBridge } from '../../assets/bridge.js';

const deployment = {
  hostOrigin: 'https://app.example', apiOrigin: 'https://api.example',
  workspaceId: 'workspace-example', homeAppId: 'home-example',
};

function fixture(overrides = {}) {
  const listeners = new Set();
  const posts = [];
  const calls = [];
  const frame = {
    parent: { postMessage: (...args) => posts.push(args) },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({
      jsonrpc: '2.0', id: JSON.parse(options.body).id, result: { tools: [] },
    }) };
  };
  const bridge = createBrainBridge({ ...deployment, frame, fetch, ...overrides });
  function reply(data = {}, envelope = {}) {
    for (const listener of [...listeners]) listener({
      source: frame.parent, origin: deployment.hostOrigin,
      data: { type: 'ub:token', token: 'opaque.signature', appId: deployment.homeAppId,
        workspaceId: deployment.workspaceId, apiOrigin: deployment.apiOrigin, ...data },
      ...envelope,
    });
  }
  return { bridge, calls, posts, reply, listeners };
}

test('binds token delivery to parent, origins, Home app and workspace before dispatch', async () => {
  const f = fixture();
  const result = f.bridge.listTools();
  assert.deepEqual(f.posts, [[{ type: 'ub:ready' }, deployment.hostOrigin]]);
  f.reply({}, { source: {} });
  f.reply({}, { origin: 'https://untrusted.example' });
  f.reply({}, { origin: 'null' });
  f.reply({ apiOrigin: 'https://untrusted.example' });
  f.reply({ workspaceId: 'another-workspace' });
  f.reply({ appId: 'another-app' });
  await Promise.resolve();
  assert.equal(f.calls.length, 0);
  assert.equal(f.listeners.size, 1);
  f.reply();
  assert.deepEqual(await result, { tools: [] });
  assert.equal(f.calls[0].url, `${deployment.apiOrigin}/api/brain/mcp`);
  assert.equal(f.listeners.size, 0);
});

test('requests a current token on each call and sends no ambient credential or cache', async () => {
  const f = fixture();
  for (const token of ['first.signature', 'second.signature']) {
    const result = f.bridge.listTools();
    f.reply({ token });
    await result;
    const options = f.calls.at(-1).options;
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
  }
  assert.equal(f.posts.length, 2);
});

test('rejects missing/revoked or malformed bridge tokens without API calls', async () => {
  const f = fixture();
  for (const token of [null, '', 'native-session-or-service-secret']) {
    const result = f.bridge.listTools();
    f.reply({ token });
    await assert.rejects(result, { code: 'authentication_required' });
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.listeners.size, 0);
});

test('cancellation and disposal clean up pending handshakes and forbid late dispatch', async () => {
  const f = fixture();
  const controller = new AbortController();
  const first = f.bridge.listTools({ signal: controller.signal });
  controller.abort();
  await assert.rejects(first, { code: 'cancelled' });
  const second = f.bridge.listTools();
  f.bridge.dispose();
  await assert.rejects(second, { code: 'cancelled' });
  f.reply();
  await assert.rejects(f.bridge.listTools(), { code: 'cancelled' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.listeners.size, 0);
});

test('times out without leaving a listener or dispatching a request', async () => {
  const f = fixture({ timeoutMs: 5 });
  await assert.rejects(f.bridge.listTools(), { code: 'bridge_timeout' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.listeners.size, 0);
});

test('does not retry HTTP, JSON-RPC, tool or network errors or expose raw error text', async () => {
  const cases = [
    { response: { ok: false, status: 429 }, code: 'budget_exhausted', status: 429 },
    { response: { ok: false, status: 403 }, code: 'access_unavailable', status: 403 },
    { body: { error: { message: 'private provider details' } }, code: 'rpc_error' },
    { body: { result: { isError: true, content: [{ text: 'private provider details' }] } }, code: 'tool_error' },
    { body: { jsonrpc: '1.0', result: {} }, code: 'invalid_response' },
    { network: true, code: 'request_failed' },
  ];
  for (const scenario of cases) {
    let calls = 0;
    const f = fixture({ fetch: async (_url, options) => {
      calls++;
      if (scenario.network) throw new Error('private provider details');
      return scenario.response ?? { ok: true, json: async () => ({
        jsonrpc: '2.0', id: JSON.parse(options.body).id, ...scenario.body,
      }) };
    } });
    const result = f.bridge.callTool('searchBrain', { query: 'fictional example' });
    f.reply();
    await assert.rejects(result, error => error.code === scenario.code
      && error.message === scenario.code && error.status === scenario.status);
    assert.equal(calls, 1);
  }
});

test('cancellation during response decoding cannot return protected output', async () => {
  let decode;
  let started;
  const decoding = new Promise(resolve => { started = resolve; });
  const f = fixture({ fetch: async (_url, options) => ({ ok: true, json: () => {
    started();
    return new Promise(resolve => { decode = () => resolve({ jsonrpc: '2.0',
      id: JSON.parse(options.body).id, result: { protected: 'fictional value' } }); });
  } }) });
  const controller = new AbortController();
  const result = f.bridge.listTools({ signal: controller.signal });
  f.reply();
  await decoding;
  controller.abort();
  decode();
  await assert.rejects(result, { code: 'cancelled' });
});

test('requires configured exact deployment origins, IDs and a parent frame', () => {
  for (const values of [
    { apiOrigin: '' }, { hostOrigin: 'https://app.example/path' },
    { apiOrigin: 'http://public.example' }, { workspaceId: '' },
    { homeAppId: '../other-app' }, { timeoutMs: Infinity },
  ]) {
    assert.throws(() => fixture(values), { code: 'deployment_not_configured' });
  }
  const frame = {};
  frame.parent = frame;
  assert.throws(() => createBrainBridge({ ...deployment, frame }), { code: 'deployment_not_configured' });
});
