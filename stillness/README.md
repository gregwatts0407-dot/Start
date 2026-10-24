# Stillness

A guided meditation platform for listeners, instructors and administrators. It's built with Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui-style components and Supabase (Auth, Postgres, Storage and Realtime), with optional Stripe subscriptions.

## What's included

- **Accounts:** email/password and magic-link sign-in, a five-step onboarding flow (goals, experience, preferred length, reminders), profiles with avatars, and instructor bios and credentials.
- **Library:** search by title, description or tag. Filter by category, length (from under 5 minutes to 45+), difficulty, voice and teacher. Separate views for favourites, recently played and sessions saved offline.
- **Player:**
  - A persistent player that keeps playing while you move around the app, with a mini player and a full-screen view.
  - Play/pause, a scrubber, ±15 s skips, voice volume and speeds from 0.8× to 1.25×.
  - An ambient layer mixed under the voice: rain, ocean, white noise, a deep hum or singing bowls.
  - Lock-screen and media-key controls (Media Session API), keyboard shortcuts and ARIA labels throughout.
- **Guidance scripts:** a session can be an uploaded recording, an external audio URL, or a timed script that the player speaks with the browser's voice, with captions. All the seeded sessions use scripts, so the app works without hosting any audio.
- **Honest progress:** listening time is counted on the server, capped at the real time elapsed and at the session's length. A session counts as complete once 90% of it has actually been heard; skipping to the end doesn't count.
- **Reflection:** after each session you're asked how you feel and given a prompt to answer. Entries are private by default, and you can choose to share each one with friends or the community.
- **Programs:** multi-day courses that either unlock one day at a time or leave every day open. Progress is tracked per enrolment, and you can restart a program.
- **Progress:** current and longest streak, total minutes, sessions completed, charts by week, month and year, your most-practised themes and a two-week mood history.
- **Habits:** a daily check-in (mood and intention), gentle in-app reminders and optional reminder emails sent by a scheduled job.
- **Community:**
  - A feed of shared reflections, filterable by everyone or friends (people who follow each other). Readers can send "calm" (a reaction) or report an entry.
  - Following instructors and other people.
  - Group challenges with a leaderboard.
  - Live sessions with a Realtime waiting room that shows who's present, lets people share intentions, and lets the host start a session that everyone hears in sync.
- **Personalisation:** a "For you" section that scores sessions on your goals, preferred length, time of day, history, the teachers you follow, your experience and what's popular, and shows why each one was picked. Plus a "Continue listening" row.
- **Instructor studio:** plays, completions, favourites and followers, plus a 30-day chart. Upload audio (its length is detected automatically) and cover images, write scripts, publish or unpublish sessions, build programs, schedule live sessions and run challenges.
- **Admin panel:** platform metrics, people (change roles, grant Premium, suspend accounts), content moderation (publish or premium status for any session or program), handling reports, hiding entries and feature flags.
- **Premium:** Stripe Checkout, the billing portal and a webhook. Premium sessions and programs, and offline downloads, are gated by row-level security, not just hidden in the interface.

## Quick start (local)

