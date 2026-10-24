-- =============================================================================
-- Stillness — initial schema
--
-- Tables, helper functions, triggers, row-level security, storage buckets and
-- realtime configuration. Apply with `supabase db push` (hosted) or
-- `supabase db reset` (local, which also runs supabase/seed.sql).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type public.user_role as enum ('user', 'instructor', 'admin');
create type public.difficulty as enum ('beginner', 'intermediate', 'advanced');
create type public.experience_level as enum ('new', 'some', 'regular');
create type public.visibility as enum ('private', 'friends', 'public');
create type public.unlock_mode as enum ('sequential', 'free');
create type public.live_status as enum ('scheduled', 'live', 'ended', 'cancelled');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.challenge_goal as enum ('sessions', 'minutes');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (public) and preferences (private)
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Friend' check (char_length(display_name) between 1 and 60),
  avatar_url text,
  role public.user_role not null default 'user',
  bio text check (char_length(bio) <= 1200),
  credentials text check (char_length(credentials) <= 300),
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  goals text[] not null default '{}',
  experience_level public.experience_level not null default 'new',
  preferred_duration smallint not null default 10 check (preferred_duration between 1 and 120),
  preferred_ambient text,
  timezone text not null default 'UTC',
  reminder_enabled boolean not null default false,
  reminder_time time not null default '08:00',
  reminder_days smallint[] not null default '{0,1,2,3,4,5,6}',
  email_reminders boolean not null default false,
  inapp_reminders boolean not null default true,
  default_visibility public.visibility not null default 'private',
  onboarded_at timestamptz,
  last_reminded_on date,
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function public.touch_updated_at();

-- Create a profile and preferences row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Friend'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Role helpers (security definer so they can be used inside policies without
-- recursing through the profiles policies)
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_instructor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('instructor', 'admin') and not is_suspended
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not is_suspended);
$$;

-- Users may edit their own profile but never their own role or suspension.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.is_suspended is distinct from old.is_suspended)
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only administrators can change roles or suspension';
  end if;
  return new;
end;
$$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- -----------------------------------------------------------------------------
-- Feature flags
-- -----------------------------------------------------------------------------

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

create trigger feature_flags_touch before update on public.feature_flags
  for each row execute function public.touch_updated_at();

create or replace function public.flag_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from public.feature_flags where key = p_key), false);
$$;

-- -----------------------------------------------------------------------------
-- Subscriptions (written by the Stripe webhook with the service role, or by an
-- admin granting premium manually)
-- -----------------------------------------------------------------------------

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  source text not null default 'stripe' check (source in ('stripe', 'manual')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

create or replace function public.has_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user
      and status in ('active', 'trialing')
      and (current_period_end is null or current_period_end > now())
  )
  or exists (select 1 from public.profiles where id = p_user and role in ('instructor', 'admin'));
$$;

-- True when the current user may play premium content.
create or replace function public.can_access_premium()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.flag_enabled('premium_gating') or public.has_premium(auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Catalogue: categories, meditations and their media
-- -----------------------------------------------------------------------------

create table public.categories (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  sort_order smallint not null default 0
);

create table public.meditations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  category text not null references public.categories (slug) on update cascade,
  tags text[] not null default '{}',
  duration_seconds integer not null check (duration_seconds between 30 and 14400),
  difficulty public.difficulty not null default 'beginner',
  voice text check (char_length(voice) <= 60),
  artwork text not null default 'dusk',
  cover_url text,
  is_premium boolean not null default false,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meditations_published_idx on public.meditations (published, category);
create index meditations_instructor_idx on public.meditations (instructor_id);
create index meditations_tags_idx on public.meditations using gin (tags);

create trigger meditations_touch before update on public.meditations
  for each row execute function public.touch_updated_at();

create or replace function public.set_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

create trigger meditations_published_at before insert or update on public.meditations
  for each row execute function public.set_published_at();

-- Playable media lives apart from the metadata so premium audio and scripts are
-- only readable by people allowed to play them. A session can be backed by an
-- uploaded file (audio_path in the private "audio" bucket), an external URL, or
-- a timed guidance script that the player speaks with the browser's voice.
create table public.meditation_media (
  meditation_id uuid primary key references public.meditations (id) on delete cascade,
  audio_path text,
  audio_url text check (audio_url is null or audio_url ~ '^https://'),
  script jsonb check (script is null or jsonb_typeof(script) = 'array'),
  updated_at timestamptz not null default now(),
  constraint meditation_media_has_source check (
    audio_path is not null or audio_url is not null or script is not null
  )
);

create trigger meditation_media_touch before update on public.meditation_media
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Programs
-- -----------------------------------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 2 and 120),
  subtitle text check (char_length(subtitle) <= 160),
  description text not null default '' check (char_length(description) <= 4000),
  instructor_id uuid not null references public.profiles (id) on delete cascade,
  category text not null references public.categories (slug) on update cascade,
  artwork text not null default 'dusk',
  cover_url text,
  unlock_mode public.unlock_mode not null default 'sequential',
  is_premium boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger programs_touch before update on public.programs
  for each row execute function public.touch_updated_at();

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  meditation_id uuid not null references public.meditations (id) on delete cascade,
  day_number smallint not null check (day_number between 1 and 365),
  title text check (char_length(title) <= 120),
  note text check (char_length(note) <= 600),
  unique (program_id, day_number)
);

