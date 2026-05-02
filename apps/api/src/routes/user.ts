import { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';

export const userRoutes: FastifyPluginAsync = async (app) => {

  // GET /user/me
  app.get('/me', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, email: true, name: true, avatarUrl: true,
        plan: true, settings: true, createdAt: true, lastActiveAt: true,
        stripeCurrentPeriodEnd: true,
      },
    });
    return reply.send(user);
  });

  // PUT /user/settings
  app.put<{ Body: Record<string, unknown> }>(
    '/settings',
    { preHandler: authenticate },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      const updated = await prisma.user.update({
        where: { id: req.userId },
        data: { settings: { ...(user?.settings as Prisma.JsonObject ?? {}), ...(req.body as Prisma.JsonObject) } },
      });
      return reply.send({ settings: updated.settings });
    }
  );

  // DELETE /user/me — GDPR compliance
  app.delete('/me', { preHandler: authenticate }, async (req, reply) => {
    await prisma.user.delete({ where: { id: req.userId } });
    return reply.send({ deleted: true });
  });
};
