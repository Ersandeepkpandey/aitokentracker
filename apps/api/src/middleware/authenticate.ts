import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';
import { verifyJwt } from '../lib/jwt';
import { Plan } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userPlan: Plan;
    clerkUserId: string;
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = verifyJwt(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, plan: true, clerkId: true },
    });

    if (!user) {
      reply.status(401).send({ error: 'User not found' });
      return;
    }

    req.userId = user.id;
    req.userPlan = user.plan;
    req.clerkUserId = user.clerkId;
  } catch {
    reply.status(401).send({ error: 'Invalid token' });
  }
}

export function requirePlan(minPlan: Plan) {
  const hierarchy: Record<Plan, number> = { FREE: 0, PRO: 1, TEAM: 2, ENTERPRISE: 3 };
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (hierarchy[req.userPlan] < hierarchy[minPlan]) {
      reply.status(403).send({
        error: 'upgrade_required',
        requiredPlan: minPlan,
        currentPlan: req.userPlan,
        upgradeUrl: `${process.env.APP_BASE_URL}/pricing`,
      });
    }
  };
}
