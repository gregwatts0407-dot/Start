'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileAudio, ImagePlus, Link2, Loader2, ScrollText, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { saveMeditation, type MeditationInput } from '@/actions/studio';
import { Artwork } from '@/components/brand/artwork';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ARTWORKS, DIFFICULTIES } from '@/lib/constants';
import { formatScript, parseScript } from '@/lib/script';
import { createClient } from '@/lib/supabase/client';
import type { Artwork as ArtworkName, Category, Meditation, MeditationMedia } from '@/lib/types';
import { cn, formatClock } from '@/lib/utils';

type Source = MeditationInput['source'];

interface MeditationFormProps {
  userId: string;
  categories: Category[];
  meditation?: Meditation | null;
  media?: MeditationMedia | null;
}

const SCRIPT_EXAMPLE = `0:03 Welcome. Find a comfortable position.
0:30 Let your attention rest on the breath.
2:00 If the mind wanders, gently come back.
4:40 Take one more full breath, and open your eyes.`;

/** Read an audio file's length in the browser before uploading it. */
function audioDuration(source: File | string) {
  return new Promise<number | null>((resolve) => {
    const audio = new Audio();
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const done = (value: number | null) => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

export function MeditationForm({ userId, categories, meditation, media }: MeditationFormProps) {
  const router = useRouter();
  const initialSource: Source = media?.audio_path ? 'upload' : media?.audio_url ? 'url' : media?.script ? 'script' : 'upload';

  const [title, setTitle] = React.useState(meditation?.title ?? '');
  const [description, setDescription] = React.useState(meditation?.description ?? '');
  const [category, setCategory] = React.useState(meditation?.category ?? categories[0]?.slug ?? '');
  const [tags, setTags] = React.useState(meditation?.tags.join(', ') ?? '');
  const [difficulty, setDifficulty] = React.useState<MeditationInput['difficulty']>(meditation?.difficulty ?? 'beginner');
  const [voice, setVoice] = React.useState(meditation?.voice ?? '');
  const [artwork, setArtwork] = React.useState<ArtworkName>(meditation?.artwork ?? 'dusk');
  const [coverUrl, setCoverUrl] = React.useState<string | null>(meditation?.cover_url ?? null);
  const [isPremium, setIsPremium] = React.useState(meditation?.is_premium ?? false);
  const [published, setPublished] = React.useState(meditation?.published ?? false);
  const [duration, setDuration] = React.useState(meditation?.duration_seconds ?? 600);

  const [source, setSource] = React.useState<Source>(initialSource);
  const [audioPath, setAudioPath] = React.useState<string | null>(media?.audio_path ?? null);
  const [audioName, setAudioName] = React.useState<string | null>(media?.audio_path?.split('/').pop() ?? null);
  const [audioUrl, setAudioUrl] = React.useState(media?.audio_url ?? '');
  const [scriptText, setScriptText] = React.useState(formatScript(media?.script) || '');
  const [uploading, setUploading] = React.useState<'audio' | 'cover' | null>(null);
  const [pending, startTransition] = React.useTransition();

  const parsedScript = React.useMemo(() => parseScript(scriptText), [scriptText]);
  const durationFromFile = source !== 'script' && Boolean(source === 'upload' ? audioPath : audioUrl);

  const uploadAudio = async (file: File) => {
    if (file.size > 200 * 1024 * 1024) {
      toast.error('Audio files can be up to 200MB.');
      return;
    }
    setUploading('audio');
    const seconds = await audioDuration(file);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from('audio').upload(path, file, { contentType: file.type || 'audio/mpeg' });
    setUploading(null);
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return;
    }
    setAudioPath(path);
    setAudioName(file.name);
    if (seconds) setDuration(seconds);
    toast.success(seconds ? `Uploaded · ${formatClock(seconds)}` : 'Uploaded');
  };

  const uploadCover = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Cover images can be up to 5MB.');
      return;
    }
    setUploading('cover');
    const supabase = createClient();
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('covers').upload(path, file, { contentType: file.type });
    setUploading(null);
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      return;
    }
    setCoverUrl(supabase.storage.from('covers').getPublicUrl(path).data.publicUrl);
  };

  const detectUrlDuration = async () => {
    if (!/^https:\/\//.test(audioUrl)) return;
    const seconds = await audioDuration(audioUrl);
    if (seconds) setDuration(seconds);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveMeditation({
        id: meditation?.id ?? null,
        title,
        description,
        category,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        difficulty,
        voice: voice.trim() || null,
        artwork,
        cover_url: coverUrl,
        is_premium: isPremium,
        published,
        duration_seconds: duration,
        source,
        audio_path: source === 'upload' ? audioPath : null,
        audio_url: source === 'url' ? audioUrl.trim() || null : null,
        script_text: source === 'script' ? scriptText : null,
      });
      if (result.ok) {
        toast.success(published ? 'Session published' : 'Draft saved');
        router.push('/studio');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Who is this for, and what will they experience?"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <Select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as MeditationInput['difficulty'])}>
                  {DIFFICULTIES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice">Voice</Label>
                <Input id="voice" value={voice} onChange={(e) => setVoice(e.target.value)} maxLength={60} placeholder="e.g. Warm, unhurried" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="breath, evening, beginner" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audio</CardTitle>
            <CardDescription>Upload a recording, link to one, or write a timed script the player will speak.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Audio source">
              {(
                [
                  { value: 'upload', label: 'Upload', icon: Upload },
                  { value: 'url', label: 'Link', icon: Link2 },
                  { value: 'script', label: 'Script', icon: ScrollText },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={source === value}
                  onClick={() => setSource(value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    source === value ? 'border-sage bg-secondary text-secondary-foreground' : 'hover:bg-muted',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            {source === 'upload' && (
              <div className="space-y-2">
                <label
                  htmlFor="audio-file"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
                >
                  {uploading === 'audio' ? <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden /> : <FileAudio className="size-6 text-muted-foreground" aria-hidden />}
                  <span className="text-sm font-medium">{uploading === 'audio' ? 'Uploading…' : audioName ? 'Replace recording' : 'Choose an audio file'}</span>
                  <span className="text-xs text-muted-foreground">{audioName ?? 'MP3, M4A, WAV or OGG · up to 200MB'}</span>
                  <input
                    id="audio-file"
                    type="file"
                    accept="audio/*"
                    className="sr-only"
                    disabled={uploading !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadAudio(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}

            {source === 'url' && (
              <div className="space-y-2">
                <Label htmlFor="audio-url">Audio URL</Label>
                <Input
                  id="audio-url"
                  type="url"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  onBlur={detectUrlDuration}
                  placeholder="https://cdn.example.com/session.mp3"
                />
                <p className="text-xs text-muted-foreground">Must be https and allow playback from other sites.</p>
              </div>
            )}

            {source === 'script' && (
              <div className="space-y-2">
                <Label htmlFor="script">Guidance script</Label>
                <Textarea
                  id="script"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                  placeholder={SCRIPT_EXAMPLE}
                  aria-describedby="script-help"
                />
                <p id="script-help" className="text-xs text-muted-foreground">
                  One cue per line: a time (m:ss) then the words. Listeners hear it in their device’s voice, with captions.{' '}
                  {parsedScript.cues.length > 0 && `${parsedScript.cues.length} cues.`}
                  {parsedScript.errors.length > 0 && <span className="text-destructive"> Check line {parsedScript.errors.join(', ')}.</span>}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="duration">Length (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                max={240}
                step={0.5}
                value={Math.round((duration / 60) * 2) / 2}
                onChange={(e) => setDuration(Math.round(Number(e.target.value) * 60))}
                className="max-w-36"
                aria-describedby="duration-help"
              />
              <p id="duration-help" className="text-xs text-muted-foreground">
                {durationFromFile ? `Detected from the audio: ${formatClock(duration)}.` : 'How long the session runs, including silence.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cover</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Artwork palette={artwork} seed={title || 'preview'} coverUrl={coverUrl} className="aspect-[4/3] rounded-2xl" />
            {coverUrl ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setCoverUrl(null)}>
                <X aria-hidden /> Use generated artwork
              </Button>
            ) : (
              <>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Artwork palette">
                  {ARTWORKS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={artwork === a}
                      aria-label={a}
                      onClick={() => setArtwork(a)}
                      className={cn('rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', artwork === a && 'ring-2 ring-sage')}
                    >
                      <Artwork palette={a} seed={a} className="size-9 rounded-full" />
                    </button>
                  ))}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
                  {uploading === 'cover' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
                  Upload an image
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadCover(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="premium">Premium</Label>
                <p className="text-sm text-muted-foreground">Only subscribers can play it.</p>
              </div>
              <Switch id="premium" checked={isPremium} onCheckedChange={setIsPremium} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="published">Published</Label>
                <p className="text-sm text-muted-foreground">Visible in the library.</p>
              </div>
              <Switch id="published" checked={published} onCheckedChange={setPublished} />
            </div>
            <Button type="submit" className="w-full" disabled={pending || uploading !== null}>
              {pending ? 'Saving…' : published ? 'Save and publish' : 'Save draft'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
