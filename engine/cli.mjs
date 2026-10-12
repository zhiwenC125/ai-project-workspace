#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { NativeWorkflowEngine } from './core.mjs';
import { FileRunStore } from './file-store.mjs';
import { HarnessExecutor } from './harness-executor.mjs';

const [command, first, second] = process.argv.slice(2);
const engine = new NativeWorkflowEngine({ store: new FileRunStore(), harness: new HarnessExecutor() });

async function definitionFrom(file) {
  return JSON.parse(await readFile(path.resolve(file), 'utf8'));
}

try {
  if (command === 'start') {
    const definition = await definitionFrom(first);
    const run = await engine.start(definition, {
      workItemId: process.env.WORK_ITEM_ID ?? 'WS-DEMO',
      actorId: process.env.ACTOR_ID ?? 'local-user',
      idempotencyKey: process.env.IDEMPOTENCY_KEY ?? `demo-${Date.now()}`,
      context: { projectName: 'AI 研发项目工作台', workItemTitle: process.env.WORK_ITEM_TITLE ?? '工作流演示' },
    });
    process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  } else if (command === 'status') {
    process.stdout.write(`${JSON.stringify(await engine.getRun(first), null, 2)}\n`);
  } else if (command === 'decide') {
    const definition = await definitionFrom(first);
    const run = await engine.getRun(second);
    const decision = process.env.DECISION ?? 'approve';
    const next = await engine.submitDecision(definition, {
      runId: run.id,
      waitingStepId: run.waitingStepId,
      actorId: process.env.ACTOR_ID ?? 'local-user',
      decision,
      comment: process.env.COMMENT,
      expectedRevision: run.revision,
    });
    process.stdout.write(`${JSON.stringify(next, null, 2)}\n`);
  } else {
    throw new Error('usage: engine/cli.mjs start <definition> | status <runId> | decide <definition> <runId>');
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
