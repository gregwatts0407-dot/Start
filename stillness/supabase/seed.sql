-- =============================================================================
-- Stillness — demo seed data
--
-- Creates demo accounts (password for all: stillness-demo), three instructors,
-- 17 guided sessions, two programs and a little community activity so the app
-- is usable straight away. Run automatically by `supabase db reset`, or paste
-- into the SQL editor of a hosted project after applying the migration.
--
-- The sessions ship with timed guidance scripts that the player speaks with
-- the browser's voice, so no audio files are needed. Upload real recordings
-- from the instructor studio to replace them.
--
-- DO NOT run this against a production project: it creates known passwords.
-- =============================================================================

begin;

-- Accounts ---------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', 'admin@example.com',
  extensions.crypt('stillness-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Sam Rivera"}',
  now() - interval '60 days', now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '{"sub":"00000000-0000-4000-a000-000000000001","email":"admin@example.com","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', 'maya@example.com',
  extensions.crypt('stillness-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Maya Okafor"}',
  now() - interval '60 days', now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', '{"sub":"00000000-0000-4000-a000-000000000002","email":"maya@example.com","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', 'theo@example.com',
  extensions.crypt('stillness-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Theo Lindqvist"}',
  now() - interval '60 days', now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003', '{"sub":"00000000-0000-4000-a000-000000000003","email":"theo@example.com","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', 'ana@example.com',
  extensions.crypt('stillness-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Ana Reyes"}',
  now() - interval '60 days', now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000004', '{"sub":"00000000-0000-4000-a000-000000000004","email":"ana@example.com","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000005', 'authenticated', 'authenticated', 'demo@example.com',
  extensions.crypt('stillness-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"Jordan Lee"}',
  now() - interval '60 days', now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000005', '{"sub":"00000000-0000-4000-a000-000000000005","email":"demo@example.com","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-000000000006', 'authenticated', 'authenticated', 'river@example.com',
  extensions.crypt('stillness-demo', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"display_name":"River Chen"}',
  now() - interval '60 days', now(), '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000006', '{"sub":"00000000-0000-4000-a000-000000000006","email":"river@example.com","email_verified":true}', 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- Profiles are created by the on_auth_user_created trigger; fill in the rest.
update public.profiles set role = 'admin', bio = 'Keeps Stillness running smoothly.', credentials = null, created_at = now() - interval '60 days' where id = '00000000-0000-4000-a000-000000000001';
update public.profiles set role = 'instructor', bio = 'Maya has taught mindfulness for over a decade, first in hospitals and now online. Her sessions are slow, warm and grounded in self-compassion — she believes rest is a skill anyone can relearn.', credentials = 'MBSR Teacher · Certified Compassion Cultivation Instructor', created_at = now() - interval '60 days' where id = '00000000-0000-4000-a000-000000000002';
update public.profiles set role = 'instructor', bio = 'A former software engineer who found meditation through burnout, Theo teaches practical, secular practices for focus and clear thinking. Expect plain language and plenty of space.', credentials = '500hr Mindfulness Teacher Training · Breathwork Facilitator', created_at = now() - interval '60 days' where id = '00000000-0000-4000-a000-000000000003';
update public.profiles set role = 'instructor', bio = 'Ana is a yoga nidra and sleep specialist. Her voice has guided thousands of people to sleep, and her body scans are known for being gentle enough for the most restless nights.', credentials = 'iRest Yoga Nidra Teacher · Sleep Health Educator', created_at = now() - interval '60 days' where id = '00000000-0000-4000-a000-000000000004';
update public.profiles set role = 'user', bio = 'Learning to slow down, one breath at a time.', credentials = null, created_at = now() - interval '60 days' where id = '00000000-0000-4000-a000-000000000005';
update public.profiles set role = 'user', bio = 'Night owl trying to become a morning person.', credentials = null, created_at = now() - interval '60 days' where id = '00000000-0000-4000-a000-000000000006';

update public.user_preferences
set onboarded_at = now() - interval '59 days', experience_level = 'some', preferred_duration = 10;

update public.user_preferences
set goals = array['sleep', 'stress', 'focus'], reminder_enabled = true, reminder_time = '07:30',
    inapp_reminders = true, default_visibility = 'friends'
where user_id = '00000000-0000-4000-a000-000000000005';

update public.user_preferences
set goals = array['anxiety', 'sleep'], experience_level = 'new', preferred_duration = 5, default_visibility = 'public'
where user_id = '00000000-0000-4000-a000-000000000006';

-- Sessions -----------------------------------------------------------------------

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000001', 'three-minute-reset', 'Three-Minute Reset',
  'A short pause for the middle of a busy day. Three minutes to drop your shoulders, take a few full breaths and come back to yourself before you carry on.',
  '00000000-0000-4000-a000-000000000002', 'stress-relief', array['quick', 'breath', 'reset', 'work']::text[], 180, 'beginner', 'Warm, unhurried', 'sage',
  false, true, now() - interval '49 days', now() - interval '49 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000001', '[{"at":2,"text":"Welcome. Wherever you are, let this be a three-minute pause."},{"at":14,"text":"Let your shoulders drop. Notice where your body meets the chair, or the floor."},{"at":32,"text":"Take a slow breath in through the nose. And a long breath out."},{"at":48,"text":"Again. Breathing in. And out, a little longer than the in-breath."},{"at":72,"text":"Now let the breath find its own rhythm. There is nothing to control. Just notice it."},{"at":108,"text":"If the mind wanders, that is completely fine. Gently come back to the next breath."},{"at":140,"text":"Notice one thing you can hear. And one thing you can feel."},{"at":162,"text":"As we close, take one more full breath. When you are ready, return to your day a little more steady."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000002', 'breath-of-arrival', 'Breath of Arrival',
  'The simplest practice there is: noticing the breath. A good first meditation, and a good one to return to whenever you feel scattered.',
  '00000000-0000-4000-a000-000000000003', 'mindfulness', array['beginner', 'breath', 'foundations']::text[], 300, 'beginner', 'Calm, plain-spoken', 'mist',
  false, true, now() - interval '48 days', now() - interval '48 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000002', '[{"at":2,"text":"Hello, and welcome. Let us take five minutes simply to arrive."},{"at":16,"text":"Find a posture that is upright but relaxed. You can close your eyes, or let your gaze rest softly on the floor."},{"at":40,"text":"Bring your attention to the breath. Feel it at the nostrils, the chest, or the belly. Wherever it is clearest."},{"at":75,"text":"You do not need to breathe in any special way. Just feel each breath as it comes and goes."},{"at":120,"text":"When you notice your mind has wandered, that moment of noticing is the practice. Smile, and come back."},{"at":180,"text":"Breathing in, knowing you are breathing in. Breathing out, knowing you are breathing out."},{"at":240,"text":"Let your attention widen now, to the whole body sitting here, breathing."},{"at":282,"text":"Take a deeper breath to finish. Thank you for arriving."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000003', 'morning-clarity', 'Morning Clarity',
  'Wake up the body, settle the mind and set one clear intention before the day pulls you in a dozen directions.',
  '00000000-0000-4000-a000-000000000004', 'morning', array['morning', 'intention', 'energy']::text[], 480, 'beginner', 'Bright, gentle', 'dawn',
  false, true, now() - interval '47 days', now() - interval '47 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000003', '[{"at":2,"text":"Good morning. Before the day begins, let us take a few minutes for you."},{"at":18,"text":"Sit comfortably and take a long stretch upward. Reach through the fingertips. And release."},{"at":45,"text":"Take three energising breaths. In through the nose, filling up. Out through the mouth."},{"at":90,"text":"Now let the breath settle. Feel the body waking up: warmth in the hands, the weight of the feet."},{"at":150,"text":"Notice how you are arriving into this day. Rested, or tired. Eager, or heavy. All of it is welcome."},{"at":220,"text":"Ask yourself gently: what matters most today? Let an answer come, without forcing it."},{"at":300,"text":"Choose a single word for your intention. Perhaps patience, or focus, or kindness. Hold it for a few breaths."},{"at":400,"text":"Imagine carrying that word with you into your first task, your first conversation."},{"at":455,"text":"Take one more full breath. Open your eyes, and step into your day with clarity."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000004', 'deep-focus-primer', 'Deep Focus Primer',
  'Ten minutes to gather scattered attention before deep work. Use it before writing, studying or any task that deserves your full mind.',
  '00000000-0000-4000-a000-000000000003', 'focus', array['work', 'concentration', 'study']::text[], 600, 'intermediate', 'Calm, plain-spoken', 'ocean',
  false, true, now() - interval '46 days', now() - interval '46 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000004', '[{"at":2,"text":"Welcome. This practice prepares your attention for focused work."},{"at":18,"text":"Close any tabs in your mind for now. They will be there when you return."},{"at":40,"text":"Choose a single point of focus: the sensation of breath at the tip of the nose."},{"at":80,"text":"Count each out-breath, from one up to ten. If you lose count, simply begin again at one."},{"at":180,"text":"Notice the pull of distraction without following it. A thought appears, and you return to the count."},{"at":270,"text":"Now let go of counting. Rest your attention on the breath with the same steadiness."},{"at":360,"text":"Think of the task ahead. See yourself beginning it, calmly, one step at a time."},{"at":450,"text":"Notice the quality of this attention: clear, steady, unhurried. This is what you will bring to your work."},{"at":560,"text":"Take one deep breath. When you open your eyes, begin your first step straight away."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000005', 'softening-anxiety', 'Softening Anxiety',
  'When worry is loud, this practice helps you ground in the body, make room for difficult feelings and meet them with kindness rather than fear.',
  '00000000-0000-4000-a000-000000000002', 'anxiety', array['anxiety', 'grounding', 'self-compassion']::text[], 600, 'beginner', 'Warm, unhurried', 'sage',
  false, true, now() - interval '45 days', now() - interval '45 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000005', '[{"at":2,"text":"Welcome. If you are feeling anxious right now, you are not alone, and you are in the right place."},{"at":20,"text":"Let us begin by feeling your feet on the ground. Press them down gently. You are here, and you are supported."},{"at":50,"text":"Name five things you can see, quietly, to yourself."},{"at":90,"text":"Now place a hand on your chest or your belly. Feel it rise and fall."},{"at":130,"text":"Breathe in for a count of four. And out for a count of six. Let the out-breath be long and slow."},{"at":200,"text":"Notice where the anxiety lives in your body. Perhaps a tightness, a flutter, or heat."},{"at":250,"text":"Rather than pushing it away, see if you can soften around it. Like loosening your grip."},{"at":320,"text":"Say to yourself: this is anxiety. It is uncomfortable, and it will pass. I can be kind to myself right now."},{"at":420,"text":"Return to the long, slow out-breath. Each exhale is a small letting go."},{"at":520,"text":"Feel your feet again. The ground beneath you. The breath moving on its own."},{"at":575,"text":"When you are ready, gently open your eyes. Take this softness with you."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000006', 'body-scan-for-rest', 'Body Scan for Rest',
  'A slow, gentle journey of attention from the crown of the head to the soles of the feet, releasing tension wherever you find it.',
  '00000000-0000-4000-a000-000000000004', 'body-scan', array['body', 'relaxation', 'tension']::text[], 1200, 'beginner', 'Soft, low', 'mist',
  false, true, now() - interval '44 days', now() - interval '44 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000006', '[{"at":3,"text":"Welcome. Lie down if you can, or sit in a way that lets the body be fully supported."},{"at":30,"text":"Let the eyes close. Take a few slow breaths and feel the body grow heavier with each exhale."},{"at":90,"text":"Bring your attention to the top of your head. Notice any sensation there: tingling, warmth, or nothing at all."},{"at":160,"text":"Move down to the forehead and the eyes. Let the small muscles around the eyes soften."},{"at":230,"text":"Feel the jaw. Let the teeth part slightly, and the tongue rest."},{"at":300,"text":"Now the neck and shoulders. Breathe into them, and on the out-breath, let them melt down."},{"at":400,"text":"Feel the arms, all the way to the fingertips. Heavy, and warm."},{"at":500,"text":"Bring attention to the chest, rising and falling. The belly, soft and open."},{"at":620,"text":"Move to the lower back and the hips. Let them sink into the surface beneath you."},{"at":740,"text":"Feel the thighs, the knees, the calves. Releasing any holding."},{"at":860,"text":"Now the ankles, and the feet. The soles, the toes. Let them be completely still."},{"at":980,"text":"Feel the whole body now, from head to toe, resting as one."},{"at":1100,"text":"Stay here for as long as you like. There is nowhere else you need to be."},{"at":1170,"text":"When you are ready, wiggle the fingers and toes, and slowly return."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000007', 'loving-kindness-circle', 'Loving-Kindness Circle',
  'A traditional metta practice that widens warmth in circles: from yourself, to someone you love, to a stranger, and finally to all beings.',
  '00000000-0000-4000-a000-000000000002', 'loving-kindness', array['compassion', 'metta', 'connection']::text[], 720, 'intermediate', 'Warm, unhurried', 'ember',
  true, true, now() - interval '43 days', now() - interval '43 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000007', '[{"at":3,"text":"Welcome to this practice of loving-kindness."},{"at":20,"text":"Settle into your seat, and bring to mind an image of yourself. Perhaps as you are now, or as a child."},{"at":60,"text":"Silently offer yourself these words: may I be safe. May I be well. May I be at ease."},{"at":150,"text":"Now bring to mind someone you love easily. See their face. Offer them the same wishes: may you be safe, may you be well, may you be at ease."},{"at":260,"text":"Next, someone neutral. Perhaps a person you pass each day but do not really know. They too want to be happy."},{"at":370,"text":"May you be safe. May you be well. May you be at ease."},{"at":450,"text":"If you feel ready, bring to mind someone you find difficult. Start small. Offer what you can."},{"at":560,"text":"Finally, let the circle widen to include everyone. All beings, everywhere."},{"at":640,"text":"May all beings be safe. May all beings be well. May all beings be at ease."},{"at":700,"text":"Rest in this warmth for a few breaths. Then gently open your eyes."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000008', 'gratitude-before-sleep', 'Gratitude Before Sleep',
  'Close the day by noticing three small good things. A simple practice that shifts attention away from worry and toward rest.',
  '00000000-0000-4000-a000-000000000004', 'gratitude', array['gratitude', 'evening', 'sleep']::text[], 420, 'beginner', 'Soft, low', 'night',
  false, true, now() - interval '42 days', now() - interval '42 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000008', '[{"at":3,"text":"Good evening. Let us end the day by noticing what was good in it."},{"at":22,"text":"Get comfortable in bed, and let the breath slow down."},{"at":60,"text":"Bring to mind one small thing from today that you are grateful for. It can be tiny: a warm drink, a kind word."},{"at":130,"text":"Let yourself feel it again. Where do you feel gratitude in the body?"},{"at":190,"text":"Now a second thing. Perhaps a person, or a moment of quiet."},{"at":260,"text":"And a third. Something about yourself, something you did well today."},{"at":330,"text":"Hold all three together, and let them settle into you like warmth."},{"at":390,"text":"The day is complete. Nothing more needs to be done. You can let go now, and rest."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000009', 'drifting-into-sleep', 'Drifting Into Sleep',
  'A long, slow wind-down designed to carry you all the way into sleep. The guidance fades into silence, so you can simply drift.',
  '00000000-0000-4000-a000-000000000002', 'sleep', array['sleep', 'insomnia', 'relaxation']::text[], 1500, 'beginner', 'Warm, unhurried', 'night',
  false, true, now() - interval '41 days', now() - interval '41 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000009', '[{"at":3,"text":"Welcome. This is your time to let go of the day and drift toward sleep."},{"at":30,"text":"Lie down comfortably and let the bed hold all of your weight."},{"at":80,"text":"Take a slow breath in, and sigh it out. Let the sigh carry away some of the day."},{"at":150,"text":"Feel the heaviness in your legs. As if they are sinking, softly, into the mattress."},{"at":240,"text":"Now your arms, heavy and still. Your hands resting."},{"at":340,"text":"Let the face soften. The forehead smooth. The jaw loose."},{"at":460,"text":"If thoughts come, let them float by like clouds. You do not have to follow them tonight."},{"at":600,"text":"Imagine you are lying on warm sand, as gentle waves come and go. Each wave carries you a little deeper."},{"at":780,"text":"Breathing in, the wave arrives. Breathing out, it drifts away."},{"at":960,"text":"Deeper, and softer. There is nothing to do. Nowhere to go."},{"at":1150,"text":"I will be quiet now. Let yourself drift into sleep."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000010', 'ocean-breath', 'Ocean Breath',
  'A guided extended-exhale breath that gently signals safety to the nervous system. Six minutes to go from wired to calm.',
  '00000000-0000-4000-a000-000000000003', 'breathwork', array['breathwork', 'calm', 'nervous system']::text[], 360, 'beginner', 'Calm, plain-spoken', 'ocean',
  false, true, now() - interval '40 days', now() - interval '40 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000010', '[{"at":2,"text":"Welcome. In this practice, we will slow the breath like waves on a quiet shore."},{"at":18,"text":"Breathe in through the nose for a count of four."},{"at":30,"text":"And out, slowly, for a count of six. Feel the out-breath like a wave pulling back."},{"at":60,"text":"Again. In, two, three, four. And out, two, three, four, five, six."},{"at":110,"text":"Keep this rhythm on your own now. Long, smooth out-breaths."},{"at":180,"text":"If it feels comfortable, lengthen the out-breath to a count of eight."},{"at":250,"text":"Notice the body softening with each exhale. The heart rate slowing."},{"at":310,"text":"Now let go of counting, and let the breath return to its natural rhythm."},{"at":345,"text":"Notice how you feel. Calm is always just a few breaths away."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000011', 'the-worry-jar', 'The Worry Jar',
  'A gentle visualisation for a busy mind. Place each worry in a jar, seal the lid, and set it aside until tomorrow.',
  '00000000-0000-4000-a000-000000000002', 'anxiety', array['worry', 'rumination', 'visualisation', 'sleep']::text[], 540, 'beginner', 'Warm, unhurried', 'dusk',
  false, true, now() - interval '39 days', now() - interval '39 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000011', '[{"at":3,"text":"Welcome. If your mind is busy with worries, this practice will help you set them down for a while."},{"at":25,"text":"Imagine a glass jar in front of you. It can be any size, any shape."},{"at":60,"text":"Notice the first worry that comes to mind. Name it in a few words."},{"at":100,"text":"Now picture placing it gently into the jar. It is not gone. It is just being held for you."},{"at":160,"text":"What is the next worry? Name it, and place it in the jar."},{"at":230,"text":"Keep going, one at a time, until the mind feels a little quieter."},{"at":330,"text":"Now place the lid on the jar, and seal it. Set it on a shelf, out of reach for tonight."},{"at":400,"text":"The worries will wait. You can pick them up tomorrow, if you need to."},{"at":460,"text":"Return to the breath. Notice the spaciousness that is here now."},{"at":520,"text":"Rest in that space for as long as you like."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000012', 'letting-the-day-go', 'Letting the Day Go',
  'A soft transition from doing to resting. Review the day kindly, let it be complete, and prepare the body for a good night.',
  '00000000-0000-4000-a000-000000000004', 'sleep', array['evening', 'transition', 'sleep']::text[], 720, 'beginner', 'Soft, low', 'dusk',
  false, true, now() - interval '38 days', now() - interval '38 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000012', '[{"at":3,"text":"Good evening. Let us take some time to close the day."},{"at":25,"text":"Settle in, and take a long, slow breath. Let the shoulders drop away from the ears."},{"at":80,"text":"Think back to this morning. Let the day replay gently, like a film, without judging any of it."},{"at":180,"text":"Notice moments that were hard. Breathe into them, and let them be."},{"at":270,"text":"Notice moments that were good. Let them land."},{"at":360,"text":"Now say to yourself: the day is done. I did what I could. I can let it go."},{"at":440,"text":"Feel the body becoming heavier. Breath slowing. Warmth spreading."},{"at":560,"text":"With each out-breath, release a little more of the day."},{"at":680,"text":"You have arrived at night. It is time to rest."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000013', 'wind-down-body-scan', 'Wind-Down Body Scan',
  'A bedtime body scan that moves slowly from the toes upward, releasing each part of the body into sleep.',
  '00000000-0000-4000-a000-000000000004', 'sleep', array['body', 'sleep', 'evening']::text[], 900, 'beginner', 'Soft, low', 'night',
  false, true, now() - interval '37 days', now() - interval '37 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000013', '[{"at":3,"text":"Welcome. Lie down and get completely comfortable. This practice will help the body prepare for sleep."},{"at":35,"text":"Bring your attention to your toes. Let them relax completely."},{"at":110,"text":"The soles of the feet. The heels. The ankles. Soft and heavy."},{"at":200,"text":"The calves and the knees. Let any holding melt away."},{"at":290,"text":"The thighs and hips. Sinking into the bed."},{"at":380,"text":"The belly. Soft, rising and falling."},{"at":470,"text":"The chest, the shoulders, the arms. Heavy and warm."},{"at":570,"text":"The neck and the face. Every muscle at rest."},{"at":680,"text":"The whole body now, resting, heavy, ready for sleep."},{"at":800,"text":"Let the breath carry you down, deeper and deeper. Goodnight."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000014', 'open-awareness', 'Open Awareness',
  'A spacious, lightly guided sit for experienced meditators. Move from the breath to sounds, sensations and thoughts, then rest in awareness itself.',
  '00000000-0000-4000-a000-000000000003', 'mindfulness', array['awareness', 'advanced', 'silence']::text[], 1800, 'advanced', 'Calm, plain-spoken', 'mist',
  true, true, now() - interval '36 days', now() - interval '36 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000014', '[{"at":3,"text":"Welcome. This is a longer sit, with long silences. Settle into a posture you can hold comfortably."},{"at":40,"text":"Begin with the breath. Simply feel it, for the next few minutes."},{"at":300,"text":"Now let the breath move into the background, and open to sounds. Near and far. Arising and passing."},{"at":600,"text":"Include body sensations. Pressure, warmth, tingling. Let them come and go like the sounds."},{"at":900,"text":"Now notice thoughts as events in the mind. Arising, staying, passing. Like weather."},{"at":1200,"text":"Finally, let go of any object. Rest in the awareness that knows all of this. Open, and still."},{"at":1700,"text":"Begin to return. Feel the breath once more."},{"at":1760,"text":"Thank you for practising. Take this openness with you."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000015', 'long-night-rest', 'Long Night Rest',
  'For nights when sleep feels far away. Forty-five minutes of slow guidance and long, quiet stretches designed to be listened to in bed.',
  '00000000-0000-4000-a000-000000000002', 'sleep', array['sleep', 'long', 'insomnia']::text[], 2700, 'intermediate', 'Warm, unhurried', 'night',
  true, true, now() - interval '35 days', now() - interval '35 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000015', '[{"at":3,"text":"Welcome. If sleep is hard to find tonight, let us rest together without any pressure to sleep."},{"at":60,"text":"Rest is enough. The body is restoring itself even now."},{"at":240,"text":"Feel the breath, slow and soft. Each out-breath a little longer."},{"at":600,"text":"Let the body sink, part by part. Feet. Legs. Hips. Back. Shoulders. Arms. Face."},{"at":1100,"text":"If you are still awake, that is perfectly fine. Simply rest here, breathing."},{"at":1700,"text":"Imagine a dim, warm room. The sound of soft rain outside. You are safe, and warm."},{"at":2300,"text":"Let go a little more. Deeper still."},{"at":2650,"text":"Rest now, in silence. Goodnight."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000016', 'yoga-nidra-deep-rest', 'Yoga Nidra: Deep Rest',
  'A full hour of yoga nidra — the practice of yogic sleep. Move through intention, body rotation, breath and imagery into profound rest.',
  '00000000-0000-4000-a000-000000000004', 'sleep', array['yoga nidra', 'deep rest', 'nsdr']::text[], 3600, 'advanced', 'Soft, low', 'dusk',
  true, true, now() - interval '34 days', now() - interval '34 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000016', '[{"at":3,"text":"Welcome to yoga nidra. Lie down on your back, and cover yourself with a blanket if you like."},{"at":60,"text":"Set a sankalpa, a heartfelt intention, in a short positive sentence. Repeat it three times silently."},{"at":300,"text":"We begin the rotation of awareness. Right hand thumb. Index finger. Middle finger. Ring finger. Little finger."},{"at":700,"text":"Now the left side. Left hand thumb. Index finger. Middle finger. Ring finger. Little finger."},{"at":1100,"text":"Become aware of the breath, flowing in and out of the nostrils. Count backwards from twenty-seven."},{"at":1800,"text":"Feel the body heavy, as if made of stone. Now light, as if floating."},{"at":2400,"text":"Picture a calm lake at dawn. Mist on the water. Stillness."},{"at":3000,"text":"Recall your sankalpa, and repeat it three times."},{"at":3400,"text":"Slowly become aware of the room around you. The sounds. The body lying here."},{"at":3540,"text":"Yoga nidra is complete. Move gently, and take your time."}]'::jsonb)
on conflict (meditation_id) do nothing;

insert into public.meditations (id, slug, title, description, instructor_id, category, tags, duration_seconds,
  difficulty, voice, artwork, is_premium, published, published_at, created_at)
values ('10000000-0000-4000-a000-000000000017', 'single-task-focus', 'Single-Task Focus',
  'Train the muscle of returning. Fifteen minutes with longer silent stretches to practise staying with one thing.',
  '00000000-0000-4000-a000-000000000003', 'focus', array['work', 'focus', 'productivity']::text[], 900, 'intermediate', 'Calm, plain-spoken', 'sage',
  false, true, now() - interval '33 days', now() - interval '33 days')
on conflict (id) do nothing;
insert into public.meditation_media (meditation_id, script) values ('10000000-0000-4000-a000-000000000017', '[{"at":2,"text":"Welcome. Today we practise doing one thing at a time."},{"at":20,"text":"Rest your attention on the breath at the belly."},{"at":60,"text":"Every time the mind wanders, simply note \"wandering\", and return. No criticism."},{"at":240,"text":"Notice: each return is a repetition, strengthening your ability to focus."},{"at":480,"text":"Keep going. One breath. Then the next."},{"at":720,"text":"Now widen your attention a little, holding the breath and the whole body together."},{"at":840,"text":"Finish with an intention: for the next hour, I will do one thing at a time."}]'::jsonb)
on conflict (meditation_id) do nothing;

-- Programs ----------------------------------------------------------------------

insert into public.programs (id, slug, title, subtitle, description, instructor_id, category, artwork, unlock_mode, is_premium, published)
values ('20000000-0000-4000-a000-000000000001', 'seven-day-sleep-reset', '7-Day Sleep Reset', 'A week of evenings to retrain your body for rest',
  'Restless nights rarely have one cause, so this program works on several at once: winding down, quieting worry, releasing physical tension and building a calm bedtime ritual. Each evening unlocks once you complete the one before. Listen in bed, with the lights low.',
  '00000000-0000-4000-a000-000000000004', 'sleep', 'night', 'sequential', false, true)
on conflict (id) do nothing;
insert into public.program_items (program_id, meditation_id, day_number, title, note) values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000012', 1, 'Close the day', 'Start the week by learning to mark the end of the day.'),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000008', 2, 'Notice the good', 'Shift attention from what went wrong to what went right.'),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000010', 3, 'Slow the breath', 'A breathing pattern you can use any time you wake in the night.'),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000013', 4, 'Release the body', 'Physical tension keeps the mind alert. Let it go.'),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000011', 5, 'Set worries aside', 'Give the busy mind somewhere to put its thoughts.'),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000006', 6, 'Go deeper', 'A longer scan for deeper physical rest.'),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000009', 7, 'Drift away', 'Bring it all together and let yourself drift into sleep.')
on conflict (program_id, day_number) do nothing;

insert into public.programs (id, slug, title, subtitle, description, instructor_id, category, artwork, unlock_mode, is_premium, published)
values ('20000000-0000-4000-a000-000000000002', 'calm-foundations', 'Calm Foundations', 'Five essential practices for a steady mind',
  'A short course in the core skills of meditation: anchoring in the breath, resetting under stress, focusing attention, cultivating kindness and resting in open awareness. Take the sessions in any order.',
  '00000000-0000-4000-a000-000000000003', 'mindfulness', 'mist', 'free', true, true)
on conflict (id) do nothing;
insert into public.program_items (program_id, meditation_id, day_number, title, note) values
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000002', 1, 'Anchor', 'Learn to rest attention on the breath.'),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 2, 'Reset', 'A tool for stressful moments.'),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000004', 3, 'Focus', 'Train attention like a muscle.'),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000007', 4, 'Warmth', 'Turn kindness toward yourself and others.'),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000014', 5, 'Openness', 'Rest in awareness itself.')
on conflict (program_id, day_number) do nothing;

-- Listening history -------------------------------------------------------------
-- Inserted with the normalising trigger off so historic timestamps are kept.
alter table public.plays disable trigger plays_normalize;
insert into public.plays (user_id, meditation_id, program_id, started_at, updated_at, position_seconds, listened_seconds, percent, completed, completed_at) values
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000012', '20000000-0000-4000-a000-000000000001', date_trunc('day', now()) - interval '6 days' + interval '22 hours', date_trunc('day', now()) - interval '6 days' + interval '22 hours' + interval '720 seconds', 720, 720, 100, true, date_trunc('day', now()) - interval '6 days' + interval '22 hours' + interval '720 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000008', '20000000-0000-4000-a000-000000000001', date_trunc('day', now()) - interval '5 days' + interval '22 hours', date_trunc('day', now()) - interval '5 days' + interval '22 hours' + interval '420 seconds', 420, 420, 100, true, date_trunc('day', now()) - interval '5 days' + interval '22 hours' + interval '420 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001', null, date_trunc('day', now()) - interval '4 days' + interval '13 hours', date_trunc('day', now()) - interval '4 days' + interval '13 hours' + interval '180 seconds', 180, 180, 100, true, date_trunc('day', now()) - interval '4 days' + interval '13 hours' + interval '180 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000004', null, date_trunc('day', now()) - interval '3 days' + interval '9 hours', date_trunc('day', now()) - interval '3 days' + interval '9 hours' + interval '600 seconds', 600, 600, 100, true, date_trunc('day', now()) - interval '3 days' + interval '9 hours' + interval '600 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000002', null, date_trunc('day', now()) - interval '2 days' + interval '8 hours', date_trunc('day', now()) - interval '2 days' + interval '8 hours' + interval '300 seconds', 300, 300, 100, true, date_trunc('day', now()) - interval '2 days' + interval '8 hours' + interval '300 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000005', null, date_trunc('day', now()) - interval '2 days' + interval '18 hours', date_trunc('day', now()) - interval '2 days' + interval '18 hours' + interval '570 seconds', 570, 570, 95, true, date_trunc('day', now()) - interval '2 days' + interval '18 hours' + interval '570 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001', null, date_trunc('day', now()) - interval '1 days' + interval '12 hours', date_trunc('day', now()) - interval '1 days' + interval '12 hours' + interval '180 seconds', 180, 180, 100, true, date_trunc('day', now()) - interval '1 days' + interval '12 hours' + interval '180 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000009', null, date_trunc('day', now()) - interval '1 days' + interval '23 hours', date_trunc('day', now()) - interval '1 days' + interval '23 hours' + interval '600 seconds', 600, 600, 40, false, null),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000006', null, date_trunc('day', now()) - interval '9 days' + interval '21 hours', date_trunc('day', now()) - interval '9 days' + interval '21 hours' + interval '1200 seconds', 1200, 1200, 100, true, date_trunc('day', now()) - interval '9 days' + interval '21 hours' + interval '1200 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000010', null, date_trunc('day', now()) - interval '11 days' + interval '7 hours', date_trunc('day', now()) - interval '11 days' + interval '7 hours' + interval '360 seconds', 360, 360, 100, true, date_trunc('day', now()) - interval '11 days' + interval '7 hours' + interval '360 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000003', null, date_trunc('day', now()) - interval '14 days' + interval '7 hours', date_trunc('day', now()) - interval '14 days' + interval '7 hours' + interval '480 seconds', 480, 480, 100, true, date_trunc('day', now()) - interval '14 days' + interval '7 hours' + interval '480 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001', null, date_trunc('day', now()) - interval '20 days' + interval '12 hours', date_trunc('day', now()) - interval '20 days' + interval '12 hours' + interval '180 seconds', 180, 180, 100, true, date_trunc('day', now()) - interval '20 days' + interval '12 hours' + interval '180 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000004', null, date_trunc('day', now()) - interval '27 days' + interval '10 hours', date_trunc('day', now()) - interval '27 days' + interval '10 hours' + interval '360 seconds', 360, 360, 60, false, null),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000002', null, date_trunc('day', now()) - interval '35 days' + interval '8 hours', date_trunc('day', now()) - interval '35 days' + interval '8 hours' + interval '300 seconds', 300, 300, 100, true, date_trunc('day', now()) - interval '35 days' + interval '8 hours' + interval '300 seconds'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000005', null, date_trunc('day', now()) - interval '41 days' + interval '19 hours', date_trunc('day', now()) - interval '41 days' + interval '19 hours' + interval '600 seconds', 600, 600, 100, true, date_trunc('day', now()) - interval '41 days' + interval '19 hours' + interval '600 seconds'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000010', null, date_trunc('day', now()) - interval '0 days' + interval '0 hours', date_trunc('day', now()) - interval '0 days' + interval '0 hours' + interval '360 seconds', 360, 360, 100, true, date_trunc('day', now()) - interval '0 days' + interval '0 hours' + interval '360 seconds'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000005', null, date_trunc('day', now()) - interval '1 days' + interval '22 hours', date_trunc('day', now()) - interval '1 days' + interval '22 hours' + interval '600 seconds', 600, 600, 100, true, date_trunc('day', now()) - interval '1 days' + interval '22 hours' + interval '600 seconds'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000011', null, date_trunc('day', now()) - interval '2 days' + interval '23 hours', date_trunc('day', now()) - interval '2 days' + interval '23 hours' + interval '540 seconds', 540, 540, 100, true, date_trunc('day', now()) - interval '2 days' + interval '23 hours' + interval '540 seconds'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000001', null, date_trunc('day', now()) - interval '3 days' + interval '12 hours', date_trunc('day', now()) - interval '3 days' + interval '12 hours' + interval '180 seconds', 180, 180, 100, true, date_trunc('day', now()) - interval '3 days' + interval '12 hours' + interval '180 seconds'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000009', null, date_trunc('day', now()) - interval '4 days' + interval '23 hours', date_trunc('day', now()) - interval '4 days' + interval '23 hours' + interval '1050 seconds', 1050, 1050, 70, false, null),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000003', null, date_trunc('day', now()) - interval '5 days' + interval '7 hours', date_trunc('day', now()) - interval '5 days' + interval '7 hours' + interval '480 seconds', 480, 480, 100, true, date_trunc('day', now()) - interval '5 days' + interval '7 hours' + interval '480 seconds'),
  ('00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000004', null, date_trunc('day', now()) - interval '2 days' + interval '9 hours', date_trunc('day', now()) - interval '2 days' + interval '9 hours' + interval '600 seconds', 600, 600, 100, true, date_trunc('day', now()) - interval '2 days' + interval '9 hours' + interval '600 seconds'),
  ('00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000006', null, date_trunc('day', now()) - interval '3 days' + interval '21 hours', date_trunc('day', now()) - interval '3 days' + interval '21 hours' + interval '1200 seconds', 1200, 1200, 100, true, date_trunc('day', now()) - interval '3 days' + interval '21 hours' + interval '1200 seconds'),
  ('00000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000001', null, date_trunc('day', now()) - interval '1 days' + interval '15 hours', date_trunc('day', now()) - interval '1 days' + interval '15 hours' + interval '180 seconds', 180, 180, 100, true, date_trunc('day', now()) - interval '1 days' + interval '15 hours' + interval '180 seconds'),
  ('00000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000010', null, date_trunc('day', now()) - interval '2 days' + interval '12 hours', date_trunc('day', now()) - interval '2 days' + interval '12 hours' + interval '360 seconds', 360, 360, 100, true, date_trunc('day', now()) - interval '2 days' + interval '12 hours' + interval '360 seconds');
alter table public.plays enable trigger plays_normalize;

insert into public.program_enrollments (user_id, program_id, started_at) values
  ('00000000-0000-4000-a000-000000000005', '20000000-0000-4000-a000-000000000001', date_trunc('day', now()) - interval '6 days' + interval '21 hours'),
  ('00000000-0000-4000-a000-000000000006', '20000000-0000-4000-a000-000000000001', date_trunc('day', now()) - interval '4 days')
on conflict do nothing;

-- Social graph --------------------------------------------------------------------
-- Jordan and River follow each other, so they are friends.
insert into public.follows (follower_id, followee_id) values
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000006'),
  ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000005'),
  ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000003'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003')
