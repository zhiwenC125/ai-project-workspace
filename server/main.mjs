#!/usr/bin/env node
import { createApp } from './app.mjs';

try {
  const { server } = await createApp({ token: process.env.WORKBENCH_TOKEN });
  const port = Number(process.env.WORKBENCH_PORT ?? 8787);
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Workbench API listening on http://127.0.0.1:${port}\n`));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
