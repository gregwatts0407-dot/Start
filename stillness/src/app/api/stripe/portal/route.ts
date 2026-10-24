import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { siteUrl } from '@/lib/utils';

export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return NextResponse.redirect(new URL('/settings', request.url), 303);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);

  const { data } = await supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
  if (!data?.stripe_customer_id) return NextResponse.redirect(new URL('/pricing', request.url), 303);

  const session = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id as string,
    return_url: `${siteUrl()}/settings`,
  });
  return NextResponse.redirect(session.url, 303);
}
