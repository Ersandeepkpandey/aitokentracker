# Backend API — Build Guide

> Node.js + Fastify. All routes, auth middleware, and deployment instructions.

---

## Project Setup

```bash
cd apps/api
pnpm init
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit @fastify/jwt
pnpm add @prisma/client @clerk/backend stripe
pnpm add -D prisma typescript ts-node @types/node nodemon
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

`package.json` scripts:
```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:studio": "prisma studio",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy"
  }
}
```

---

## Entry Point

`src/index.ts`:
```typescript
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

// ── Plugins ────────────────────────────────────────────────────────────────
await app.register(helmet);
await app.register(cors, {
  origin: [process.env.APP_BASE_URL!, 'vscode-webview://*'],
  credentials: true,
});
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  // Higher limit for usage sync (called every 10s)
  keyGenerator: (req) => req.headers.authorization || req.ip,
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

// ── Routes ─────────────────────────────────────────────────────────────────
await app.register(authRoutes,    { prefix: '/auth' });
await app.register(usageRoutes,   { prefix: '/usage' });
await app.register(billingRoutes, { prefix: '/billing' });
await app.register(userRoutes,    { prefix: '/user' });
await app.register(teamRoutes,    { prefix: '/team' });
await app.register(webhookRoutes, { prefix: '/webhooks' });  // raw body needed for Stripe

// ── Start ──────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT || '3001');
await app.listen({ port, host: '0.0.0.0' });
console.log(`API running on port ${port}`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await app.close();
  await prisma.$disconnect();
});
```

`src/lib/prisma.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});
```

---

## Auth Middleware

`src/middleware/authenticate.ts`:
```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/backend';
import { prisma } from '../lib/prisma';
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
    // Verify the JWT issued by your backend (not Clerk's session token)
    const payload = verifyJwt(token);  // see lib/jwt.ts below

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
```

`src/lib/jwt.ts`:
```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
  userId: string;
  plan: string;
  iat: number;
  exp: number;
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, SECRET, { expiresIn: '90d' });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
```

---

## Auth Routes

`src/routes/auth.ts`:
```typescript
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
    exchangeCodes.delete(code);  // one-time use

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
  // Your WEBSITE calls this after login to generate a short-lived code and redirect
  // This route is called server-side from Next.js, not from the extension
  app.get<{ Querystring: { userId: string; state: string; callbackUrl: string } }>(
    '/vscode-callback',
    async (req, reply) => {
      const { userId, state, callbackUrl } = req.query;

      // Validate callbackUrl is localhost only
      const url = new URL(callbackUrl);
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        return reply.status(400).send({ error: 'Invalid callback URL' });
      }

      const code = crypto.randomBytes(32).toString('hex');
      exchangeCodes.set(code, { userId, expiresAt: Date.now() + 60_000 });

      // Redirect to extension's local server
      return reply.redirect(`${callbackUrl}?token=${code}&state=${state}`);
    }
  );
};
```

---

## Usage Routes

`src/routes/usage.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma';
import { authenticate, requirePlan } from '../middleware/authenticate';
import { Plan } from '@prisma/client';
import { calcCost } from '../lib/pricing';
import { recalcDailyStats } from '../services/statsService';

