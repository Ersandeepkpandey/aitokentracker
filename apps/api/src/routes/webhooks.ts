import { FastifyPluginAsync } from 'fastify';
import { Webhook } from 'svix';
import { prisma } from '../lib/prisma';
import { Plan } from '@prisma/client';
import crypto from 'crypto';

function variantIdToPlan(variantId: string): Plan {
  const map: Record<string, Plan> = {
    [process.env.LEMONSQUEEZY_PRO_VARIANT_ID!]:  Plan.PRO,
    [process.env.LEMONSQUEEZY_TEAM_VARIANT_ID!]: Plan.TEAM,
  };
  return map[variantId] || Plan.FREE;
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {

  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 },
    (_req, body, done) => done(null, body)
  );

  // POST /webhooks/lemonsqueezy
  app.post('/lemonsqueezy', async (req, reply) => {
    const rawBody  = req.body as Buffer;
    const secret   = process.env.LEMONSQUEEZY_WEBHOOK_SECRET!;
    const signature = req.headers['x-signature'] as string;

    // Verify HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature || ''))) {
      return reply.status(400).send({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    const eventName  = event.meta?.event_name as string;
    const attrs      = event.data?.attributes;
    const customData = event.meta?.custom_data ?? attrs?.first_order_item?.custom_data ?? {};
    const userId     = customData?.userId as string | undefined;

    switch (eventName) {
      case 'order_created': {
        // One-time or first subscription payment
        if (userId) {
          const variantId = String(attrs?.first_order_item?.variant_id ?? '');
          await prisma.user.update({
            where: { id: userId },
            data:  { plan: variantIdToPlan(variantId) },
          });
        }
        break;
      }

      case 'subscription_created':
      case 'subscription_updated': {
        const variantId      = String(attrs?.variant_id ?? '');
        const subscriptionId = String(event.data?.id ?? '');
        const status         = attrs?.status as string;
        const renewsAt       = attrs?.renews_at ? new Date(attrs.renews_at) : null;

        const plan = status === 'active' || status === 'on_trial'
          ? variantIdToPlan(variantId)
          : Plan.FREE;

        if (userId) {
          await prisma.user.update({
            where: { id: userId },
            data:  {
              plan,
              stripeSubscriptionId:  subscriptionId,
              stripeCurrentPeriodEnd: renewsAt,
            },
          });
        }
        break;
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        const subscriptionId = String(event.data?.id ?? '');
        await prisma.user.updateMany({
          where: { stripeSubscriptionId: subscriptionId },
          data:  { plan: Plan.FREE, stripeSubscriptionId: null },
        });
        break;
      }
    }

    // POST /webhooks/clerk
    return reply.send({ received: true });
  });

  // POST /webhooks/clerk
  app.post('/clerk', async (req, reply) => {
    const wh   = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
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

    const payload = typeof event === 'object' ? event : JSON.parse(body.toString('utf8'));

    if (payload.type === 'user.created') {
      const { id, email_addresses, first_name, last_name, image_url } = payload.data;
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await prisma.user.upsert({
        where:  { clerkId: id },
        update: {
          email:     email_addresses[0]?.email_address || '',
          name:      `${first_name || ''} ${last_name || ''}`.trim() || 'User',
          avatarUrl: image_url ?? null,
        },
        create: {
          clerkId:     id,
          email:       email_addresses[0]?.email_address || '',
          name:        `${first_name || ''} ${last_name || ''}`.trim() || 'User',
          avatarUrl:   image_url ?? null,
          trialEndsAt,
        },
      });
    }

    if (payload.type === 'user.updated') {
      const { id, email_addresses, first_name, last_name, image_url } = payload.data;
      await prisma.user.updateMany({
        where: { clerkId: id },
        data:  {
          email:     email_addresses[0]?.email_address || '',
          name:      `${first_name || ''} ${last_name || ''}`.trim() || 'User',
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
