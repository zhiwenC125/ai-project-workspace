import { randomUUID } from 'node:crypto';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const STEP_TYPES = new Set(['start', 'harness', 'decision', 'end']);

export function validateDefinition(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('workflow definition must be an object');
  if (!definition.id || !definition.version || !definition.startStepId) {
    throw new Error('workflow definition requires id, version and startStepId');
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new Error('workflow definition requires steps');
  }
  const steps = new Map();
  for (const step of definition.steps) {
    if (!step?.id || !STEP_TYPES.has(step.type)) throw new Error(`invalid workflow step: ${step?.id ?? '<missing>'}`);
    if (steps.has(step.id)) throw new Error(`duplicate workflow step: ${step.id}`);
    steps.set(step.id, step);
  }
  if (!steps.has(definition.startStepId)) throw new Error(`start step not found: ${definition.startStepId}`);
  for (const step of steps.values()) {
    const targets = step.type === 'decision' ? Object.values(step.on ?? {}) : step.next ? [step.next] : [];
    if (step.type !== 'end' && targets.length === 0) throw new Error(`step has no outgoing route: ${step.id}`);
    for (const target of targets) if (!steps.has(target)) throw new Error(`step ${step.id} targets missing step ${target}`);
  }
  return steps;
}

function event(run, type, details = {}) {
  return {
    sequence: run.events.length,
    occurredAt: new Date().toISOString(),
    type,
    ...details,
  };
}

export class NativeWorkflowEngine {
  constructor({ store, harness }) {
    this.store = store;
    this.harness = harness;
    this.active = new Map();
    this.pendingStarts = new Map();
  }

  async enqueue(definition, request) {
    const steps = validateDefinition(definition);
    if (!request?.idempotencyKey || !request?.workItemId || !request?.actorId) {
      throw new Error('start requires idempotencyKey, workItemId and actorId');
    }
    const key = request.idempotencyKey;
    if (this.pendingStarts.has(key)) return this.pendingStarts.get(key);
    const pending = (async () => {
      const existing = await this.store.findByIdempotencyKey(request.idempotencyKey);
      if (existing) {
        if (existing.definitionId !== definition.id || existing.workItemId !== request.workItemId) throw new Error('idempotency key belongs to another workflow request');
        return existing;
      }
      const run = this.newRun(definition, request);
      await this.save(run);
      const execution = Promise.resolve().then(() => this.advance(definition, steps, run)).catch(async error => {
        const current = await this.store.get(run.id);
        if (current?.status === 'cancelled') return current;
        run.status = 'failed';
        run.events.push(event(run, 'run.failed', { reason: error.message }));
        await this.save(run);
        return run;
      }).finally(() => this.active.delete(run.id));
      this.active.set(run.id, execution);
      return structuredClone(run);
    })().finally(() => this.pendingStarts.delete(key));
    this.pendingStarts.set(key, pending);
    return pending;
  }

