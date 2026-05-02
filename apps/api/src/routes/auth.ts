import { FastifyPluginAsync } from 'fastify';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { prisma } from '../lib/prisma';
import { signJwt, signRefreshToken, verifyJwt } from '../lib/jwt';
import crypto from 'crypto';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

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
  // Called from the web page after the user signs in via Clerk.
  // Verifies the Clerk token, then generates a short-lived exchange code
  // and redirects to the extension's local callback server.
  app.get<{ Querystring: { state: string; callbackUrl: string } }>(
    '/vscode-callback',
    async (req, reply) => {
      const { state, callbackUrl } = req.query;

      // SSRF guard — callback must be localhost
      let cbUrl: URL;
      try {
        cbUrl = new URL(callbackUrl);
      } catch {
        return reply.status(400).send({ error: 'Invalid callback URL' });
      }
      if (cbUrl.hostname !== '127.0.0.1' && cbUrl.hostname !== 'localhost') {
        return reply.status(400).send({ error: 'Callback must be localhost' });
      }

      // Verify the Clerk session token and look up the DB user
      const bearerToken = req.headers.authorization?.replace('Bearer ', '');
      if (!bearerToken) {
        return reply.status(401).send({ error: 'Missing authorization' });
      }
      let dbUserId: string;
      try {
        const clerkPayload = await verifyToken(bearerToken, { secretKey: process.env.CLERK_SECRET_KEY! });
        let dbUser = await prisma.user.findUnique({ where: { clerkId: clerkPayload.sub } });
        if (!dbUser) {
          // User signed in before webhook fired — decode basic info from the JWT claims
          // Clerk puts email/name in the token when configured via JWT templates,
          // otherwise fall back to placeholders (webhook will backfill later).
          const claims = clerkPayload as any;
          const email: string = claims.email ?? claims.primary_email_address ?? '';
          const name: string = claims.name ?? claims.full_name ?? ([claims.first_name, claims.last_name].filter(Boolean).join(' ') || 'User');
          const avatarUrl: string | undefined = claims.image_url ?? claims.profile_image_url ?? undefined;

          dbUser = await prisma.user.upsert({
            where:  { clerkId: clerkPayload.sub },
            update: {},
            create: { clerkId: clerkPayload.sub, email, name, avatarUrl },
          });
        }
        dbUserId = dbUser.id;
      } catch {
        return reply.status(401).send({ error: 'Invalid Clerk token' });
      }

      const code = crypto.randomBytes(32).toString('hex');
      exchangeCodes.set(code, { userId: dbUserId, expiresAt: Date.now() + 60_000 });

      return reply.send({ redirectUrl: `${callbackUrl}?token=${code}&state=${state}` });
    }
  );
};
