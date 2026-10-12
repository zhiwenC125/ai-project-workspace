import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeWorkflowEngine, validateDefinition } from './core.mjs';

class MemoryStore {
  runs = new Map();
  async save(run) { this.runs.set(run.id, structuredClone(run)); }
  async get(id) { const run = this.runs.get(id); return run && structuredClone(run); }
  async findByIdempotencyKey(key) {
    const run = [...this.runs.values()].find(item => item.idempotencyKey === key);
    return run && structuredClone(run);
  }
}

const definition = {
  id: 'delivery',
  version: '1',
  startStepId: 'start',
  steps: [
    { id: 'start', type: 'start', next: 'agent' },
    { id: 'agent', type: 'harness', task: 'Review {{title}}', outputKey: 'review', next: 'approval' },
    { id: 'approval', type: 'decision', on: { approve: 'done', reject: 'failed' } },
    { id: 'done', type: 'end', outcome: 'succeeded' },
    { id: 'failed', type: 'end', outcome: 'failed' },
  ],
};

test('runs Harness once, waits for a decision, and resumes to completion', async () => {
  const calls = [];
  const engine = new NativeWorkflowEngine({
    store: new MemoryStore(),
    harness: { run: async request => {
      calls.push(request);
      return { status: 'succeeded', sessionId: 'session-1', output: 'ready', artifacts: [] };
    } },
  });
  const waiting = await engine.start(definition, {
    workItemId: 'WS-1',
    actorId: 'user-1',
    idempotencyKey: 'key-1',
    context: { title: 'workspace' },
  });
  assert.equal(waiting.status, 'waiting_for_human');
  assert.equal(waiting.context.review, 'ready');
  assert.equal(calls.length, 1);

  const completed = await engine.submitDecision(definition, {
    runId: waiting.id,
    waitingStepId: 'approval',
    actorId: 'reviewer-1',
    decision: 'approve',
    expectedRevision: waiting.revision,
  });
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.harnessSessionId, 'session-1');
});

test('returns the original run for a repeated idempotency key', async () => {
  let calls = 0;
  const engine = new NativeWorkflowEngine({
    store: new MemoryStore(),
    harness: { run: async () => {
      calls += 1;
      return { status: 'succeeded', output: 'ready' };
    } },
  });
  const request = { workItemId: 'WS-2', actorId: 'user-1', idempotencyKey: 'same', context: { title: 'x' } };
  const first = await engine.start(definition, request);
  const second = await engine.start(definition, request);
  assert.equal(first.id, second.id);
  assert.equal(calls, 1);
});

test('rejects a missing workflow target', () => {
  assert.throws(() => validateDefinition({
    id: 'invalid', version: '1', startStepId: 'start',
    steps: [{ id: 'start', type: 'start', next: 'missing' }],
  }), /missing step/);
});