  newRun(definition, request) {
    const run = {
      id: `workflow-${randomUUID()}`,
      definitionId: definition.id,
      definitionVersion: definition.version,
      workItemId: request.workItemId,
      actorId: request.actorId,
      idempotencyKey: request.idempotencyKey,
      status: 'queued',
      currentStepId: definition.startStepId,
      waitingStepId: null,
      revision: 0,
      context: structuredClone(request.context ?? {}),
      artifacts: [],
      events: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    run.events.push(event(run, 'run.queued'));
    return run;
  }

  async start(definition, request) {
    const steps = validateDefinition(definition);
    if (!request?.idempotencyKey || !request?.workItemId || !request?.actorId) {
      throw new Error('start requires idempotencyKey, workItemId and actorId');
    }
    const existing = await this.store.findByIdempotencyKey(request.idempotencyKey);
    if (existing) {
      if (existing.definitionId !== definition.id || existing.workItemId !== request.workItemId) throw new Error('idempotency key belongs to another workflow request');
      return existing;
    }
    const run = this.newRun(definition, request);
    await this.save(run);
    return this.advance(definition, steps, run);
  }

  async submitDecision(definition, input) {
    const steps = validateDefinition(definition);
    const run = await this.requireRun(input.runId);
    if (run.status !== 'waiting_for_human' || run.waitingStepId !== input.waitingStepId) {
      throw new Error('run is not waiting on the requested step');
    }
    if (run.revision !== input.expectedRevision) throw new Error('workflow run revision conflict');
    const step = steps.get(run.waitingStepId);
    const target = step.on?.[input.decision];
    if (!target) throw new Error(`decision ${input.decision} is not supported by ${step.id}`);
    run.events.push(event(run, 'decision.submitted', {
      stepId: step.id,
      actorId: input.actorId,
      decision: input.decision,
      ...(input.comment ? { comment: input.comment } : {}),
    }));
    run.waitingStepId = null;
    run.currentStepId = target;
    run.status = 'running';
    await this.save(run);
    return this.advance(definition, steps, run);
  }

  async cancel(runId, actorId) {
    const run = await this.requireRun(runId);
    if (TERMINAL.has(run.status)) return run;
    await this.harness.cancel?.(runId);
    run.status = 'cancelled';
    run.events.push(event(run, 'run.cancelled', { actorId }));
    await this.save(run);
    return run;
  }

  async getRun(runId) {
    return this.requireRun(runId);
  }

  async advance(definition, steps, run) {
    const current = await this.store.get(run.id);
    if (current?.status === 'cancelled') return current;
    run.status = 'running';
    while (!TERMINAL.has(run.status)) {
      const step = steps.get(run.currentStepId);
      run.events.push(event(run, 'step.started', { stepId: step.id, stepType: step.type }));
      await this.save(run);

      if (step.type === 'start') {
        this.completeStep(run, step.id);
        run.currentStepId = step.next;
      } else if (step.type === 'harness') {
        const task = interpolate(step.task, run.context);
        const result = await this.harness.run({
          workflowRunId: run.id,
          stepId: step.id,
          task,
          workingDirectory: step.workingDirectory,
          sessionId: run.harnessSessionId,
        });
        const latest = await this.store.get(run.id);
        if (latest?.status === 'cancelled') return latest;
        if (result.sessionId) run.harnessSessionId = result.sessionId;
        if (result.output) run.context[step.outputKey ?? step.id] = result.output;
        if (Array.isArray(result.artifacts)) run.artifacts.push(...result.artifacts);
        if (result.status !== 'succeeded') {
          run.status = 'failed';
          run.events.push(event(run, 'step.failed', { stepId: step.id, reason: result.reason ?? 'HARNESS_FAILED' }));
          break;
        }
        this.completeStep(run, step.id);
        run.currentStepId = step.next;
      } else if (step.type === 'decision') {
        run.status = 'waiting_for_human';
        run.waitingStepId = step.id;
        run.events.push(event(run, 'run.waiting_for_human', { stepId: step.id }));
        break;
      } else if (step.type === 'end') {
        this.completeStep(run, step.id);
        run.status = step.outcome === 'failed' ? 'failed' : 'succeeded';
        run.events.push(event(run, `run.${run.status}`));
        break;
      }
    }
    await this.save(run);
    return run;
  }

  completeStep(run, stepId) {
    run.events.push(event(run, 'step.succeeded', { stepId }));
  }

  async save(run) {
    run.revision += 1;
    run.updatedAt = new Date().toISOString();
    await this.store.save(run);
  }

  async requireRun(runId) {
    const run = await this.store.get(runId);
    if (!run) throw new Error(`workflow run not found: ${runId}`);
    return run;
  }
}

function interpolate(template, context) {
  if (typeof template !== 'string' || template.length === 0) throw new Error('harness step requires a task');
  return template.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_match, key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], context);
    if (value === undefined) throw new Error(`workflow context value not found: ${key}`);
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}
