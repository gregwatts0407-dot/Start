import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

const RELEVANT = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');
  if (!secret || !signature) return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch (error) {
    return NextResponse.json({ error: `Invalid signature: ${(error as Error).message}` }, { status: 400 });
  }
  if (!RELEVANT.has(event.type)) return NextResponse.json({ received: true });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });

  let subscription: Stripe.Subscription;
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!session.subscription) return NextResponse.json({ received: true });
    subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  } else {
    subscription = event.data.object as Stripe.Subscription;
  }

  const userId = subscription.metadata.user_id;
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end;

  const row = {
    source: 'stripe' as const,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    price_id: item?.price.id ?? null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };

  const { error } = userId
    ? await admin.from('subscriptions').upsert({ user_id: userId, ...row }, { onConflict: 'user_id' })
    : await admin.from('subscriptions').update(row).eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Stripe webhook upsert failed', error.message);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
