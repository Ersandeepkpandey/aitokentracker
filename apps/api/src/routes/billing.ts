import { FastifyPluginAsync } from 'fastify';
import {
  lemonSqueezySetup,
  createCheckout,
  getSubscription,
  cancelSubscription,
} from '@lemonsqueezy/lemonsqueezy.js';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY! });

const VARIANT_IDS: Record<string, string> = {
  pro:  process.env.LEMONSQUEEZY_PRO_VARIANT_ID!,
  team: process.env.LEMONSQUEEZY_TEAM_VARIANT_ID!,
};

export const billingRoutes: FastifyPluginAsync = async (app) => {

  // GET /billing/plans — public
  app.get('/plans', async (_req, reply) => {
    return reply.send({
      plans: [
        { id: 'free', name: 'Free',  priceMonthly: 0,  features: ['Claude tracking', '30-day history', 'Status bar'] },
        { id: 'pro',  name: 'Pro',   priceMonthly: 9,  features: ['All AI models', '365-day history', 'Cost breakdown', 'Model comparison', 'Budget alerts', 'Weekly digest', 'CSV export'] },
        { id: 'team', name: 'Team',  priceMonthly: 19, features: ['Everything in Pro', 'Team dashboard', 'Admin controls'] },
      ],
    });
  });

  // POST /billing/checkout — create Lemon Squeezy checkout
  app.post<{ Body: { plan: 'pro' | 'team' } }>(
    '/checkout',
    { preHandler: authenticate },
    async (req, reply) => {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const variantId = VARIANT_IDS[req.body.plan];
      if (!variantId) return reply.status(400).send({ error: 'Invalid plan' });

      const storeId = process.env.LEMONSQUEEZY_STORE_ID!;

      const { data, error } = await createCheckout(storeId, variantId, {
        checkoutData: {
          email: user.email,
          name:  user.name,
          custom: { userId: user.id, plan: req.body.plan },
        },
        checkoutOptions: {
          embed: false,
          media: true,
          logo:  true,
        },
        productOptions: {
          redirectUrl:    `${process.env.APP_BASE}/dashboard?upgrade=success`,
          receiptLinkUrl: `${process.env.APP_BASE}/dashboard`,
        },
      });

      if (error || !data) {
        return reply.status(500).send({ error: 'Failed to create checkout' });
      }

      return reply.send({ url: data.data.attributes.url });
    }
  );

  // POST /billing/cancel — cancel subscription
  app.post('/cancel', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.stripeSubscriptionId) {
      return reply.status(400).send({ error: 'No active subscription' });
    }

    const { error } = await cancelSubscription(user.stripeSubscriptionId);
    if (error) return reply.status(500).send({ error: 'Failed to cancel' });

    return reply.send({ cancelled: true });
  });

  // GET /billing/subscription — get current subscription status
  app.get('/subscription', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user?.stripeSubscriptionId) {
      return reply.send({ plan: 'free', status: null });
    }

    const { data, error } = await getSubscription(user.stripeSubscriptionId);
    if (error || !data) return reply.send({ plan: user.plan, status: 'unknown' });

    return reply.send({
      plan:   user.plan,
      status: data.data.attributes.status,
      renewsAt: data.data.attributes.renews_at,
      endsAt:   data.data.attributes.ends_at,
    });
  });
};