on conflict do nothing;

insert into public.favourites (user_id, meditation_id) values
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000006'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000012'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000010'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000009'),
  ('00000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000004')
on conflict do nothing;

-- Reflections ---------------------------------------------------------------------
insert into public.journal_entries (user_id, meditation_id, mood, prompt, body, visibility, created_at) values
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000010', 4, 'What shifted for you during this session?',
   'The longer out-breath actually works. I went from jittery to calm in about three minutes. Doing this before my morning standup from now on.',
   'public', now() - interval '6 hours'),
  ('00000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000011', 3, 'What are you ready to set down?',
   'Put three work worries in the jar last night. Still there this morning, but they felt smaller.',
   'friends', now() - interval '2 days'),
  ('00000000-0000-4000-a000-000000000002', null, 5, null,
   'A reminder for anyone reading: a wandering mind is not a failed meditation. The noticing and returning is the whole practice. Be gentle with yourselves this week.',
   'public', now() - interval '1 day'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001', 4, 'How does your body feel right now?',
   'Shoulders were up by my ears before this. Three minutes and they dropped.',
   'friends', now() - interval '1 day' + interval '12 hours'),
  ('00000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000005', 3, 'What did you notice about the anxiety?',
   'It lives in my chest. Naming it helped more than I expected.',
   'private', now() - interval '2 days' + interval '18 hours'),
  ('00000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000006', 5, null,
   'Did Ana''s body scan tonight. I teach this stuff and still forgot how good a slow scan feels.',
   'public', now() - interval '3 days');

