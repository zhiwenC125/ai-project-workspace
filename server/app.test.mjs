import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { FileRunStore } from '../engine/file-store.mjs';
import { createApp } from './app.mjs';

test('local API requires a token and runs a bound work item through approval', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workbench-api-test-'));
  const calls = [];
  const { handle } = await createApp({
    token: '0123456789abcdef',
    store: new FileRunStore(directory),
    harness: { run: async request => {
      calls.push(request);
      return { status: 'succeeded', output: 'ready', sessionId: 'session-test' };
    } },
  });
  const request = async (url, options = {}) => {
    const incoming = Readable.from(options.body ? [options.body] : []);
    incoming.url = url;
    incoming.method = options.method ?? 'GET';
    incoming.headers = options.headers ?? {};
    const outgoing = { status: 200, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(data) { this.value = JSON.parse(data); } };
    await handle(incoming, outgoing);
    return outgoing;
  };
  const api = (url, options = {}) => request(url, { ...options, headers: { authorization: 'Bearer 0123456789abcdef', ...(options.body ? { 'content-type': 'application/json' } : {}) } });
  try {
    assert.equal((await request('/api/projects')).status, 401);
    const flow = (await api('/api/projects/workspace-mvp/flow')).value;
    assert.equal(flow.nodes.length, 5);
    assert.equal(flow.source, 'fixture');
    const node = (await api('/api/projects/workspace-mvp/nodes/development')).value;
    assert.equal(node.workItems.length, 7);
    const start = () => api('/api/work-items/WS-128/runs', { method: 'POST', body: JSON.stringify({ actorId: 'user-1', idempotencyKey: 'request-1' }) });
    const first = (await start()).value;
    const second = (await start()).value;
    assert.equal(first.run.id, second.run.id);
    let current;
    for (let count = 0; count < 50; count += 1) {
      current = (await api(`/api/runs/${first.run.id}`)).value.run;
      if (current.status === 'waiting_for_human') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(current.status, 'waiting_for_human');
    assert.equal(calls.length, 1);
    assert.match(calls[0].task, /WS-128|GitHub/);
    const invalid = await api(`/api/runs/${current.id}/decisions`, { method: 'POST', body: JSON.stringify({ actorId: 'reviewer', decision: 'approve', expectedRevision: -1 }) });
    assert.equal(invalid.status, 409);
    const approved = await api(`/api/runs/${current.id}/decisions`, { method: 'POST', body: JSON.stringify({ actorId: 'reviewer', decision: 'approve', expectedRevision: current.revision }) });
    assert.equal(approved.value.run.status, 'succeeded');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