export const usageRoutes: FastifyPluginAsync = async (app) => {

  // ── POST /usage/sync ──────────────────────────────────────────────────────
  // Called from extension every ~10s. Idempotent.
  app.post<{
    Body: {
      sessions: Array<{
        sessionId: string;
        model: string;
        aiProvider?: string;
        projectName: string;
        workspacePath?: string;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        turns: number;
        vsCodeVersion?: string;
        extensionVersion?: string;
        osType?: string;
        timestamp: number;
      }>;
    };
  }>('/sync', { preHandler: authenticate }, async (req, reply) => {
    const { sessions } = req.body;
    const userId = req.userId;

    await Promise.all(sessions.map(async (s) => {
      const cost = calcCost({
        model: s.model,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        cacheReadTokens: s.cacheReadTokens,
        cacheWriteTokens: s.cacheWriteTokens,
      });

      await prisma.usageSession.upsert({
        where: { id: s.sessionId },
        update: {
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          cacheReadTokens: s.cacheReadTokens,
          cacheWriteTokens: s.cacheWriteTokens,
          totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens,
          inputCostUsd: cost.input,
          outputCostUsd: cost.output,
          cacheReadCostUsd: cost.cacheRead,
          cacheWriteCostUsd: cost.cacheWrite,
          totalCostUsd: cost.total,
          turnCount: s.turns,
          lastUpdatedAt: new Date(),
        },
        create: {
          id: s.sessionId,
          userId,
          model: s.model,
          aiProvider: s.aiProvider || 'claude',
          projectName: s.projectName || 'Unknown',
          workspacePath: s.workspacePath,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          cacheReadTokens: s.cacheReadTokens,
          cacheWriteTokens: s.cacheWriteTokens,
          totalTokens: s.inputTokens + s.outputTokens + s.cacheReadTokens + s.cacheWriteTokens,
          inputCostUsd: cost.input,
          outputCostUsd: cost.output,
          cacheReadCostUsd: cost.cacheRead,
          cacheWriteCostUsd: cost.cacheWrite,
          totalCostUsd: cost.total,
          turnCount: s.turns,
          vsCodeVersion: s.vsCodeVersion,
          extensionVersion: s.extensionVersion,
          osType: s.osType,
          sessionStartedAt: new Date(s.timestamp),
        },
      });

      // Async rollup (don't await — let it run in background)
      const date = new Date(s.timestamp).toISOString().slice(0, 10);
      recalcDailyStats(userId, date).catch(console.error);
    }));

    // Check budget alerts (async)
    checkBudgetAlerts(userId).catch(console.error);

    return reply.send({ ok: true, synced: sessions.length });
  });

  // ── GET /usage/summary ────────────────────────────────────────────────────
  app.get('/summary', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.userId;
    const historyDays = getHistoryDays(req.userPlan);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - historyDays);

    const [totalCost, totalTokens, sessionCount, todayCost, monthCost] = await Promise.all([
      prisma.usageSession.aggregate({
        where: { userId, sessionStartedAt: { gte: cutoff } },
        _sum: { totalCostUsd: true, totalTokens: true },
        _count: true,
      }),
      prisma.usageSession.aggregate({
        where: { userId, sessionStartedAt: { gte: cutoff } },
        _sum: { totalTokens: true },
      }),
      prisma.usageSession.count({ where: { userId } }),
      prisma.dailyStats.aggregate({
        where: { userId, date: new Date().toISOString().slice(0, 10) },
        _sum: { totalCostUsd: true },
      }),
      prisma.dailyStats.aggregate({
        where: { userId, date: { startsWith: new Date().toISOString().slice(0, 7) } },
        _sum: { totalCostUsd: true },
      }),
    ]);

    return reply.send({
      totalCostUsd: totalCost._sum.totalCostUsd || 0,
      totalTokens: totalCost._sum.totalTokens || 0,
      sessionCount,
      todayCostUsd: todayCost._sum.totalCostUsd || 0,
      monthCostUsd: monthCost._sum.totalCostUsd || 0,
      plan: req.userPlan,
      historyDays,
    });
  });

  // ── GET /usage/daily?from=2025-04-01&to=2025-05-01 ───────────────────────
  app.get<{ Querystring: { from?: string; to?: string; projectName?: string } }>(
    '/daily',
    { preHandler: authenticate },
    async (req, reply) => {
      const userId = req.userId;
      const historyDays = getHistoryDays(req.userPlan);
      const maxFrom = new Date();
      maxFrom.setDate(maxFrom.getDate() - historyDays);

      const from = req.query.from
        ? new Date(Math.max(new Date(req.query.from).getTime(), maxFrom.getTime())).toISOString().slice(0, 10)
        : maxFrom.toISOString().slice(0, 10);

      const to = req.query.to || new Date().toISOString().slice(0, 10);

      const stats = await prisma.dailyStats.findMany({
        where: {
          userId,
          date: { gte: from, lte: to },
          ...(req.query.projectName ? { projectName: req.query.projectName } : {}),
        },
        orderBy: { date: 'asc' },
      });

      return reply.send(stats);
    }
  );

  // ── GET /usage/sessions ───────────────────────────────────────────────────
  app.get<{ Querystring: { limit?: string; offset?: string; projectName?: string } }>(
    '/sessions',
    { preHandler: authenticate },
    async (req, reply) => {
      const userId = req.userId;
      const limit = Math.min(parseInt(req.query.limit || '20'), 100);
      const offset = parseInt(req.query.offset || '0');
      const historyDays = getHistoryDays(req.userPlan);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - historyDays);

      const [sessions, total] = await Promise.all([
        prisma.usageSession.findMany({
          where: {
            userId,
            sessionStartedAt: { gte: cutoff },
            ...(req.query.projectName ? { projectName: req.query.projectName } : {}),
          },
          orderBy: { sessionStartedAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.usageSession.count({
          where: { userId, sessionStartedAt: { gte: cutoff } },
        }),
      ]);

      return reply.send({ sessions, total, limit, offset });
    }
  );

  // ── GET /usage/projects ───────────────────────────────────────────────────
  app.get('/projects', { preHandler: authenticate }, async (req, reply) => {
    const projects = await prisma.usageSession.groupBy({
      by: ['projectName'],
      where: { userId: req.userId },
      _sum: { totalCostUsd: true, totalTokens: true },
      _count: true,
      orderBy: { _sum: { totalCostUsd: 'desc' } },
    });
    return reply.send(projects);
  });

  // ── GET /usage/export (Pro+) ──────────────────────────────────────────────
  app.get(
    '/export',
    { preHandler: [authenticate, requirePlan(Plan.PRO)] },
    async (req, reply) => {
      const sessions = await prisma.usageSession.findMany({
        where: { userId: req.userId },
        orderBy: { sessionStartedAt: 'desc' },
      });

      const csv = [
        'date,project,model,inputTokens,outputTokens,cacheReadTokens,totalCost,turns',
        ...sessions.map(s => [
          s.sessionStartedAt.toISOString(),
          s.projectName,
          s.model,
          s.inputTokens,
          s.outputTokens,
          s.cacheReadTokens,
          s.totalCostUsd.toFixed(6),
          s.turnCount,
        ].join(',')),
      ].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="token-usage.csv"');
      return reply.send(csv);
    }
  );
};

function getHistoryDays(plan: Plan): number {
  const limits: Record<Plan, number> = { FREE: 30, PRO: 365, TEAM: 365, ENTERPRISE: 9999 };
  return limits[plan];
}

async function checkBudgetAlerts(userId: string) {
  const budget = await prisma.budget.findUnique({
    where: { userId_type: { userId, type: 'daily' } },
  });
  if (!budget || !budget.active) return;

  const today = new Date().toISOString().slice(0, 10);
  const todaySpend = await prisma.dailyStats.aggregate({
    where: { userId, date: today },
    _sum: { totalCostUsd: true },
  });

  const spent = todaySpend._sum.totalCostUsd || 0;
  const alertThreshold = budget.limitUsd * budget.alertAt;

  if (spent >= alertThreshold && spent < budget.limitUsd) {
    // TODO: send email via Resend + create in-app notification
    console.log(`Budget alert for user ${userId}: $${spent.toFixed(4)} of $${budget.limitUsd}`);
  }
}
```

---

## Pricing Service

`src/lib/pricing.ts`:
```typescript
interface PricingTier {
  input: number;      // per 1M tokens
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICING: Record<string, PricingTier> = {
  'claude-opus-4':      { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-opus-4-5':    { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet-4':    { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-sonnet-4-5':  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-haiku-3-5':   { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  'gpt-4o':             { input:  2.50, output: 10.00, cacheRead: 1.25,  cacheWrite:  0    },
  'gpt-4o-mini':        { input:  0.15, output:  0.60, cacheRead: 0.075, cacheWrite:  0    },
  'gemini-1.5-pro':     { input:  1.25, output:  5.00, cacheRead: 0.3125,cacheWrite:  0    },
};

const DEFAULT_TIER: PricingTier = { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 };

export function calcCost(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}) {
  const tier = PRICING[params.model] || DEFAULT_TIER;
  const M = 1_000_000;
  const input      = (params.inputTokens      / M) * tier.input;
  const output     = (params.outputTokens     / M) * tier.output;
  const cacheRead  = (params.cacheReadTokens  / M) * tier.cacheRead;
  const cacheWrite = (params.cacheWriteTokens / M) * tier.cacheWrite;
  return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
}
```

---

## Billing Routes

`src/routes/billing.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLAN_PRICES: Record<string, string> = {
  pro:  process.env.STRIPE_PRICE_PRO_MONTHLY!,
  team: process.env.STRIPE_PRICE_TEAM_MONTHLY!,
};

export const billingRoutes: FastifyPluginAsync = async (app) => {

  // GET /billing/plans — public
  app.get('/plans', async (_req, reply) => {
    return reply.send({
      plans: [
        { id: 'free',  name: 'Free',  priceMonthly: 0,  features: ['Claude tracking', '30-day history', '1 AI model'] },
        { id: 'pro',   name: 'Pro',   priceMonthly: 9,  features: ['All AI models', 'Unlimited history', 'Cost prediction', 'Model comparison', 'Budget alerts', 'CSV export'] },
        { id: 'team',  name: 'Team',  priceMonthly: 19, features: ['Everything in Pro', 'Team dashboard', 'Per-dev attribution', 'Shared budgets', 'Slack reports'] },
      ],
    });
  });

  // POST /billing/checkout — create Stripe checkout session
  app.post<{ Body: { plan: 'pro' | 'team' } }>(
    '/checkout',
    { preHandler: authenticate },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const priceId = PLAN_PRICES[req.body.plan];
      if (!priceId) return reply.status(400).send({ error: 'Invalid plan' });

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customer.id },
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${process.env.APP_BASE_URL}/dashboard?upgrade=success`,
        cancel_url:  `${process.env.APP_BASE_URL}/pricing?upgrade=cancelled`,
        metadata: { userId: user.id, plan: req.body.plan },
      });

      return reply.send({ url: session.url });
    }
  );

  // POST /billing/portal — manage subscription
  app.post('/portal', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.stripeCustomerId) {
      return reply.status(400).send({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.APP_BASE_URL}/dashboard`,
    });

    return reply.send({ url: session.url });
  });
};
```

---

## Stripe Webhook Handler

`src/routes/webhooks.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { Plan } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Map Stripe price IDs to internal plan names
function priceIdToPlan(priceId: string): Plan {
  const map: Record<string, Plan> = {
    [process.env.STRIPE_PRICE_PRO_MONTHLY!]:  Plan.PRO,
    [process.env.STRIPE_PRICE_TEAM_MONTHLY!]: Plan.TEAM,
  };
  return map[priceId] || Plan.FREE;
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {

  // Stripe requires raw body — add content-type parser
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => done(null, body)
  );

  app.post('/stripe', async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch {
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.metadata?.userId) {
          await prisma.user.update({
            where: { id: session.metadata.userId },
            data: {
              plan: priceIdToPlan(session.metadata?.plan === 'team' ? process.env.STRIPE_PRICE_TEAM_MONTHLY! : process.env.STRIPE_PRICE_PRO_MONTHLY!),
              stripeSubscriptionId: session.subscription as string,
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0].price.id;
        const plan = priceIdToPlan(priceId);

        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: {
            plan,
            stripePriceId: priceId,
            stripeCurrentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: { plan: Plan.FREE, stripeSubscriptionId: null, stripePriceId: null },
        });
        break;
      }
    }

    return reply.send({ received: true });
  });
};
```

---

## User Routes

`src/routes/user.ts`:
```typescript
import { FastifyPluginAsync } from 'fastify';
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
        data: { settings: { ...(user?.settings as object), ...req.body } },
      });
      return reply.send({ settings: updated.settings });
    }
  );

  // DELETE /user/me — GDPR compliance
  app.delete('/me', { preHandler: authenticate }, async (req, reply) => {
    // Cascade deletes all sessions, stats, budgets via DB foreign keys
    await prisma.user.delete({ where: { id: req.userId } });
    return reply.send({ deleted: true });
  });
};
```

---

## Clerk Webhook (Sync User Creation)

Your website uses Clerk for auth. When a user signs up on the website, Clerk fires a webhook. This creates the user in your Postgres DB.

Add to `src/routes/webhooks.ts`:
```typescript
import { Webhook } from 'svix';  // pnpm add svix