insert into public.reactions (entry_id, user_id)
select e.id, r.uid
from public.journal_entries e
cross join (values ('00000000-0000-4000-a000-000000000005'::uuid), ('00000000-0000-4000-a000-000000000003'::uuid), ('00000000-0000-4000-a000-000000000004'::uuid)) as r(uid)
where e.visibility = 'public' and e.user_id <> r.uid
on conflict do nothing;

-- Daily check-ins -----------------------------------------------------------------
insert into public.checkins (user_id, day, mood, intention) values
  ('00000000-0000-4000-a000-000000000005', current_date - 1, 4, 'Take breaks before I need them'),
  ('00000000-0000-4000-a000-000000000005', current_date - 2, 3, 'Be patient with myself'),
  ('00000000-0000-4000-a000-000000000006', current_date, 4, 'One thing at a time')
on conflict do nothing;

-- Challenges ----------------------------------------------------------------------
insert into public.challenges (id, title, description, goal_type, goal_value, starts_on, ends_on, created_by) values
  ('30000000-0000-4000-a000-000000000001', 'Ten Mindful Days',
   'Complete ten sessions of any length this month. Short sessions count — consistency matters more than duration.',
   'sessions', 10, current_date - 5, current_date + 23, '00000000-0000-4000-a000-000000000002'),
  ('30000000-0000-4000-a000-000000000002', 'Sleep Reset Together',
   'Spend two hours with the 7-Day Sleep Reset sessions alongside others working on their rest.',
   'minutes', 120, current_date - 7, current_date + 14, '00000000-0000-4000-a000-000000000004')
