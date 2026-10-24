import Link from 'next/link';
import { BookOpen, HeartHandshake, Moon, Radio, Sparkles, Waves } from 'lucide-react';
import { Artwork } from '@/components/brand/artwork';
import { Button } from '@/components/ui/button';
import { SetupNotice } from '@/components/setup-notice';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const FEATURES = [
  { icon: Moon, title: 'Sleep, stress, focus', body: 'Guided sessions from three minutes to an hour, organised by what you need right now.' },
  { icon: Waves, title: 'Layer in ambience', body: 'Mix soft rain, ocean waves or a singing-bowl drone under any voice, at your own volume.' },
  { icon: BookOpen, title: 'Programs that build', body: 'Multi-day journeys like the 7-Day Sleep Reset unlock one evening at a time.' },
  { icon: Sparkles, title: 'Gentle progress', body: 'Streaks, minutes and moods tracked quietly in the background — never as pressure.' },
  { icon: HeartHandshake, title: 'Practise together', body: 'Share a reflection with friends, join a group challenge or follow your favourite teachers.' },
  { icon: Radio, title: 'Live with instructors', body: 'Gather in a waiting room and begin the same session together, in sync.' },
];

const SAMPLE = [
  { title: 'Three-Minute Reset', meta: '3 min · Stress relief', palette: 'sage' as const },
  { title: 'Drifting Into Sleep', meta: '25 min · Sleep', palette: 'night' as const },
  { title: 'Morning Clarity', meta: '8 min · Morning', palette: 'dawn' as const },
];

export default function LandingPage() {
  return (
    <>
      <section className="container grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
        <div className="animate-fade-up space-y-8">
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-sage" aria-hidden /> Guided meditation for everyday life
          </p>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] sm:text-6xl">
            A quieter mind is a few breaths away.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Stillness brings you calm, expert-led meditations for sleep, stress and focus — plus gentle programs, live sessions and a
            community that practises with you.
          </p>
          {isSupabaseConfigured() ? (
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Start for free</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">I have an account</Link>
              </Button>
            </div>
          ) : (
            <SetupNotice />
          )}
          <p className="text-sm text-muted-foreground">Free forever for the essentials. No card required.</p>
        </div>

        <div className="relative mx-auto w-full max-w-md" aria-hidden>
          <div className="absolute -inset-8 animate-breathe rounded-full bg-secondary/70 blur-2xl" />
          <div className="relative space-y-4">
            <Artwork palette="dusk" seed="hero" className="aspect-[4/3] rounded-[2rem] shadow-2xl shadow-navy/20">
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-navy-deep/70 to-transparent p-6 text-white">
                <p className="text-xs uppercase tracking-[0.2em] text-white/70">Now playing</p>
                <p className="font-display text-2xl">Letting the Day Go</p>
                <div className="mt-4 h-1 rounded-full bg-white/20">
                  <div className="h-full w-2/5 rounded-full bg-gold" />
                </div>
              </div>
            </Artwork>
            <div className="grid grid-cols-3 gap-3">
              {SAMPLE.map((s) => (
                <div key={s.title} className="space-y-2">
                  <Artwork palette={s.palette} seed={s.title} className="aspect-square rounded-2xl" />
                  <p className="text-xs font-medium leading-tight">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground">{s.meta}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y bg-card/50">
        <div className="container py-16 sm:py-24">
          <div className="mb-12 max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold sm:text-4xl">Everything you need to build a gentle habit</h2>
            <p className="text-muted-foreground">Designed to feel like a deep breath: spacious, simple and kind.</p>
          </div>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="space-y-3">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container py-16 text-center sm:py-24">
        <div className="mx-auto max-w-2xl space-y-6">
          <h2 className="text-3xl font-semibold sm:text-4xl">Begin with three minutes.</h2>
          <p className="text-lg text-muted-foreground">That’s all it takes to feel the difference. We’ll be here when you’re ready for more.</p>
          {isSupabaseConfigured() && (
            <Button asChild size="lg">
              <Link href="/signup">Create your free account</Link>
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
