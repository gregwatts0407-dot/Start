'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck, CalendarPlus, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { toggleRsvp } from '@/actions/social';
import { Artwork } from '@/components/brand/artwork';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LiveEventWithHost } from '@/lib/types';
import { formatEventTime } from '@/lib/utils';


export function LiveEventCard({ event }: { event: LiveEventWithHost }) {
  const [rsvped, setRsvped] = React.useState(event.rsvped);
  const [count, setCount] = React.useState(event.rsvp_count);
  const [pending, startTransition] = React.useTransition();
  const [when, setWhen] = React.useState<string | null>(null);
  React.useEffect(() => setWhen(formatEventTime(event.starts_at)), [event.starts_at]);
  const live = event.status === 'live';

  return (
    <div className="flex gap-4 rounded-3xl border bg-card p-3 pr-4">
      <Artwork palette={event.artwork} seed={event.id} className="w-20 shrink-0 rounded-2xl sm:w-24">
        {live && (
          <span className="absolute inset-x-0 bottom-2 flex justify-center">
            <Badge variant="glass">
              <Radio className="animate-pulse" aria-hidden /> Live
            </Badge>
          </span>
        )}
      </Artwork>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        <p className="text-xs font-medium text-sage" suppressHydrationWarning>
          {live ? 'Happening now' : (when ?? ' ')}
        </p>
        <Link href={`/live/${event.id}`} className="font-display text-lg font-medium leading-snug hover:underline">
          {event.title}
        </Link>
        <p className="text-sm text-muted-foreground">
          With {event.host?.display_name ?? 'an instructor'} · {event.duration_minutes} min · {count} going
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild size="sm" variant={live ? 'gold' : 'outline'}>
            <Link href={`/live/${event.id}`}>{live ? 'Join now' : 'Waiting room'}</Link>
          </Button>
          {!live && (
            <Button
              size="sm"
              variant={rsvped ? 'secondary' : 'ghost'}
              disabled={pending}
              aria-pressed={rsvped}
              onClick={() => {
                const next = !rsvped;
                setRsvped(next);
                setCount((c) => c + (next ? 1 : -1));
                startTransition(async () => {
                  const result = await toggleRsvp(event.id, next);
                  if (!result.ok) {
                    setRsvped(!next);
                    setCount((c) => c + (next ? -1 : 1));
                    toast.error(result.error);
                  }
                });
              }}
            >
              {rsvped ? <CalendarCheck aria-hidden /> : <CalendarPlus aria-hidden />}
              {rsvped ? 'Going' : 'RSVP'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
