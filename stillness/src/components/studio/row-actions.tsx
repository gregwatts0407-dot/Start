'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/types';

export function PublishSwitch({
  id,
  published,
  label,
  action,
}: {
  id: string;
  published: boolean;
  label: string;
  action: (id: string, published: boolean) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(published);
  const [pending, startTransition] = React.useTransition();
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label={`${value ? 'Unpublish' : 'Publish'} ${label}`}
      onCheckedChange={(next) => {
        setValue(next);
        startTransition(async () => {
          const result = await action(id, next);
          if (!result.ok) {
            setValue(!next);
            toast.error(result.error);
          } else {
            toast.success(next ? 'Published' : 'Moved to drafts');
            router.refresh();
          }
        });
      }}
    />
  );
}

export function RowMenu({ editHref, label, onDelete }: { editHref: string; label: string; onDelete: () => Promise<ActionResult> }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${label}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={editHref}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{label}”?</DialogTitle>
            <DialogDescription>This can’t be undone. Listening history for it will be removed too.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await onDelete();
                  if (result.ok) {
                    setConfirm(false);
                    toast.success('Deleted');
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
