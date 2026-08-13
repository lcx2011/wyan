import { buildApp } from './app.js';
import { loggerOptions } from './logger.js';

const port = Number(process.env.PORT ?? 8787);
// Bind to localhost in development, but allow the LAN deployment to opt in
// to a reachable interface with HOST=0.0.0.0.
const host = process.env.HOST ?? '127.0.0.1';
const app = buildApp({ logger: loggerOptions() });

try {
  await app.listen({ port, host });
  app.log.info({ port, host }, 'wenyan-api listening');
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
