import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeWorkflowEngine } from '../engine/core.mjs';
import { FileRunStore } from '../engine/file-store.mjs';
import { HarnessExecutor } from '../engine/harness-executor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY = 64 * 1024;

function send(response, status, value, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function body(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') fail(415, 'application/json required');
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY) fail(413, 'request body too large');
  }
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') fail(400, 'JSON object required');
    return value;
  } catch (error) {
    if (error.status) throw error;
    fail(400, 'invalid JSON');
  }
}

export async function createApp({ token, store = new FileRunStore(), harness = new HarnessExecutor(), fixture, definition } = {}) {
  if (!token || token.length < 16) throw new Error('WORKBENCH_TOKEN must contain at least 16 characters');
  fixture ??= JSON.parse(await readFile(path.join(ROOT, 'integration/project-flow.example.json'), 'utf8'));
  definition ??= JSON.parse(await readFile(path.join(ROOT, 'engine/examples/development-delivery.json'), 'utf8'));
  const engine = new NativeWorkflowEngine({ store, harness });
  const project = fixture.project;
  const item = id => fixture.workItems.find(value => value.id === id);
  const node = id => fixture.nodes.find(value => value.id === id);
  const binding = nodeId => fixture.automationBindings.find(value => value.projectNodeId === nodeId && value.enabled);

  async function handle(request, response) {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/health' && request.method === 'GET') return send(response, 200, { status: 'ok' });
      if (request.headers.authorization !== `Bearer ${token}`) return send(response, 401, { error: 'unauthorized' });
      if (!pathname.startsWith('/api/')) fail(404, 'route not found');
      const parts = pathname.split('/').filter(Boolean);
      if (request.method === 'GET' && pathname === '/api/projects') return send(response, 200, { projects: [{ ...project, source: 'fixture' }] });
      if (request.method === 'GET' && parts[1] === 'projects' && parts[2] === project.id && parts[3] === 'flow' && parts.length === 4) {
        return send(response, 200, { project, nodes: fixture.nodes, relations: fixture.relations, automationBindings: fixture.automationBindings, source: 'fixture' });
      }
      if (request.method === 'GET' && parts[1] === 'projects' && parts[2] === project.id && parts[3] === 'nodes' && parts.length === 5) {
        const value = node(parts[4]);
        if (!value) fail(404, 'node not found');
        return send(response, 200, { node: value, workItems: fixture.workItems.filter(work => work.projectNodeId === value.id), automationBinding: binding(value.id) ?? null, source: 'fixture' });
      }
      if (parts[1] === 'work-items' && parts.length >= 3) {
        const value = item(parts[2]);
        if (!value) fail(404, 'work item not found');
        if (request.method === 'GET' && parts.length === 3) return send(response, 200, { workItem: value, latestRun: (await store.list({ workItemId: value.id, limit: 1 }))[0] ?? null, source: 'fixture-with-local-runs' });
        if (parts[3] === 'runs' && parts.length === 4) {
          if (request.method === 'GET') return send(response, 200, { runs: await store.list({ workItemId: value.id }) });
          if (request.method === 'POST') {
            const selected = binding(value.projectNodeId);
            if (!selected || selected.definitionId !== definition.id) fail(409, 'no enabled workflow binding for work item');
            const input = await body(request);
            if (typeof input.actorId !== 'string' || !input.actorId || input.actorId.length > 128 || typeof input.idempotencyKey !== 'string' || !input.idempotencyKey || input.idempotencyKey.length > 128) fail(400, 'actorId and idempotencyKey required (max 128 characters)');
            const existing = await store.findByIdempotencyKey(input.idempotencyKey);
            if (existing && (existing.workItemId !== value.id || existing.definitionId !== definition.id)) fail(409, 'idempotency key belongs to another workflow request');
            const run = await engine.enqueue(definition, { actorId: input.actorId, idempotencyKey: input.idempotencyKey, workItemId: value.id, context: { projectName: project.name, workItemTitle: value.title } });
            return send(response, 202, { run }, { location: `/api/runs/${run.id}` });
          }
        }
      }
      if (parts[1] === 'runs' && parts[2] && parts.length <= 4) {
        const run = await store.get(parts[2]);
        if (!run) fail(404, 'run not found');
        if (request.method === 'GET' && parts.length === 3) return send(response, 200, { run });
        if (request.method === 'POST' && parts[3] === 'decisions') {
          const input = await body(request);
          if (typeof input.actorId !== 'string' || !input.actorId || !['approve', 'reject'].includes(input.decision) || !Number.isInteger(input.expectedRevision)) fail(400, 'actorId, decision and expectedRevision required');
          if (run.status !== 'waiting_for_human') fail(409, 'run is not waiting for a decision');
          if (run.revision !== input.expectedRevision) fail(409, 'workflow run revision conflict');
          const updated = await engine.submitDecision(definition, { runId: run.id, waitingStepId: run.waitingStepId, actorId: input.actorId, decision: input.decision, expectedRevision: input.expectedRevision, comment: typeof input.comment === 'string' ? input.comment : undefined });
          return send(response, 200, { run: updated });
        }
        if (request.method === 'POST' && parts[3] === 'cancel') {
          const input = await body(request);
          if (typeof input.actorId !== 'string' || !input.actorId) fail(400, 'actorId required');
          return send(response, 200, { run: await engine.cancel(run.id, input.actorId) });
        }
      }
      fail(404, 'route not found');
    } catch (error) {
      const status = error.status ?? (error.message?.startsWith('invalid workflow run id') ? 400 : 500);
      send(response, status, { error: status === 500 ? 'internal server error' : error.message });
      if (status === 500) process.stderr.write(`${error.stack ?? error}\n`);
    }
  }

  return { server: createServer(handle), handle, engine };
}
