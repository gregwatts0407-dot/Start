'use client';

import * as React from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { toggleFavourite } from '@/actions/social';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function FavouriteButton({ meditationId, initial, title }: { meditationId: string; initial: boolean; title: string }) {
  const [favourite, setFavourite] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      size="icon"
      className="size-12"
      aria-pressed={favourite}
      aria-label={favourite ? `Remove ${title} from favourites` : `Add ${title} to favourites`}
      disabled={pending}
      onClick={() => {
        const next = !favourite;
        setFavourite(next);
        startTransition(async () => {
          const result = await toggleFavourite(meditationId, next);
          if (!result.ok) {
            setFavourite(!next);
            toast.error(result.error);
          }
        });
      }}
    >
      <Heart className={cn('transition-colors', favourite && 'fill-[hsl(8_60%_60%)] text-[hsl(8_60%_60%)]')} />
    </Button>
  );
}
