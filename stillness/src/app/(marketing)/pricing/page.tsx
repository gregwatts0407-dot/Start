import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getViewer } from '@/lib/data/session';
import { stripeConfigured } from '@/lib/stripe';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Pricing' };

const FREE = ['Most of the guided library', 'The 7-Day Sleep Reset program', 'Ambient sound mixing', 'Streaks, stats and journaling', 'Community, challenges and live sessions'];
const PREMIUM = ['Everything in Free', 'The full library, including long sleep and advanced sessions', 'Every program and course', 'Offline listening on your device', 'Support independent teachers'];

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const viewer = await getViewer();
  const canBuy = stripeConfigured();

  return (
    <div className="container py-16 sm:py-24">
      <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
        <h1 className="text-4xl font-semibold sm:text-5xl">Simple, gentle pricing</h1>
        <p className="text-lg text-muted-foreground">Start free. Upgrade whenever you want to go deeper.</p>
      </div>

      {error === 'unavailable' && (
        <p className="mx-auto mb-8 max-w-xl rounded-2xl border border-gold/40 bg-gold/10 p-4 text-center text-sm" role="alert">
          Online payments aren’t set up yet. An administrator can grant Premium from the admin panel.
        </p>
      )}

      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <Plan name="Free" price="£0" period="forever" features={FREE}>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href={viewer ? '/home' : '/signup'}>{viewer ? 'Continue free' : 'Start free'}</Link>
          </Button>
        </Plan>
        <Plan name="Premium" price="£7.99" period="per month" features={PREMIUM} highlighted>
          {viewer?.isPremium ? (
            <Button asChild variant="gold" size="lg" className="w-full">
              <Link href="/settings">You’re Premium</Link>
            </Button>
          ) : viewer ? (
            <form action="/api/stripe/checkout" method="post">
              <Button variant="gold" size="lg" className="w-full" disabled={!canBuy}>
                {canBuy ? 'Upgrade to Premium' : 'Coming soon'}
              </Button>
            </form>
          ) : (
            <Button asChild variant="gold" size="lg" className="w-full">
              <Link href="/signup">Create an account first</Link>
            </Button>
          )}
        </Plan>
      </div>
      <p className="mt-8 text-center text-sm text-muted-foreground">Cancel any time from Settings. Prices shown are examples — set your own in Stripe.</p>
    </div>
  );
}

function Plan({
  name,
  price,
  period,
  features,
  highlighted,
  children,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col gap-6 p-8', highlighted && 'border-gold/50 bg-navy text-white shadow-xl shadow-navy/20 dark:bg-card')}>
      <div className="space-y-2">
        <h2 className={cn('text-lg font-semibold', highlighted && 'text-gold')}>{name}</h2>
        <p>
          <span className="font-display text-4xl font-semibold">{price}</span>{' '}
          <span className={cn('text-sm', highlighted ? 'text-white/70' : 'text-muted-foreground')}>{period}</span>
        </p>
      </div>
      <ul className="flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex gap-3 text-sm">
            <Check className={cn('mt-0.5 size-4 shrink-0', highlighted ? 'text-gold' : 'text-sage')} aria-hidden />
            {f}
          </li>
        ))}
      </ul>
      {children}
    </Card>
  );
}
