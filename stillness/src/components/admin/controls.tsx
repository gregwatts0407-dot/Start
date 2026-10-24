'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { dismissReport, setEntryHidden, setFeatureFlag, setManualPremium, setUserRole, setUserSuspended } from '@/actions/admin';
import { setMeditationPremium } from '@/actions/studio';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ActionResult, Role } from '@/lib/types';

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = (fn: () => Promise<ActionResult>, onFail?: () => void, success?: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if (success) toast.success(success);
        router.refresh();
      } else {
        onFail?.();
        toast.error(result.error);
      }
    });
  return { pending, run };
}

function ActionSwitch({ initial, label, onChange }: { initial: boolean; label: string; onChange: (v: boolean) => Promise<ActionResult> }) {
  const [value, setValue] = React.useState(initial);
  const { pending, run } = useAction();
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(next) => {
        setValue(next);
        run(() => onChange(next), () => setValue(!next));
      }}
    />
  );
}

export function RoleSelect({ userId, role, name }: { userId: string; role: Role; name: string }) {
  const [value, setValue] = React.useState(role);
  const { pending, run } = useAction();
  return (
    <Select
      aria-label={`Role for ${name}`}
      value={value}
      disabled={pending}
      className="h-9 text-sm"
      containerClassName="w-36"
      onChange={(e) => {
        const next = e.target.value as Role;
        const previous = value;
        setValue(next);
        run(() => setUserRole(userId, next), () => setValue(previous), `${name} is now ${next === 'user' ? 'a member' : `an ${next}`}`);
      }}
    >
      <option value="user">Member</option>
      <option value="instructor">Instructor</option>
      <option value="admin">Admin</option>
    </Select>
  );
}

export function PremiumSwitch({ userId, premium, name, disabled }: { userId: string; premium: boolean; name: string; disabled?: boolean }) {
  if (disabled) return <span className="text-xs text-muted-foreground">Stripe</span>;
  return <ActionSwitch initial={premium} label={`Premium for ${name}`} onChange={(v) => setManualPremium(userId, v)} />;
}

export function SuspendSwitch({ userId, suspended, name }: { userId: string; suspended: boolean; name: string }) {
  return <ActionSwitch initial={suspended} label={`Suspend ${name}`} onChange={(v) => setUserSuspended(userId, v)} />;
}

export function FlagSwitch({ flagKey, enabled }: { flagKey: string; enabled: boolean }) {
  return <ActionSwitch initial={enabled} label={`Toggle ${flagKey}`} onChange={(v) => setFeatureFlag(flagKey, v)} />;
}

export function ContentPremiumSwitch({ id, premium, title }: { id: string; premium: boolean; title: string }) {
  return <ActionSwitch initial={premium} label={`Premium: ${title}`} onChange={(v) => setMeditationPremium(id, v)} />;
}

export function HideEntryButton({ entryId, hidden }: { entryId: string; hidden: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant={hidden ? 'outline' : 'destructive'} disabled={pending} onClick={() => run(() => setEntryHidden(entryId, !hidden), undefined, hidden ? 'Entry restored' : 'Entry hidden')}>
      {hidden ? 'Restore' : 'Hide'}
    </Button>
  );
}

export function DismissReportButton({ reportId }: { reportId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => dismissReport(reportId), undefined, 'Report dismissed')}>
      Dismiss
    </Button>
  );
}
