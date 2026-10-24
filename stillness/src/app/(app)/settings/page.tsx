import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PasswordForm } from '@/components/settings/password-form';
import { PreferencesForm } from '@/components/settings/preferences-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getFlags, requireViewer } from '@/lib/data/session';
import { stripeConfigured } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import type { Subscription } from '@/lib/types';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const viewer = await requireViewer();
  const flags = await getFlags();
  const supabase = await createClient();
  const { data: subscription } = await supabase.from('subscriptions').select('*').eq('user_id', viewer.profile.id).maybeSingle<Subscription>();
  const active = subscription && ['active', 'trialing'].includes(subscription.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Settings" title="Make it yours" />

      {checkout === 'success' && (
        <Card className="border-gold/30 bg-gold/10 p-5">
          <p className="font-medium">Welcome to Premium.</p>
          <p className="text-sm text-muted-foreground">It can take a few seconds for your subscription to appear below.</p>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear to friends and the community.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm profile={viewer.profile} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>These shape your recommendations, reminders and sharing.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm prefs={viewer.prefs} emailEnabled={flags.email_reminders !== false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Membership {viewer.isPremium ? <Badge variant="gold">Premium</Badge> : <Badge variant="muted">Free</Badge>}
          </CardTitle>
          <CardDescription>
            {viewer.profile.role !== 'user'
              ? 'Staff accounts include everything.'
              : active
                ? subscription.source === 'manual'
                  ? 'Premium was granted to your account by the Stillness team.'
                  : subscription.current_period_end
                    ? `${subscription.cancel_at_period_end ? 'Ends' : 'Renews'} on ${new Date(subscription.current_period_end).toLocaleDateString('en', { dateStyle: 'long' })}.`
                    : 'Your subscription is active.'
                : 'Unlock the full library, every program and offline listening.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {active && subscription.source === 'stripe' && stripeConfigured() ? (
            <form action="/api/stripe/portal" method="post">
              <Button variant="outline">Manage subscription</Button>
            </form>
          ) : !viewer.isPremium ? (
            <Button asChild variant="gold">
              <Link href="/pricing">
                <Sparkles aria-hidden /> See Premium
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {viewer.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
