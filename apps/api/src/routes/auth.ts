import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma';
import { signJwt, signRefreshToken, verifyJwt } from '../lib/jwt';
import crypto from 'crypto';

// In-memory store for short-lived exchange codes (use Redis in production)
const exchangeCodes = new Map<string, { userId: string; expiresAt: number }>();

export const authRoutes: FastifyPluginAsync = async (app) => {

  // POST /auth/exchange
  // Extension calls this after receiving the short-lived code from the browser callback
  app.post<{ Body: { code: string } }>('/exchange', async (req, reply) => {
    const { code } = req.body;
    if (!code) return reply.status(400).send({ error: 'Missing code' });

    const entry = exchangeCodes.get(code);
    if (!entry || entry.expiresAt < Date.now()) {
      exchangeCodes.delete(code);
      return reply.status(401).send({ error: 'Invalid or expired code' });
    }
    exchangeCodes.delete(code);

    const user = await prisma.user.findUnique({ where: { id: entry.userId } });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const token = signJwt({ userId: user.id, plan: user.plan });
    const refreshToken = signRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    return reply.send({
      userId: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan.toLowerCase(),
      avatarUrl: user.avatarUrl,
      token,
      refreshToken,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  });

  // POST /auth/refresh
  app.post<{ Body: { refreshToken: string } }>('/refresh', async (req, reply) => {
    const { refreshToken } = req.body;
    try {
      const payload = verifyJwt(refreshToken) as any;
      if (payload.type !== 'refresh') throw new Error('Not a refresh token');

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) return reply.status(401).send({ error: 'User not found' });

      const token = signJwt({ userId: user.id, plan: user.plan });
      const newRefreshToken = signRefreshToken(user.id);

      return reply.send({
        userId: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan.toLowerCase(),
        token,
        refreshToken: newRefreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    } catch {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
  });

  // GET /auth/vscode-callback
  // Website calls this after login to generate a short-lived code and redirect to extension
  app.get<{ Querystring: { userId: string; state: string; callbackUrl: string } }>(
    '/vscode-callback',
    async (req, reply) => {
      const { userId, state, callbackUrl } = req.query;

      // Validate callbackUrl is localhost only
      let url: URL;
      try {
        url = new URL(callbackUrl);
      } catch {
        return reply.status(400).send({ error: 'Invalid callback URL' });
      }
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        return reply.status(400).send({ error: 'Invalid callback URL' });
      }

      const code = crypto.randomBytes(32).toString('hex');
      exchangeCodes.set(code, { userId, expiresAt: Date.now() + 60_000 });

      return reply.redirect(`${callbackUrl}?token=${code}&state=${state}`);
    }
  );
};
