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
        { id: 'free',  name: 'Free',  priceMonthly: 0,  features: ['Claude tracking', '30-day history', 'Local tracking'] },
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