on conflict do nothing;
update public.challenges set program_id = '20000000-0000-4000-a000-000000000001' where id = '30000000-0000-4000-a000-000000000002';

insert into public.challenge_participants (challenge_id, user_id) values
  ('30000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000005'),
  ('30000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006'),
  ('30000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002'),
  ('30000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000006')
on conflict do nothing;

-- Live sessions -------------------------------------------------------------------
insert into public.live_events (id, host_id, title, description, starts_at, duration_minutes, meditation_id, artwork) values
  ('40000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', 'Lunchtime Reset',
   'A short shared pause in the middle of the day. Join the waiting room a few minutes early; when Theo begins, everyone hears the session together.',
   date_trunc('hour', now()) + interval '1 day', 15, '10000000-0000-4000-a000-000000000001', 'sage'),
  ('40000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', 'Sunday Evening Sit',
   'Maya''s weekly community sit: twenty minutes of quiet practice followed by an open conversation. The video link opens when the session starts.',
   date_trunc('day', now()) + interval '3 days 18 hours', 45, null, 'dusk')
on conflict do nothing;
update public.live_events set join_url = 'https://meet.example.com/stillness-sunday' where id = '40000000-0000-4000-a000-000000000002';

insert into public.live_event_rsvps (event_id, user_id) values
  ('40000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000005'),
  ('40000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006'),
  ('40000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000006')
on conflict do nothing;

-- River has premium, granted manually; Jordan stays on the free tier.
insert into public.subscriptions (user_id, source, status) values ('00000000-0000-4000-a000-000000000006', 'manual', 'active')
on conflict (user_id) do nothing;

commit;

