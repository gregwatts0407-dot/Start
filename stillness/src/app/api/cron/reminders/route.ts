import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { localDate, localMinutes, localWeekday } from '@/lib/stats';
import { siteUrl } from '@/lib/utils';

// Sends gentle reminder emails. Schedule it every 15 minutes (see vercel.json):
// each run emails people whose reminder time has passed today, who haven't
// meditated yet today and haven't already been reminded today.

export const dynamic = 'force-dynamic';

const WINDOW_MINUTES = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Service role key missing' }, { status: 500 });

  const { data: flag } = await admin.from('feature_flags').select('enabled').eq('key', 'email_reminders').maybeSingle();
  if (flag && !flag.enabled) return NextResponse.json({ skipped: 'email reminders disabled' });

  const { data: prefs, error } = await admin
    .from('user_preferences')
    .select('user_id, timezone, reminder_time, reminder_days, last_reminded_on, profiles!inner(display_name, is_suspended)')
    .eq('reminder_enabled', true)
    .eq('email_reminders', true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let sent = 0;
  for (const row of prefs ?? []) {
    const profile = row.profiles as unknown as { display_name: string; is_suspended: boolean };
    if (profile.is_suspended) continue;
    const today = localDate(now, row.timezone);
    if (row.last_reminded_on === today) continue;
    if (!(row.reminder_days as number[]).includes(localWeekday(now, row.timezone))) continue;
    const [h, m] = (row.reminder_time as string).split(':').map(Number);
    const sinceReminder = localMinutes(now, row.timezone) - (h! * 60 + m!);
    if (sinceReminder < 0 || sinceReminder > WINDOW_MINUTES) continue;

    // Skip anyone who has already practised today (checking the last 24h is enough).
    const { data: recent } = await admin
      .from('plays')
      .select('started_at, listened_seconds')
      .eq('user_id', row.user_id)
      .gte('started_at', new Date(now.getTime() - 86400_000).toISOString());
    const practisedToday = (recent ?? []).some((p) => localDate(p.started_at, row.timezone) === today && p.listened_seconds >= 60);
    if (practisedToday) continue;

    const { data: auth } = await admin.auth.admin.getUserById(row.user_id);
    const email = auth.user?.email;
    if (!email) continue;

    const ok = await sendReminder(email, profile.display_name.split(' ')[0] ?? 'there');
    if (ok) {
      sent += 1;
      await admin.from('user_preferences').update({ last_reminded_on: today }).eq('user_id', row.user_id);
    }
  }

  return NextResponse.json({ checked: prefs?.length ?? 0, sent });
}

async function sendReminder(to: string, name: string) {
  const subject = 'A few quiet minutes for you';
  const url = `${siteUrl()}/home`;
  const text = `Hi ${name},\n\nThis is your gentle reminder to pause. Even three minutes of stillness can change the shape of a day.\n\nBegin when you're ready: ${url}\n\nYou can change or turn off reminders in Settings.`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#16213a;line-height:1.6">
    <p>Hi ${escapeHtml(name)},</p>
    <p>This is your gentle reminder to pause. Even three minutes of stillness can change the shape of a day.</p>
    <p><a href="${url}" style="display:inline-block;background:#16213a;color:#faf8f4;padding:12px 22px;border-radius:999px;text-decoration:none">Begin a session</a></p>
    <p style="color:#5a6170;font-size:13px">You can change or turn off reminders in Settings.</p>
  </div>`;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[reminders] would email ${to}: ${subject}`);
    return true;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.REMINDER_FROM_EMAIL ?? 'Stillness <reminders@example.com>', to, subject, text, html }),
  });
  if (!response.ok) console.error('[reminders] send failed', response.status, await response.text());
  return response.ok;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
