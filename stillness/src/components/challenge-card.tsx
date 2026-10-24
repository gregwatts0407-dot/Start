'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { toggleChallenge } from '@/actions/social';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { Challenge, LeaderboardRow } from '@/lib/types';

interface ChallengeCardProps {
  challenge: Challenge;
  joined: boolean;
  participantCount: number;
  leaderboard: LeaderboardRow[];
  myProgress: number;
  programTitle?: string;
}

export function ChallengeCard({ challenge, joined, participantCount, leaderboard, myProgress, programTitle }: ChallengeCardProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const unit = challenge.goal_type === 'sessions' ? 'sessions' : 'minutes';
  const percent = Math.min(100, Math.round((myProgress / challenge.goal_value) * 100));
  const daysLeft = Math.max(0, Math.ceil((new Date(`${challenge.ends_on}T23:59:59`).getTime() - Date.now()) / 86400_000));

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Trophy className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-medium leading-snug">{challenge.title}</h3>
          <p className="text-sm text-muted-foreground">
            {challenge.goal_value} {unit}
            {programTitle ? ` from ${programTitle}` : ''} · {daysLeft} days left · {participantCount} taking part
          </p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{challenge.description}</p>

      {joined && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span>Your progress</span>
            <span className="tabular-nums text-muted-foreground">
              {myProgress} / {challenge.goal_value} {unit}
            </span>
          </div>
          <Progress value={percent} label={`Your progress in ${challenge.title}`} tone={percent >= 100 ? 'gold' : 'sage'} />
        </div>
      )}

      {leaderboard.length > 0 && (
        <ol className="space-y-2" aria-label="Leaderboard">
          {leaderboard.slice(0, 4).map((row, i) => (
            <li key={row.user_id} className="flex items-center gap-3 text-sm">
              <span className="w-4 text-center tabular-nums text-muted-foreground">{i + 1}</span>
              <UserAvatar name={row.display_name} src={row.avatar_url} className="size-7" />
              <span className="flex-1 truncate">{row.display_name}</span>
              <span className="tabular-nums text-muted-foreground">{row.progress}</span>
            </li>
          ))}
        </ol>
      )}

      <Button
        variant={joined ? 'ghost' : 'default'}
        className="mt-auto self-start"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleChallenge(challenge.id, !joined);
            if (result.ok) {
              if (!joined) toast.success('You’ve joined. Every session counts from today.');
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        {joined ? 'Leave challenge' : 'Join challenge'}
      </Button>
    </Card>
  );
}
