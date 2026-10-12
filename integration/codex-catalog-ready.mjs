import { Service } from 'file:///Applications/DeepSeek%20Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/cordis/lib/index.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

class CodexCatalogReady extends Service {
  static inject = ['llm'];

  constructor(ctx, config = {}) {
    super(ctx, 'codexCatalogReady');
    this.provider = config.provider ?? 'openai-codex';
    this.model = config.model ?? 'gpt-5.6-luna';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async [Service.init]() {
    const deadline = Date.now() + this.timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
      try {
        await this.ctx.llm.resolveCallConfig({ provider: this.provider, model: this.model });
        return;
      } catch (error) {
        lastError = error;
        if (error?.code !== 'NO_ADAPTER' && error?.code !== 'UNKNOWN_MODEL') throw error;
      }
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(
      `Codex model catalog did not publish ${this.provider}/${this.model} within ${this.timeoutMs}ms`,
      { cause: lastError },
    );
  }
}

export default CodexCatalogReady;
