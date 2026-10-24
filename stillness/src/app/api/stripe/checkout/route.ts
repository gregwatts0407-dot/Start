import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { siteUrl } from '@/lib/utils';

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return NextResponse.redirect(new URL('/pricing?error=unavailable', request.url), 303);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/pricing', request.url), 303);

  const stripe = getStripe();
  const admin = createAdminClient();
  const { data: existing } = await supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();

  let customerId = existing?.stripe_customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await admin?.from('subscriptions').upsert(
      { user_id: user.id, stripe_customer_id: customerId, source: 'stripe', status: 'incomplete' },
      { onConflict: 'user_id' },
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    success_url: `${siteUrl()}/settings?checkout=success`,
    cancel_url: `${siteUrl()}/pricing`,
  });

  return NextResponse.redirect(session.url!, 303);
}
