-- 444 dev seed — run in Supabase SQL Editor
-- 7 test profiles + 1 round with realistic mixed RSVPs

-- ── Auth users ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550001', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550002', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550003', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550004', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW()),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550005', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550006', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW()),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '+15555550007', NOW(), '{"provider":"phone","providers":["phone"]}', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── Profiles ──────────────────────────────────────────────────────────────────
UPDATE public.profiles SET name = 'Jordan P.',  initials = 'JP', handle = 'jordanp',  avatar_color = '#284726', avatar_text_color = '#d8d6af', rounds_played = 31, rounds_hosted = 14 WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET name = 'Marcus T.',  initials = 'MT', handle = 'marcust',  avatar_color = '#c8a96e', avatar_text_color = '#fff',     rounds_played = 22, rounds_hosted = 5  WHERE id = '22222222-2222-2222-2222-222222222222';
UPDATE public.profiles SET name = 'Connor B.',  initials = 'CB', handle = 'connorb',  avatar_color = '#4a7a9b', avatar_text_color = '#fff',     rounds_played = 18, rounds_hosted = 3  WHERE id = '33333333-3333-3333-3333-333333333333';
UPDATE public.profiles SET name = 'Priya M.',   initials = 'PM', handle = 'priyam',   avatar_color = '#9b4a7a', avatar_text_color = '#fff',     rounds_played = 14, rounds_hosted = 2  WHERE id = '44444444-4444-4444-4444-444444444444';
UPDATE public.profiles SET name = 'Jake L.',    initials = 'JL', handle = 'jakel',    avatar_color = '#7a6a3a', avatar_text_color = '#fff',     rounds_played = 9,  rounds_hosted = 1  WHERE id = '55555555-5555-5555-5555-555555555555';
UPDATE public.profiles SET name = 'Remy S.',    initials = 'RS', handle = 'remys',    avatar_color = '#5a8a5a', avatar_text_color = '#fff',     rounds_played = 6,  rounds_hosted = 0  WHERE id = '66666666-6666-6666-6666-666666666666';
UPDATE public.profiles SET name = 'Elena V.',   initials = 'EV', handle = 'elenav',   avatar_color = '#8a5a3a', avatar_text_color = '#fff',     rounds_played = 4,  rounds_hosted = 0  WHERE id = '77777777-7777-7777-7777-777777777777';

-- ── Test round ────────────────────────────────────────────────────────────────
INSERT INTO public.rounds (id, host_id, title, course_name, format, scheduled_at, spots, cost_cents, skins_bet_cents, cover_image_id, cover_is_video, note, poll_guests, total_holes, starting_hole, status)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Saturday Skins',
  'Cog Hill No. 4',
  'skins',
  (NOW() + INTERVAL '5 days'),
  8, 2000, 200,
  'tub', false,
  'No jorts. Non-negotiable.',
  false, 18, 1, 'upcoming'
) ON CONFLICT (id) DO NOTHING;

-- ── Holes ─────────────────────────────────────────────────────────────────────
INSERT INTO public.holes (round_id, hole_number, par)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', n,
  CASE WHEN n IN (3,6,8,12,15,17) THEN 3 WHEN n IN (5,10,13,18) THEN 5 ELSE 4 END
FROM generate_series(1, 18) n
ON CONFLICT DO NOTHING;

-- ── Players — mixed RSVPs ─────────────────────────────────────────────────────
-- Jordan: hosting, confirmed in
-- Marcus, Connor: also confirmed in
-- Priya, Jake: maybe (on the fence)
-- Remy, Elena: pending (haven't replied)
INSERT INTO public.round_players (round_id, player_id, rsvp, is_host)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'in',      true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'in',      false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'in',      false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'maybe',   false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'maybe',   false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'pending', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '77777777-7777-7777-7777-777777777777', 'pending', false)
ON CONFLICT (round_id, player_id) DO NOTHING;
