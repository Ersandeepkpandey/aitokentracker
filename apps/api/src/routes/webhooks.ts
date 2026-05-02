import { FastifyPluginAsync } from 'fastify';
import Stripe from 'stripe';
import { Webhook } from 'svix';
import { prisma } from '../lib/prisma';
import { Plan } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function priceIdToPlan(priceId: string): Plan {
  const map: Record<string, Plan> = {
    [process.env.STRIPE_PRICE_PRO_MONTHLY!]:  Plan.PRO,
    [process.env.STRIPE_PRICE_TEAM_MONTHLY!]: Plan.TEAM,
  };
  return map[priceId] || Plan.FREE;
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {

  // Stripe requires raw body
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => done(null, body)
  );

  // POST /webhooks/stripe
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
          const planKey = session.metadata.plan === 'team'
            ? process.env.STRIPE_PRICE_TEAM_MONTHLY!
            : process.env.STRIPE_PRICE_PRO_MONTHLY!;
          await prisma.user.update({
            where: { id: session.metadata.userId },
            data: {
              plan: priceIdToPlan(planKey),
              stripeSubscriptionId: session.subscription as string,
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0].price.id;
        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: {
            plan: priceIdToPlan(priceId),
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

  // POST /webhooks/clerk
  app.post('/clerk', async (req, reply) => {
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
    // req.body is a Buffer (raw parser above) — pass it directly, not JSON.stringify
    const body = req.body as Buffer;
    let event: any;

    try {
      event = wh.verify(body, {
        'svix-id':        req.headers['svix-id'] as string,
        'svix-timestamp': req.headers['svix-timestamp'] as string,
        'svix-signature': req.headers['svix-signature'] as string,
      });
    } catch {
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    // svix returns the parsed payload — but if it doesn't, parse manually
    const payload = typeof event === 'object' ? event : JSON.parse(body.toString('utf8'));

    if (payload.type === 'user.created') {
      const { id, email_addresses, first_name, last_name, image_url } = payload.data;
      await prisma.user.upsert({
        where: { clerkId: id },
        update: {
          email: email_addresses[0]?.email_address || '',
          name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
          avatarUrl: image_url ?? null,
        },
        create: {
          clerkId: id,
          email: email_addresses[0]?.email_address || '',
          name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
          avatarUrl: image_url ?? null,
        },
      });
    }

    if (payload.type === 'user.updated') {
      const { id, email_addresses, first_name, last_name, image_url } = payload.data;
      await prisma.user.updateMany({
        where: { clerkId: id },
        data: {
          email: email_addresses[0]?.email_address || '',
          name: `${first_name || ''} ${last_name || ''}`.trim() || 'User',
          avatarUrl: image_url ?? null,
        },
      });
    }

    if (payload.type === 'user.deleted') {
      await prisma.user.deleteMany({ where: { clerkId: payload.data.id } });
    }

    return reply.send({ received: true });
  });
};
