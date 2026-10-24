'use client';

import * as React from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updateProfile } from '@/actions/preferences';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';

export function ProfileForm({ profile }: { profile: Profile }) {
  const [name, setName] = React.useState(profile.display_name);
  const [bio, setBio] = React.useState(profile.bio ?? '');
  const [credentials, setCredentials] = React.useState(profile.credentials ?? '');
  const [avatar, setAvatar] = React.useState(profile.avatar_url);
  const [uploading, setUploading] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const teacher = profile.role !== 'user';

  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Please choose an image under 2MB.');
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (error) {
      setUploading(false);
      toast.error('Upload failed. Try a JPG, PNG or WebP image.');
      return;
    }
    const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const result = await updateProfile({ display_name: name, bio: bio || null, credentials: credentials || null, avatar_url: url });
    setUploading(false);
    if (result.ok) {
      setAvatar(url);
      toast.success('Photo updated');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateProfile({ display_name: name, bio: bio || null, credentials: credentials || null, avatar_url: avatar });
          if (result.ok) toast.success(result.message ?? 'Saved');
          else toast.error(result.error);
        });
      }}
    >
      <div className="flex items-center gap-4">
        <UserAvatar name={name} src={avatar} className="size-20 text-xl" />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id="avatar-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
          {uploading ? 'Uploading…' : 'Change photo'}
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">About you</Label>
        <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1200} placeholder="A line or two others will see on your profile." />
      </div>
      {teacher && (
        <div className="space-y-2">
          <Label htmlFor="credentials">Credentials</Label>
          <Input id="credentials" value={credentials} onChange={(e) => setCredentials(e.target.value)} maxLength={300} placeholder="e.g. MBSR Teacher · 500hr training" />
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}
