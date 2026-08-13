import { buildApp } from './app.js';
import { loggerOptions } from './logger.js';

const port = Number(process.env.PORT ?? 8878);
// Bind to localhost by default; a deployment must explicitly opt in to a wider interface.
const host = process.env.HOST ?? '127.0.0.1';
const app = buildApp({ logger: loggerOptions() });

try {
  await app.listen({ port, host });
  app.log.info({ port, host }, 'wenyan-api listening');
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