create index program_items_meditation_idx on public.program_items (meditation_id);

create table public.program_enrollments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, program_id)
);

-- -----------------------------------------------------------------------------
-- Listening history
-- -----------------------------------------------------------------------------

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  meditation_id uuid not null references public.meditations (id) on delete cascade,
  program_id uuid references public.programs (id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  position_seconds integer not null default 0 check (position_seconds >= 0),
  listened_seconds integer not null default 0 check (listened_seconds >= 0),
  percent smallint not null default 0 check (percent between 0 and 100),
  completed boolean not null default false,
  completed_at timestamptz
);

create index plays_user_started_idx on public.plays (user_id, started_at desc);
create index plays_meditation_idx on public.plays (meditation_id, started_at desc);

-- The server owns the derived fields: listened time is clamped to the session
-- length, percent is computed from it, and a session counts as complete once
-- 90% has actually been heard. Completion is sticky.
create or replace function public.normalize_play()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duration integer;
begin
  select duration_seconds into v_duration from public.meditations where id = new.meditation_id;
  if v_duration is null then
    raise exception 'Unknown meditation';
  end if;

  if tg_op = 'UPDATE' then
    new.user_id = old.user_id;
    new.meditation_id = old.meditation_id;
    new.started_at = old.started_at;
    new.listened_seconds = greatest(new.listened_seconds, old.listened_seconds);
  elsif auth.uid() is not null then
    new.started_at = now();
  end if;

  -- Listeners can't hear more than the wall-clock time since they pressed play
  -- (at the fastest 1.25x speed, plus a little slack for network timing).
  if auth.uid() is not null then
    new.listened_seconds = least(
      new.listened_seconds,
      floor(extract(epoch from now() - new.started_at) * 1.25)::integer + 10
    );
  end if;

  new.listened_seconds = least(new.listened_seconds, v_duration);
  new.position_seconds = least(new.position_seconds, v_duration);
  new.percent = least(100, round(new.listened_seconds * 100.0 / v_duration));
  new.updated_at = now();

  if tg_op = 'UPDATE' and old.completed then
    new.completed = true;
    new.completed_at = old.completed_at;
  else
    new.completed = new.percent >= 90;
    new.completed_at = case when new.completed then now() else null end;
  end if;

  return new;
end;
$$;

create trigger plays_normalize before insert or update on public.plays
  for each row execute function public.normalize_play();

-- Mark a program enrollment complete once every day's session has been
-- finished since the person enrolled (or restarted).
create or replace function public.update_program_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed and (tg_op = 'INSERT' or not old.completed) then
    update public.program_enrollments e
    set completed_at = now()
    where e.user_id = new.user_id
      and e.completed_at is null
      and exists (
        select 1 from public.program_items pi
        where pi.program_id = e.program_id and pi.meditation_id = new.meditation_id
      )
      and not exists (
        select 1 from public.program_items pi
        where pi.program_id = e.program_id
          and not exists (
            select 1 from public.plays p
            where p.user_id = e.user_id
              and p.meditation_id = pi.meditation_id
              and p.completed
              and p.completed_at >= e.started_at
          )
      );
  end if;
  return null;
end;
$$;

create trigger plays_program_completion after insert or update on public.plays
  for each row execute function public.update_program_completion();

-- -----------------------------------------------------------------------------
-- Favourites and follows
-- -----------------------------------------------------------------------------