You need Node 20+, Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
cd stillness
npm install
supabase start            # starts Postgres, Auth, Storage, Realtime; applies the migration and seed
cp .env.example .env.local
```

Fill `.env.local` from the output of `supabase status`:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` (e.g. `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key` (server only) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |

Then run `npm run dev` and open http://localhost:3000.

### Demo accounts

Every seeded account uses the password **`stillness-demo`**.

| Email | Role | Notes |
| --- | --- | --- |
| `demo@example.com` | Member (free) | Six-day streak, a half-finished session, the sleep program in progress, friends with River |
| `river@example.com` | Member (Premium, granted by an admin) | Friends with Jordan |
| `maya@example.com`, `theo@example.com`, `ana@example.com` | Instructors | Own the seeded sessions, programs and live sessions |
| `admin@example.com` | Admin | Full admin panel |

The seed adds 17 sessions (3 to 60 minutes across every category), the free **7-Day Sleep Reset** (unlocks day by day), the Premium **Calm Foundations** course (any order), two challenges, two upcoming live sessions and some shared reflections.

## Hosted Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema, either with `supabase link --project-ref <ref>` then `supabase db push`, or by pasting `supabase/migrations/20261024000000_init.sql` into the SQL editor. This creates the tables, RLS policies, functions, storage buckets (`audio` private, `covers` and `avatars` public) and the Realtime publication.
3. If you want demo data, paste `supabase/seed.sql` into the SQL editor. **Don't do this in production**, because the seed creates accounts with a known password.
4. Under **Authentication → URL configuration**, set the Site URL to your domain and add `https://your-domain/auth/callback` to the redirect URLs. Magic links and email confirmations use the PKCE flow and land on `/auth/callback`. If you change the email templates to use a token hash, point them at `/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
5. To make someone an instructor or admin, sign in as an admin and use **Admin → People**. To create the very first admin, run this in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
   ```

## Optional integrations

### Stripe (Premium)

1. Create a recurring Price in Stripe and set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`.
2. Add a webhook endpoint pointing at `https://your-domain/api/stripe/webhook` for these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Set `STRIPE_WEBHOOK_SECRET` from it.
3. To test locally, run `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

Without Stripe, the upgrade button reads "Coming soon", and admins can still grant Premium by hand. Turning off the `premium_gating` feature flag makes everything free.

### Reminder emails

`GET /api/cron/reminders` emails anyone whose reminder time has passed in their own time zone (within the last hour), who hasn't practised yet today and hasn't already been reminded today. It needs `CRON_SECRET` (sent as `Authorization: Bearer …`, which Vercel Cron does automatically) and `SUPABASE_SERVICE_ROLE_KEY`. Set `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` to send real email; without them the job only logs what it would send. `vercel.json` schedules the job every 15 minutes. That needs a Vercel Pro plan: Hobby plans only allow daily cron jobs.

## Deploying to Vercel

1. Import the repository and set the project's **Root Directory** to `stillness`.
2. Add the environment variables from `.env.example`, with `NEXT_PUBLIC_SITE_URL` set to the production URL.
3. Deploy, then update the Supabase Auth URL settings and the Stripe webhook to use the production domain.

## Project structure

```
stillness/
├── supabase/
│   ├── migrations/20261024000000_init.sql   # schema, RLS, functions, triggers, storage, realtime
│   ├── seed.sql                             # demo data
│   └── config.toml                          # local Supabase settings
└── src/
    ├── app/
    │   ├── (marketing)/      # landing, pricing
    │   ├── (auth)/           # login, signup
    │   ├── onboarding/
    │   ├── (app)/            # signed-in app: home, library, meditations, programs, progress,
    │   │                     # journal, community, live, profile, settings, studio, admin
    │   ├── auth/             # callback + confirm route handlers
    │   └── api/              # stripe checkout/portal/webhook, cron reminders
    ├── actions/              # server actions (zod-validated)
    ├── components/
    │   ├── ui/               # shadcn-style primitives
    │   ├── player/           # provider, audio + scripted engines, ambient synth, UI
    │   └── …                 # feature components
    └── lib/
        ├── data/             # server-side queries
        ├── supabase/         # browser, server, middleware and service-role clients
        ├── stats.ts          # streaks and charts (time-zone aware)
        ├── recommend.ts      # "For you" scoring
        └── programs.ts       # program unlocking and progress
```

## Security model

- **RLS everywhere.** Listening history, preferences, favourites and check-ins are visible only to their owner. Journal entries are visible according to their visibility setting (friends means people who follow each other). Instructors can only change their own content.
- **Premium content.** Playable media (`meditation_media`) is a separate table that's only readable when the listener is allowed to play it. Audio files live in a private bucket, and signing a URL for one requires read access to the matching media row, so premium audio and scripts never reach free accounts.
- **Protected columns.** Triggers stop people changing their own role or suspension, or un-hiding moderated posts.
- **Aggregates only.** Analytics (instructor stats, leaderboards, popularity, the admin overview) come from `security definer` functions that return counts, never other people's rows.
- **Service-role key.** It's only used on the server: in the Stripe webhook, the reminder job and the admin email list.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # ESLint
npm run typecheck  # TypeScript
```

The app uses hand-written domain types (`src/lib/types.ts`) rather than generated ones. If you prefer generated types, run `supabase gen types typescript --local > src/lib/database.types.ts` and pass them to the clients.

## Notes and next steps

- Spoken scripts depend on the voices installed on the listener's device. Uploaded recordings give a consistent voice and play as ordinary HTML5 audio.
- Offline listening stores recordings in the browser's Cache Storage. A service worker for a fully offline app shell would be a natural next step.
- Live sessions handle the shared waiting room and synced playback. For instructors guiding live on camera, attach a video link (Zoom, Meet and so on).
