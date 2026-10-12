import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from './app.mjs';
import { FileRunStore } from '../engine/file-store.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const demo = process.argv.includes('--demo');
const token = process.env.WORKBENCH_TOKEN ?? randomBytes(32).toString('hex');
const runtime = { mode: demo ? 'demo' : 'harness', workingDirectory: process.env.DSH_WORKING_DIRECTORY ?? root };
const options = { token, runtime, store: new FileRunStore(path.join(root, '.data', demo ? 'demo-runs' : 'workflow-runs')) };
if (demo) options.harness = { run: async () => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { status: 'succeeded', output: '【演示结果，未调用模型】工作项已进入人工评审。你可以选择通过或退回，检查完整的流程状态变化。' };
} };

try {
  const { server } = await createApp(options);
  server.on('error', error => { process.stderr.write(`启动失败：${error.message}\n`); process.exitCode = 1; });
  server.listen(Number(process.env.WORKBENCH_PORT ?? 8787), '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/#token=${token}`;
    process.stdout.write(`AI 研发工作台 · 0.1.0-alpha.1 · ${demo ? '演示模式' : '真实 Harness 模式'}\n${url}\n保持此终端打开；按 Ctrl+C 停止。\n`);
    if (!process.argv.includes('--no-open') && process.platform === 'darwin') {
      const child = spawn('open', [url], { stdio: 'ignore' });
      child.on('error', () => process.stderr.write('请复制上面的本地地址到浏览器。\n'));
    }
  });
} catch (error) {
  process.stderr.write(`启动失败：${error.message}\n`);
  process.exitCode = 1;
}
