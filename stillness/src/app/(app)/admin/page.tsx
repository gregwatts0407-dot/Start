import Link from 'next/link';
import { Flag, Headphones, Sparkles, Timer, Trophy, UserPlus, Users } from 'lucide-react';
import {
  ContentPremiumSwitch,
  DismissReportButton,
  FlagSwitch,
  HideEntryButton,
  PremiumSwitch,
  RoleSelect,
  SuspendSwitch,
} from '@/components/admin/controls';
import { PageHeader } from '@/components/page-header';
import { StatTile } from '@/components/stat-tile';
import { MeditationPublishSwitch, ProgramPublishSwitch } from '@/components/studio/publish-toggles';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-state';
import { requireRole } from '@/lib/data/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { FeatureFlag, JournalEntry, Meditation, Profile, Program, Subscription } from '@/lib/types';
import { cn, formatMinutes, relativeTime } from '@/lib/utils';

export const metadata = { title: 'Admin' };

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'users', label: 'People' },
  { value: 'content', label: 'Content' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'flags', label: 'Feature flags' },
] as const;

type Tab = (typeof TABS)[number]['value'];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const params = await searchParams;
  const viewer = await requireRole(['admin']);
  const tab: Tab = TABS.find((t) => t.value === params.tab)?.value ?? 'overview';
  const supabase = await createClient();

  let content: React.ReactNode = null;

  if (tab === 'overview') {
    const { data } = await supabase.rpc('admin_overview');
    const o = (data ?? {}) as Record<string, number>;
    content = (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="People" value={o.users ?? 0} hint={`${o.new_users_7d ?? 0} joined this week`} icon={<Users className="size-4" aria-hidden />} />
        <StatTile label="Active this week" value={o.active_users_7d ?? 0} hint="listened to something" icon={<UserPlus className="size-4" aria-hidden />} />
        <StatTile label="Premium members" value={o.premium ?? 0} icon={<Sparkles className="size-4 text-gold" aria-hidden />} />
        <StatTile label="Instructors" value={o.instructors ?? 0} icon={<Headphones className="size-4" aria-hidden />} />
        <StatTile label="Plays this week" value={o.plays_7d ?? 0} hint={`${o.completions_7d ?? 0} completed`} icon={<Trophy className="size-4" aria-hidden />} />
        <StatTile label="Minutes this week" value={o.minutes_7d ?? 0} icon={<Timer className="size-4" aria-hidden />} />
        <StatTile label="Published" value={o.meditations ?? 0} hint={`${o.drafts ?? 0} drafts · ${o.programs ?? 0} programs`} />
        <Link href="/admin?tab=moderation" className="rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <StatTile
            label="Open reports"
            value={o.open_reports ?? 0}
            hint="Review in Moderation"
            icon={<Flag className={cn('size-4', (o.open_reports ?? 0) > 0 && 'text-destructive')} aria-hidden />}
            className="h-full hover:bg-muted/40"
          />
        </Link>
      </div>
    );
  } else if (tab === 'users') {
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);
    const q = params.q?.replace(/[%,()]/g, '').trim();
    if (q) query = query.ilike('display_name', `%${q}%`);
    const [{ data: profiles }, { data: subs }] = await Promise.all([query, supabase.from('subscriptions').select('*')]);
    const subscriptions = new Map(((subs ?? []) as Subscription[]).map((s) => [s.user_id, s]));
    const emails = new Map<string, string>();
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const u of data?.users ?? []) if (u.email) emails.set(u.id, u.email);
    }
    content = (
      <div className="space-y-4">
        <form className="max-w-sm">
          <input type="hidden" name="tab" value="users" />
          <Input name="q" defaultValue={params.q} placeholder="Search by name" aria-label="Search people" />
        </form>
        {!admin && <p className="text-sm text-muted-foreground">Add SUPABASE_SERVICE_ROLE_KEY to show email addresses.</p>}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Person</th>
                  <th scope="col" className="px-3 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-3 py-3 font-medium">Role</th>
                  <th scope="col" className="px-3 py-3 font-medium">Premium</th>
                  <th scope="col" className="px-3 py-3 font-medium">Suspended</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {((profiles ?? []) as Profile[]).map((p) => {
                  const sub = subscriptions.get(p.id);
                  const premium = Boolean(sub && ['active', 'trialing'].includes(sub.status));
                  const self = p.id === viewer.profile.id;
                  return (
                    <tr key={p.id}>
                      <td className="px-5 py-3">
                        <Link href={`/profile/${p.id}`} className="flex items-center gap-3 hover:underline">
                          <UserAvatar name={p.display_name} src={p.avatar_url} className="size-8" />
                          <span>
                            <span className="block font-medium">{p.display_name}</span>
                            <span className="block text-xs text-muted-foreground">{emails.get(p.id) ?? ''}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en', { dateStyle: 'medium' })}</td>
                      <td className="px-3 py-3">{self ? <Badge variant="muted">You</Badge> : <RoleSelect userId={p.id} role={p.role} name={p.display_name} />}</td>
                      <td className="px-3 py-3">
                        <PremiumSwitch userId={p.id} premium={premium} name={p.display_name} disabled={sub?.source === 'stripe'} />
                      </td>
                      <td className="px-3 py-3">{!self && <SuspendSwitch userId={p.id} suspended={p.is_suspended} name={p.display_name} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  } else if (tab === 'content') {
    const [{ data: meditations }, { data: programs }] = await Promise.all([
      supabase.from('meditations').select('*, instructor:profiles!meditations_instructor_id_fkey(display_name)').order('created_at', { ascending: false }),
      supabase.from('programs').select('*').order('created_at', { ascending: false }),
    ]);
    content = (
      <div className="space-y-8">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Session</th>
                  <th scope="col" className="px-3 py-3 font-medium">Instructor</th>
                  <th scope="col" className="px-3 py-3 font-medium">Premium</th>
                  <th scope="col" className="px-3 py-3 font-medium">Published</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {((meditations ?? []) as (Meditation & { instructor: { display_name: string } | null })[]).map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3">
                      <Link href={`/studio/meditations/${m.id}`} className="font-medium hover:underline">
                        {m.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{formatMinutes(m.duration_seconds)}</span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{m.instructor?.display_name}</td>
                    <td className="px-3 py-3">
                      <ContentPremiumSwitch id={m.id} premium={m.is_premium} title={m.title} />
                    </td>
                    <td className="px-3 py-3">
                      <MeditationPublishSwitch id={m.id} published={m.published} title={m.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Programs</h2>
          {((programs ?? []) as Program[]).map((p) => (
            <Card key={p.id} className="flex items-center gap-4 p-4">
              <Link href={`/studio/programs/${p.id}`} className="flex-1 font-medium hover:underline">
                {p.title}
              </Link>
              <ProgramPublishSwitch id={p.id} published={p.published} title={p.title} />
            </Card>
          ))}
        </div>
      </div>
    );
  } else if (tab === 'moderation') {
    const [{ data: reports }, { data: entries }] = await Promise.all([
      supabase
        .from('content_reports')
        .select('*, entry:journal_entries(*, author:profiles!journal_entries_user_id_fkey(display_name)), reporter:profiles!content_reports_reporter_id_fkey(display_name)')
        .eq('status', 'open')
        .order('created_at'),
      supabase
        .from('journal_entries')
        .select('*, author:profiles!journal_entries_user_id_fkey(display_name)')
        .neq('visibility', 'private')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    type Entry = JournalEntry & { author: { display_name: string } | null };
    const openReports = (reports ?? []) as { id: string; reason: string; created_at: string; entry: Entry | null; reporter: { display_name: string } | null }[];
    content = (
      <div className="space-y-10">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Open reports</h2>
          {openReports.length ? (
            openReports.map((r) => (
              <Card key={r.id} className="space-y-3 p-5">
                <p className="text-sm">
                  <span className="font-medium">{r.reporter?.display_name ?? 'Someone'}</span> reported this {relativeTime(r.created_at)}:{' '}
                  <span className="italic text-muted-foreground">“{r.reason}”</span>
                </p>
                {r.entry && (
                  <blockquote className="rounded-2xl bg-muted/60 p-4 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">{r.entry.author?.display_name}</p>
                    {r.entry.body || 'Completed a session'}
                  </blockquote>
                )}
                <div className="flex gap-2">
                  {r.entry && <HideEntryButton entryId={r.entry.id} hidden={r.entry.hidden} />}
                  <DismissReportButton reportId={r.id} />
                </div>
              </Card>
            ))
          ) : (
            <EmptyState title="All calm" description="There are no open reports." />
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recently shared</h2>
          {((entries ?? []) as Entry[]).map((e) => (
            <Card key={e.id} className={cn('flex items-start gap-4 p-4', e.hidden && 'opacity-60')}>
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-xs text-muted-foreground">
                  {e.author?.display_name} · {e.visibility} · {relativeTime(e.created_at)}
                  {e.hidden && ' · hidden'}
                </p>
                <p className="mt-1 line-clamp-3">{e.body || 'Completed a session'}</p>
              </div>
              <HideEntryButton entryId={e.id} hidden={e.hidden} />
            </Card>
          ))}
        </section>
      </div>
    );
  } else {
    const { data: flags } = await supabase.from('feature_flags').select('*').order('key');
    content = (
      <Card className="divide-y">
        {((flags ?? []) as FeatureFlag[]).map((flag) => (
          <div key={flag.key} className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-mono text-sm font-medium">{flag.key}</p>
              {flag.description && <p className="text-sm text-muted-foreground">{flag.description}</p>}
            </div>
            <FlagSwitch flagKey={flag.key} enabled={flag.enabled} />
          </div>
        ))}
      </Card>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Platform" description="Look after the people, content and settings that make Stillness work." />
      <nav aria-label="Admin sections" className="scrollbar-none -mx-4 mb-8 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin?tab=${t.value}`}
            aria-current={tab === t.value ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm transition-colors',
              tab === t.value ? 'bg-secondary font-medium text-secondary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {content}
    </div>
  );
}
