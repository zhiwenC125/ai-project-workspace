import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const RUNNER = path.resolve('integration/deepseek-harness-runner.mjs');

export class HarnessExecutor {
  constructor({ runner = RUNNER } = {}) {
    this.runner = runner;
    this.children = new Map();
  }

  run(request) {
    return new Promise((resolve, reject) => {
      const args = [this.runner, '--run-id', request.workflowRunId, '--task', request.task];
      if (request.workingDirectory) args.push('--cwd', request.workingDirectory);
      if (request.sessionId) args.push('--session-id', request.sessionId);
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.children.set(request.workflowRunId, child);
      let sessionId;
      let output = '';
      let reason;
      let stderr = '';
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', line => {
        try {
          const event = JSON.parse(line);
          if (event.type === 'session') sessionId = event.sessionId;
          if (event.type === 'output') output += event.text;
          if (event.type === 'error') reason = event.message;
        } catch { reason = 'Harness returned invalid event data'; }
      });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', code => {
        this.children.delete(request.workflowRunId);
        resolve({
        status: code === 0 && !reason ? 'succeeded' : 'failed',
        sessionId,
        output,
        ...(reason || stderr ? { reason: reason ?? stderr.trim() } : {}),
        artifacts: [],
        });
      });
    });
  }

  async cancel(runId) {
    const child = this.children.get(runId);
    return child ? child.kill('SIGTERM') : false;
  }
}
