import { FastifyPluginAsync } from 'fastify';

// Phase 2 — team routes not yet implemented
export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.all('/*', async (_req, reply) => {
    return reply.status(501).send({ error: 'Team features coming in Phase 2' });
  });
};
