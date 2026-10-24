'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isSavedOffline, offlineSupported, removeOffline, saveOffline } from '@/lib/offline';

interface OfflineButtonProps {
  meditationId: string;
  src: string;
  allowed: boolean;
}

export function OfflineButton({ meditationId, src, allowed }: OfflineButtonProps) {
  const [state, setState] = React.useState<'unknown' | 'saved' | 'not-saved' | 'saving'>('unknown');

  React.useEffect(() => {
    if (!offlineSupported()) return;
    void isSavedOffline(meditationId).then((saved) => setState(saved ? 'saved' : 'not-saved'));
  }, [meditationId]);

  if (state === 'unknown') return null;

  if (!allowed) {
    return (
      <Button asChild variant="outline" size="lg">
        <Link href="/pricing">
          <Download aria-hidden /> Offline with Premium
        </Link>
      </Button>
    );
  }

  if (state === 'saved') {
    return (
      <Button
        variant="secondary"
        size="lg"
        onClick={async () => {
          await removeOffline(meditationId);
          setState('not-saved');
          toast('Removed from this device');
        }}
        aria-label="Saved for offline listening. Remove download"
      >
        <CheckCircle2 aria-hidden /> Saved offline
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={state === 'saving'}
      onClick={async () => {
        setState('saving');
        try {
          await saveOffline(meditationId, src);
          setState('saved');
          toast.success('Saved for offline listening');
        } catch {
          setState('not-saved');
          toast.error('The download didn’t finish. Please try again.');
        }
      }}
    >
      {state === 'saving' ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {state === 'saving' ? 'Saving…' : 'Save offline'}
    </Button>
  );
}