create table public.favourites (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  meditation_id uuid not null references public.meditations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, meditation_id)
);

create index favourites_meditation_idx on public.favourites (meditation_id);

-- One follow graph for everyone: following an instructor subscribes to their
-- work, and two people who follow each other are friends.
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.follows where follower_id = a and followee_id = b)
     and exists (select 1 from public.follows where follower_id = b and followee_id = a);
$$;

-- -----------------------------------------------------------------------------
-- Journal, reflections and community
-- -----------------------------------------------------------------------------

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  meditation_id uuid references public.meditations (id) on delete set null,
  play_id uuid references public.plays (id) on delete set null,
  mood smallint check (mood between 1 and 5),
  prompt text check (char_length(prompt) <= 300),
  body text not null default '' check (char_length(body) <= 4000),
  visibility public.visibility not null default 'private',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(body) > 0 or meditation_id is not null)
);

create index journal_entries_user_idx on public.journal_entries (user_id, created_at desc);
create index journal_entries_feed_idx on public.journal_entries (visibility, created_at desc) where not hidden;

create trigger journal_entries_touch before update on public.journal_entries
  for each row execute function public.touch_updated_at();

-- Only admins can hide or unhide an entry.
create or replace function public.protect_journal_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hidden is distinct from old.hidden and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only administrators can moderate entries';
  end if;
  return new;
end;
$$;

create trigger journal_entries_protect before update on public.journal_entries
  for each row execute function public.protect_journal_hidden();

create table public.reactions (
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, entry_id)
);

-- -----------------------------------------------------------------------------
-- Daily check-ins
-- -----------------------------------------------------------------------------

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null,
  mood smallint check (mood between 1 and 5),
  intention text check (char_length(intention) <= 200),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- -----------------------------------------------------------------------------
-- Group challenges
-- -----------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  program_id uuid references public.programs (id) on delete set null,
  goal_type public.challenge_goal not null default 'sessions',
  goal_value integer not null check (goal_value between 1 and 10000),
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- -----------------------------------------------------------------------------
-- Live sessions
-- -----------------------------------------------------------------------------

create table public.live_events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  duration_minutes smallint not null default 30 check (duration_minutes between 5 and 240),
  join_url text check (join_url is null or join_url ~ '^https://'),
  meditation_id uuid references public.meditations (id) on delete set null,
  artwork text not null default 'dusk',
  status public.live_status not null default 'scheduled',
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create index live_events_starts_idx on public.live_events (starts_at);

