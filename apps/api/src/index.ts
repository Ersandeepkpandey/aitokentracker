import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth';
import { usageRoutes } from './routes/usage';
import { billingRoutes } from './routes/billing';
import { userRoutes } from './routes/user';
import { teamRoutes } from './routes/team';
import { webhookRoutes } from './routes/webhooks';
import { prisma } from './lib/prisma';

const app = Fastify({ logger: true });

async function start() {
  await app.register(helmet);
  await app.register(cors, {
    origin: [process.env.APP_BASE_URL!, 'vscode-webview://*'],
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers.authorization || req.ip,
  });

  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  await app.register(authRoutes,    { prefix: '/auth' });
  await app.register(usageRoutes,   { prefix: '/usage' });
  await app.register(billingRoutes, { prefix: '/billing' });
  await app.register(userRoutes,    { prefix: '/user' });
  await app.register(teamRoutes,    { prefix: '/team' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });

  const port = parseInt(process.env.PORT || '3001');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API running on port ${port}`);

  process.on('SIGTERM', async () => {
    await app.close();
    await prisma.$disconnect();
  });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
