import { buildServer } from './app';
import { loadConfig } from './config';
import { logEvent } from './observability/trace';

const config = loadConfig();
const app = await buildServer(config);
await app.listen({ port: config.port, host: '0.0.0.0' });
logEvent('listening', {
  port: config.port,
  server_voice: Boolean(config.openRouterKey),
  passcode: Boolean(config.passcode),
  models: config.models,
});
if (!config.openRouterKey) {
  logEvent('warning', { message: 'OPENROUTER_API_KEY is not set: running in offline mode (scripted tutor, rule-based answer reading).' });
}
