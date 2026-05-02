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

  // GET /user/budget
  app.get('/budget', { preHandler: authenticate }, async (req, reply) => {
    const budgets = await prisma.budget.findMany({ where: { userId: req.userId } });
    return reply.send(budgets);
  });

  // PUT /user/budget
  app.put<{
    Body: { type: string; limitUsd: number; alertAt?: number; hardLimit?: boolean; active?: boolean };
  }>('/budget', { preHandler: authenticate }, async (req, reply) => {
    const { type, limitUsd, alertAt = 0.8, hardLimit = false, active = true } = req.body;
    if (!['daily', 'weekly', 'monthly'].includes(type)) {
      return reply.status(400).send({ error: 'type must be daily, weekly, or monthly' });
    }
    const budget = await prisma.budget.upsert({
      where:  { userId_type: { userId: req.userId, type } },
      update: { limitUsd, alertAt, hardLimit, active },
      create: { userId: req.userId, type, limitUsd, alertAt, hardLimit, active },
    });
    return reply.send(budget);
  });

  // DELETE /user/budget/:type
  app.delete<{ Params: { type: string } }>(
    '/budget/:type',
    { preHandler: authenticate },
    async (req, reply) => {
      await prisma.budget.deleteMany({
        where: { userId: req.userId, type: req.params.type },
      });
      return reply.send({ deleted: true });
    }
  );

  // DELETE /user/me — GDPR compliance
  app.delete('/me', { preHandler: authenticate }, async (req, reply) => {
    await prisma.user.delete({ where: { id: req.userId } });
    return reply.send({ deleted: true });
  });
};
