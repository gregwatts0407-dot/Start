'use client';

import * as React from 'react';
import { Check, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { toggleFollow } from '@/actions/social';
import { Button, type ButtonProps } from '@/components/ui/button';

interface FollowButtonProps {
  profileId: string;
  initial: boolean;
  name: string;
  followsYou?: boolean;
  size?: ButtonProps['size'];
}

export function FollowButton({ profileId, initial, name, followsYou, size = 'sm' }: FollowButtonProps) {
  const [following, setFollowing] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();
  const label = following ? (followsYou ? 'Friends' : 'Following') : followsYou ? 'Follow back' : 'Follow';

  return (
    <Button
      size={size}
      variant={following ? 'secondary' : 'default'}
      disabled={pending}
      aria-pressed={following}
      aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
      onClick={() => {
        const next = !following;
        setFollowing(next);
        startTransition(async () => {
          const result = await toggleFollow(profileId, next);
          if (!result.ok) {
            setFollowing(!next);
            toast.error(result.error);
          }
        });
      }}
    >
      {following ? <Check aria-hidden /> : <UserPlus aria-hidden />}
      {label}
    </Button>
  );
}
