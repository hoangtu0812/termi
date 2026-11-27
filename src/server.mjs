import { loadConfig } from './config.mjs';
import { start } from './start.mjs';

const STOP_SIGNALS = ['SIGTERM', 'SIGINT'];
const FORCE_EXIT_MS = 3000;

try {
  const app = await start(loadConfig());
  for (const signal of STOP_SIGNALS) {
    process.once(signal, () => {
      setTimeout(() => process.exit(0), FORCE_EXIT_MS).unref();
      app.close().finally(() => process.exit(0));
    });
  }
} catch (error) {
  console.error(`termi: failed to start: ${error.message}`);
  process.exit(1);
}
