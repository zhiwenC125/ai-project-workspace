#!/usr/bin/env node

import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const DEFAULT_DSH = process.env.DSH_COMMAND ?? '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh';
const DEFAULT_CWD = process.env.DSH_WORKING_DIRECTORY ?? process.cwd();
const DEFAULT_PATCH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deepseek-headless.patch.yml');
const CATALOG_PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'codex-catalog-ready.mjs');

function parseArgs(argv) {
  const options = { command: 'run', cwd: DEFAULT_CWD, dsh: DEFAULT_DSH, patch: DEFAULT_PATCH };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--probe') options.command = 'probe';
    else if (arg === '--task') options.task = argv[++index];
    else if (arg === '--cwd') options.cwd = argv[++index];
    else if (arg === '--dsh') options.dsh = argv[++index];
    else if (arg === '--patch') options.patch = argv[++index];
    else if (arg === '--session-id') options.sessionId = argv[++index];
    else if (arg === '--run-id') options.runId = argv[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function executable(file) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function childResult(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function probe(options) {
  const installed = await executable(options.dsh);
  const cwdAvailable = await executable(options.cwd).catch(() => false);
  let version;
  let reason;
  if (installed) {
    const result = await childResult(options.dsh, ['--version']);
    version = result.stdout.trim() || undefined;
    if (result.code !== 0) reason = result.stderr.trim() || `dsh exited ${result.code}`;
  }
  process.stdout.write(`${JSON.stringify({
    installed,
    available: installed && !reason,
    version,
    command: options.dsh,
    workingDirectory: options.cwd,
    workingDirectoryAvailable: cwdAvailable,
    patch: options.patch,
    supportsCancel: true,
    supportsResume: true,
    ...(reason ? { reason } : {}),
  })}\n`);
  process.exitCode = installed && !reason ? 0 : 1;
}

function run(options) {
  if (!options.task) throw new Error('--task is required');
  const runId = options.runId ?? `run-${randomUUID()}`;
  let sequence = 0;
  let sawTerminalStatus = false;
  let sawError = false;
  let stderr = '';

  const emit = (event) => {
    process.stdout.write(`${JSON.stringify({
      id: `${runId}:${sequence}`,
      runId,
      sequence: sequence++,
      occurredAt: new Date().toISOString(),
      ...event,
    })}\n`);
  };

  const mapNative = (event) => {
    switch (event.type) {
      case 'session':
        emit({ type: 'session', sessionId: event.sessionId });
        return;
      case 'text':
        emit({ type: 'output', text: event.text });
        return;
      case 'thinking':
        emit({ type: 'step', stepId: `thinking-${sequence}`, label: event.text, state: 'running' });
        return;
      case 'tool_call':
        emit({ type: 'step', stepId: event.callId, label: `调用 ${event.tool}`, state: 'running' });
        return;
      case 'tool_result':
        emit({
          type: 'step',
          stepId: event.callId,
          label: event.result || '工具调用完成',
          state: event.status === 'error' ? 'failed' : 'succeeded',
        });
        return;
      case 'status': {
        if (event.phase === 'turn_start') emit({ type: 'status', status: 'running' });
        if (event.phase === 'turn_end') {
          const error = event.reason?.error;
          if (error) {
            sawTerminalStatus = true;
            sawError = true;
            emit({ type: 'error', message: error.message, recovery: 'manual' });
            emit({ type: 'status', status: 'failed', reason: error.code ?? 'HARNESS_ERROR' });
          }
        }
        return;
      }
      case 'error':
        sawError = true;
        emit({ type: 'error', message: event.message, recovery: 'manual' });
        return;
      default:
    }
  };

  emit({ type: 'status', status: 'queued' });
  return startChild();

  async function startChild() {
    const temporaryDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-workspace-'));
    const generatedPatch = path.join(temporaryDir, 'headless.patch.yml');
    const template = await readFile(options.patch, 'utf8');
    if (!template.includes('__CODEX_CATALOG_READY_URL__')) throw new Error('Codex catalog patch placeholder missing');
    const pluginUrl = pathToFileURL(CATALOG_PLUGIN).href;
    await writeFile(generatedPatch, template.replace('__CODEX_CATALOG_READY_URL__', pluginUrl), { mode: 0o600 });
    const args = ['headless', '--patch', generatedPatch, '--json'];
    if (options.sessionId) args.push('--session-id', options.sessionId);
    args.push(options.task);
    const child = spawn(options.dsh, args, {
      cwd: options.cwd,
      env: { ...process.env, DSH_PERMISSION_MODE: process.env.DSH_PERMISSION_MODE ?? 'read-only' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  const lines = readline.createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      mapNative(JSON.parse(line));
    } catch {
      emit({ type: 'output', text: line });
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', (error) => {
    sawError = true;
    emit({ type: 'error', message: error.message, recovery: 'manual' });
  });
  child.once('close', async (code, signal) => {
    await rm(temporaryDir, { recursive: true, force: true });
    if (code === 0 && !sawError) {
      emit({ type: 'status', status: 'succeeded' });
      return;
    }
    if (!sawError) {
      emit({ type: 'error', message: stderr.trim().slice(-3000) || `Harness exited with code ${code}`, recovery: 'manual' });
    }
    if (!sawTerminalStatus) emit({ type: 'status', status: signal ? 'cancelled' : 'failed', reason: signal ?? (sawError ? 'HARNESS_ERROR' : `exit_${code}`) });
    process.exitCode = code || 1;
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'probe') await probe(options);
  else await run(options);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
