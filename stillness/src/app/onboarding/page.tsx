import { redirect } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { getViewer } from '@/lib/data/session';

// Every page here depends on who is signed in.
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Welcome' };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/onboarding');
  if (viewer.prefs.onboarded_at) redirect('/home');
  return (
    <div className="flex min-h-dvh flex-col px-6 py-8">
      <Logo href="/onboarding" />
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-10">
        <OnboardingFlow name={viewer.profile.display_name.split(' ')[0] ?? ''} />
      </main>
    </div>
  );
}
