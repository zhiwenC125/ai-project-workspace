import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export class FileRunStore {
  constructor(root = path.resolve('.data/workflow-runs')) {
    this.root = root;
  }

  async save(run) {
    await mkdir(this.root, { recursive: true });
    const target = this.pathFor(run.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
  }

  async get(runId) {
    try {
      return JSON.parse(await readFile(this.pathFor(runId), 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async findByIdempotencyKey(key) {
    try {
      const files = await readdir(this.root);
      for (const file of files.filter(name => name.endsWith('.json'))) {
        const run = JSON.parse(await readFile(path.join(this.root, file), 'utf8'));
        if (run.idempotencyKey === key) return run;
      }
      return undefined;
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async list({ workItemId, limit = 50 } = {}) {
    try {
      const files = (await readdir(this.root)).filter(name => name.endsWith('.json'));
      const runs = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(this.root, file), 'utf8'))));
      return runs.filter(run => !workItemId || run.workItemId === workItemId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  pathFor(runId) {
    if (!/^workflow-[a-f0-9-]+$/u.test(runId)) throw new Error(`invalid workflow run id: ${runId}`);
    return path.join(this.root, `${runId}.json`);
  }
}
