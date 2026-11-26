import { loadConfig } from './config.mjs';
import { start } from './start.mjs';

try {
  await start(loadConfig());
} catch (error) {
  console.error(`termi: failed to start: ${error.message}`);
  process.exit(1);
}