create table public.live_event_rsvps (
  event_id uuid not null references public.live_events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- =============================================================================
-- Aggregate functions. These expose counts, never other people's rows.
-- =============================================================================

-- Per-meditation analytics for the calling instructor (admins see everything).
create or replace function public.instructor_stats()
returns table (
  meditation_id uuid,
  plays bigint,
  listeners bigint,
  completions bigint,
  favourites bigint,
  minutes_listened bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    (select count(*) from public.plays p where p.meditation_id = m.id),
    (select count(distinct p.user_id) from public.plays p where p.meditation_id = m.id),
    (select count(*) from public.plays p where p.meditation_id = m.id and p.completed),
    (select count(*) from public.favourites f where f.meditation_id = m.id),
    (select coalesce(sum(p.listened_seconds), 0) / 60 from public.plays p where p.meditation_id = m.id)
  from public.meditations m
  where m.instructor_id = auth.uid() or public.is_admin();
$$;

-- Daily play counts for the calling instructor's catalogue over the last N days.
create or replace function public.instructor_daily_plays(p_days integer default 30)
returns table (day date, plays bigint, completions bigint)
language sql
stable
security definer
set search_path = public
as $$
  select d::date,
         count(p.id),
         count(p.id) filter (where p.completed)
  from generate_series(current_date - (least(p_days, 365) - 1), current_date, interval '1 day') d
  left join public.plays p
    on p.started_at::date = d::date
   and p.meditation_id in (select id from public.meditations where instructor_id = auth.uid())
  group by d
  order by d;
$$;

-- Recent popularity, used to rank recommendations.
create or replace function public.popular_meditations(p_days integer default 30)
returns table (meditation_id uuid, plays bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.meditation_id, count(*)
  from public.plays p
  join public.meditations m on m.id = p.meditation_id and m.published
  where p.started_at > now() - make_interval(days => least(p_days, 365))
  group by p.meditation_id;
$$;

create or replace function public.follower_count(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.follows where followee_id = p_user;
$$;

-- Progress for everyone in a challenge, computed from plays in its date range.
create or replace function public.challenge_leaderboard(p_challenge uuid)
returns table (user_id uuid, display_name text, avatar_url text, progress bigint)
language sql
stable
security definer
set search_path = public
as $$
  select cp.user_id,
         pr.display_name,
         pr.avatar_url,
         case c.goal_type
           when 'sessions' then (
             select count(*) from public.plays p
             where p.user_id = cp.user_id and p.completed
               and p.completed_at::date between c.starts_on and c.ends_on
               and (c.program_id is null or p.meditation_id in (
                 select meditation_id from public.program_items where program_id = c.program_id))
           )
           else (
             select coalesce(sum(p.listened_seconds), 0) / 60 from public.plays p
             where p.user_id = cp.user_id
               and p.started_at::date between c.starts_on and c.ends_on
               and (c.program_id is null or p.meditation_id in (
                 select meditation_id from public.program_items where program_id = c.program_id))
           )
         end as progress
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles pr on pr.id = cp.user_id
  where cp.challenge_id = p_challenge and auth.uid() is not null
  order by progress desc, cp.joined_at asc;
$$;

-- Platform-wide numbers for the admin panel.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'instructors', (select count(*) from public.profiles where role = 'instructor'),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'premium', (select count(*) from public.subscriptions
                where status in ('active', 'trialing')
                  and (current_period_end is null or current_period_end > now())),
    'meditations', (select count(*) from public.meditations where published),
    'drafts', (select count(*) from public.meditations where not published),
    'programs', (select count(*) from public.programs where published),
    'plays_7d', (select count(*) from public.plays where started_at > now() - interval '7 days'),
    'completions_7d', (select count(*) from public.plays where completed and completed_at > now() - interval '7 days'),
    'minutes_7d', (select coalesce(sum(listened_seconds), 0) / 60 from public.plays where started_at > now() - interval '7 days'),
    'active_users_7d', (select count(distinct user_id) from public.plays where started_at > now() - interval '7 days'),
    'open_reports', (select count(*) from public.content_reports where status = 'open')
  );
end;
$$;

-- =============================================================================
-- Row-level security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.feature_flags enable row level security;
alter table public.subscriptions enable row level security;
alter table public.categories enable row level security;
alter table public.meditations enable row level security;
alter table public.meditation_media enable row level security;
alter table public.programs enable row level security;
alter table public.program_items enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.plays enable row level security;
alter table public.favourites enable row level security;
alter table public.follows enable row level security;
alter table public.journal_entries enable row level security;
alter table public.reactions enable row level security;
alter table public.content_reports enable row level security;
alter table public.checkins enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.live_events enable row level security;
alter table public.live_event_rsvps enable row level security;

-- Profiles: public cards are readable by signed-in people; you edit your own.
create policy "profiles are readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "instructor profiles are public" on public.profiles
  for select to anon using (role in ('instructor', 'admin'));
create policy "users update their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admins update any profile" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Preferences are private.
create policy "users read their preferences" on public.user_preferences
  for select to authenticated using (user_id = auth.uid());
create policy "users update their preferences" on public.user_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Feature flags: everyone reads, admins write.
create policy "flags are readable" on public.feature_flags
  for select to anon, authenticated using (true);
create policy "admins manage flags" on public.feature_flags
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Subscriptions: read your own; admins manage manual grants. Stripe writes with
-- the service role, which bypasses RLS.
create policy "users read their subscription" on public.subscriptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admins manage subscriptions" on public.subscriptions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Categories: public read, admin write.
create policy "categories are readable" on public.categories
  for select to anon, authenticated using (true);
create policy "admins manage categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Meditations: published ones are visible to all; owners and admins see drafts.
create policy "published meditations are readable" on public.meditations
  for select to anon, authenticated
  using (published or instructor_id = auth.uid() or public.is_admin());
create policy "instructors create their meditations" on public.meditations
  for insert to authenticated
  with check (instructor_id = auth.uid() and public.is_instructor());
create policy "owners and admins update meditations" on public.meditations
  for update to authenticated
  using ((instructor_id = auth.uid() and public.is_instructor()) or public.is_admin())
  with check ((instructor_id = auth.uid() and public.is_instructor()) or public.is_admin());
create policy "owners and admins delete meditations" on public.meditations
  for delete to authenticated
  using ((instructor_id = auth.uid() and public.is_instructor()) or public.is_admin());

-- Media: readable when the meditation is visible and the listener has access.
create policy "playable media is readable" on public.meditation_media
  for select to authenticated
  using (exists (
    select 1 from public.meditations m
    where m.id = meditation_id
      and (
        m.instructor_id = auth.uid()
        or public.is_admin()
        or (m.published and (not m.is_premium or public.can_access_premium()))
      )
  ));
create policy "owners manage media" on public.meditation_media
  for all to authenticated
  using (exists (
    select 1 from public.meditations m
    where m.id = meditation_id
      and ((m.instructor_id = auth.uid() and public.is_instructor()) or public.is_admin())
  ))
  with check (exists (
    select 1 from public.meditations m
    where m.id = meditation_id
      and ((m.instructor_id = auth.uid() and public.is_instructor()) or public.is_admin())
  ));

-- Programs mirror meditations.
create policy "published programs are readable" on public.programs
  for select to anon, authenticated
  using (published or instructor_id = auth.uid() or public.is_admin());
create policy "instructors create programs" on public.programs
  for insert to authenticated
  with check (instructor_id = auth.uid() and public.is_instructor());
create policy "owners and admins update programs" on public.programs
  for update to authenticated
  using ((instructor_id = auth.uid() and public.is_instructor()) or public.is_admin())
  with check ((instructor_id = auth.uid() and public.is_instructor()) or public.is_admin());
create policy "owners and admins delete programs" on public.programs
  for delete to authenticated
  using ((instructor_id = auth.uid() and public.is_instructor()) or public.is_admin());

create policy "program items follow their program" on public.program_items
  for select to anon, authenticated
  using (exists (select 1 from public.programs p where p.id = program_id));
create policy "owners manage program items" on public.program_items
  for all to authenticated
  using (exists (
    select 1 from public.programs p
    where p.id = program_id
      and ((p.instructor_id = auth.uid() and public.is_instructor()) or public.is_admin())
  ))
  with check (exists (
    select 1 from public.programs p
    where p.id = program_id
      and ((p.instructor_id = auth.uid() and public.is_instructor()) or public.is_admin())
  ));

create policy "users read their enrollments" on public.program_enrollments
  for select to authenticated using (user_id = auth.uid());
create policy "users enroll in visible programs" on public.program_enrollments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.programs p
      where p.id = program_id and p.published
        and (not p.is_premium or public.can_access_premium())
    )
  );
create policy "users update their enrollments" on public.program_enrollments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users leave programs" on public.program_enrollments
  for delete to authenticated using (user_id = auth.uid());

-- Plays are private to the listener; analytics go through the functions above.
create policy "users read their plays" on public.plays
  for select to authenticated using (user_id = auth.uid());
create policy "users record plays they may listen to" on public.plays
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.meditation_media mm where mm.meditation_id = plays.meditation_id)
  );