// POST /webhooks/clerk
app.post('/clerk', async (req, reply) => {
  const svix = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let event: any;

  try {
    event = svix.verify(JSON.stringify(req.body), {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    });
  } catch {
    return reply.status(400).send({ error: 'Invalid signature' });
  }

  if (event.type === 'user.created') {
    const { id, email_addresses, first_name, last_name, image_url } = event.data;
    await prisma.user.upsert({
      where: { clerkId: id },
      update: {},
      create: {
        clerkId: id,
        email: email_addresses[0]?.email_address || '',
        name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
        avatarUrl: image_url,
      },
    });
  }

  if (event.type === 'user.deleted') {
    await prisma.user.deleteMany({ where: { clerkId: event.data.id } });
  }

  return reply.send({ received: true });
});
```

---

## Deployment on Railway

```bash
# 1. Install Railway CLI
npm install -g @railway/cli
railway login

# 2. From apps/api/
railway init
railway add postgresql    # adds a Postgres instance if not using Neon

# 3. Set environment variables
railway variables set DATABASE_URL="..." CLERK_SECRET_KEY="..." STRIPE_SECRET_KEY="..." JWT_SECRET="..."

# 4. Deploy
railway up

# 5. Run migrations against production
railway run pnpx prisma migrate deploy
```

Add `Procfile` to `apps/api/`:
```
web: node dist/index.js
```

Add to `railway.toml`:
```toml
[build]
builder = "NIXPACKS"
buildCommand = "pnpm build && pnpx prisma generate"

[deploy]
startCommand = "pnpx prisma migrate deploy && node dist/index.js"
healthcheckPath = "/health"
```