create policy "users update their plays" on public.plays
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete their plays" on public.plays
  for delete to authenticated using (user_id = auth.uid());

create policy "users read their favourites" on public.favourites
  for select to authenticated using (user_id = auth.uid());
create policy "users add favourites" on public.favourites
  for insert to authenticated with check (user_id = auth.uid());
create policy "users remove favourites" on public.favourites
  for delete to authenticated using (user_id = auth.uid());

create policy "follows are readable" on public.follows
  for select to authenticated using (true);
create policy "users follow others" on public.follows
  for insert to authenticated with check (follower_id = auth.uid() and public.is_active_user());
create policy "users unfollow" on public.follows
  for delete to authenticated using (follower_id = auth.uid());

-- Journal: private by default; shared entries reach friends or everyone.
create policy "journal entries by visibility" on public.journal_entries
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (not hidden and visibility = 'public')
    or (not hidden and visibility = 'friends' and public.are_friends(auth.uid(), user_id))
  );
create policy "users write journal entries" on public.journal_entries
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy "users edit their entries" on public.journal_entries
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins moderate entries" on public.journal_entries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "users delete their entries" on public.journal_entries
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Reactions are visible wherever the entry is.
create policy "reactions on visible entries" on public.reactions
  for select to authenticated
  using (exists (select 1 from public.journal_entries e where e.id = entry_id));
create policy "users react to visible entries" on public.reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.journal_entries e where e.id = entry_id)
  );
create policy "users remove reactions" on public.reactions
  for delete to authenticated using (user_id = auth.uid());

create policy "reporters and admins read reports" on public.content_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy "users report visible entries" on public.content_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (select 1 from public.journal_entries e where e.id = entry_id)
  );
create policy "admins resolve reports" on public.content_reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users manage their check-ins" on public.checkins
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "challenges are readable" on public.challenges
  for select to authenticated using (true);
create policy "instructors create challenges" on public.challenges
  for insert to authenticated with check (created_by = auth.uid() and public.is_instructor());
create policy "creators manage challenges" on public.challenges
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());
create policy "creators delete challenges" on public.challenges
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());

create policy "participants are readable" on public.challenge_participants
  for select to authenticated using (true);
create policy "users join challenges" on public.challenge_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.challenges c where c.id = challenge_id and c.ends_on >= current_date)
  );
create policy "users leave challenges" on public.challenge_participants
  for delete to authenticated using (user_id = auth.uid());

create policy "live events are readable" on public.live_events
  for select to authenticated using (true);
create policy "instructors schedule live events" on public.live_events
  for insert to authenticated with check (host_id = auth.uid() and public.is_instructor());
create policy "hosts manage live events" on public.live_events
  for update to authenticated
  using (host_id = auth.uid() or public.is_admin())
  with check (host_id = auth.uid() or public.is_admin());
create policy "hosts delete live events" on public.live_events
  for delete to authenticated using (host_id = auth.uid() or public.is_admin());

create policy "rsvps are readable" on public.live_event_rsvps
  for select to authenticated using (true);
create policy "users rsvp" on public.live_event_rsvps
  for insert to authenticated with check (user_id = auth.uid());
create policy "users cancel rsvps" on public.live_event_rsvps
  for delete to authenticated using (user_id = auth.uid());

-- =============================================================================
-- Storage
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('audio', 'audio', false, 209715200, array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/x-m4a']),
  ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Uploads go to a folder named after the uploader: <user id>/<file>.
create policy "instructors upload audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text and public.is_instructor());
create policy "instructors replace their audio" on storage.objects
  for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "instructors delete their audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
-- Listening needs a signed URL, and signing needs read access: you can read an
-- audio object exactly when you can read the media row that points to it.
create policy "listeners read playable audio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audio'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (select 1 from public.meditation_media mm where mm.audio_path = name)
    )
  );

create policy "covers are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'covers');
create policy "instructors upload covers" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text and public.is_instructor());
create policy "instructors manage their covers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars are public" on storage.objects
  for select to anon, authenticated using (bucket_id = 'avatars');
create policy "users upload their avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users replace their avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete their avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =============================================================================
-- Realtime: the live waiting room listens for status changes on its event.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.live_events;
  end if;
end;
$$;

-- =============================================================================
-- Reference data every environment needs
-- =============================================================================

insert into public.categories (slug, name, description, sort_order) values
  ('sleep', 'Sleep', 'Unwind the body and drift toward deep rest.', 1),
  ('stress-relief', 'Stress Relief', 'Release tension and return to steadiness.', 2),
  ('anxiety', 'Anxiety', 'Meet worry with kindness and ground yourself.', 3),
  ('focus', 'Focus', 'Gather scattered attention and work with clarity.', 4),
  ('mindfulness', 'Mindfulness', 'Foundational practices for present-moment awareness.', 5),
  ('body-scan', 'Body Scan', 'Move attention slowly through the body.', 6),
  ('breathwork', 'Breathwork', 'Use the breath to shift how you feel.', 7),
  ('loving-kindness', 'Loving-Kindness', 'Cultivate warmth for yourself and others.', 8),
  ('gratitude', 'Gratitude', 'Notice what is good and let it land.', 9),
  ('morning', 'Morning', 'Begin the day with intention.', 10)
on conflict (slug) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('premium_gating', true, 'Restrict premium sessions and programs to subscribers.'),
  ('community_feed', true, 'Show shared reflections in the community feed.'),
  ('live_events', true, 'Allow instructors to schedule live sessions.'),
  ('challenges', true, 'Show group challenges.'),
  ('email_reminders', true, 'Send reminder emails from the scheduled job.')
on conflict (key) do nothing;
