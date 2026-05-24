-- ─── Memory Machine Migration ─────────────────────────────────────────────────
-- Covers weeks 2–4: recaps, superlatives, reactions, lore, presence, labels
-- Run in Supabase SQL editor. Safe to re-run (all CREATE IF NOT EXISTS).
-- RLS is disabled for now (dev mode) — enable alongside Twilio auth.
-- ──────────────────────────────────────────────────────────────────────────────


-- ─── 1. recaps ────────────────────────────────────────────────────────────────
-- One per round. Created by host after round completes.

CREATE TABLE IF NOT EXISTS public.recaps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id         UUID UNIQUE NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES public.profiles(id),
  cover_image_id   TEXT,                        -- preset image id or upload url
  note             TEXT,                        -- host's one-liner
  winner_id        UUID REFERENCES public.profiles(id),
  visibility       TEXT NOT NULL DEFAULT 'club'
                   CHECK (visibility IN ('private', 'club', 'public')),
  reaction_counts  JSONB NOT NULL DEFAULT '{}', -- denorm: {'cinema':3,'brutal':1}
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recaps_round_id_idx   ON public.recaps(round_id);
CREATE INDEX IF NOT EXISTS recaps_created_by_idx ON public.recaps(created_by);


-- ─── 2. recap_superlatives ────────────────────────────────────────────────────
-- Awards auto-generated (or manually added) per recap.
-- Exactly one of (player_id, temp_player_id) must be set.

CREATE TABLE IF NOT EXISTS public.recap_superlatives (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id       UUID NOT NULL REFERENCES public.recaps(id) ON DELETE CASCADE,
  player_id      UUID REFERENCES public.profiles(id),
  temp_player_id UUID REFERENCES public.temp_players(id),
  label          TEXT NOT NULL,    -- 'Course Menace', 'Sunrise Sicko', etc.
  rule           TEXT,             -- 'lowest_score', 'host', 'first_rsvp', etc.
  is_custom      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sup_one_player CHECK (num_nonnulls(player_id, temp_player_id) = 1)
);

CREATE INDEX IF NOT EXISTS superlatives_recap_id_idx ON public.recap_superlatives(recap_id);


-- ─── 3. recap_reactions ───────────────────────────────────────────────────────
-- Stamp-style reactions. One of each stamp per user per recap.

CREATE TABLE IF NOT EXISTS public.recap_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id   UUID NOT NULL REFERENCES public.recaps(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id),
  stamp      TEXT NOT NULL
             CHECK (stamp IN (
               'cinema', 'brutal', 'elite', 'never_again',
               'respectfully', 'generational', 'jail', 'approved'
             )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recap_id, user_id, stamp)
);

CREATE INDEX IF NOT EXISTS reactions_recap_id_idx ON public.recap_reactions(recap_id);
CREATE INDEX IF NOT EXISTS reactions_user_id_idx  ON public.recap_reactions(user_id);

-- Trigger: keep recaps.reaction_counts in sync automatically

CREATE OR REPLACE FUNCTION public.sync_reaction_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_recap_id UUID;
BEGIN
  v_recap_id := COALESCE(NEW.recap_id, OLD.recap_id);

  UPDATE public.recaps
  SET reaction_counts = (
    SELECT COALESCE(
      jsonb_object_agg(stamp, cnt),
      '{}'::jsonb
    )
    FROM (
      SELECT stamp, COUNT(*) AS cnt
      FROM public.recap_reactions
      WHERE recap_id = v_recap_id
      GROUP BY stamp
    ) t
  )
  WHERE id = v_recap_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reaction_counts ON public.recap_reactions;
CREATE TRIGGER trg_sync_reaction_counts
  AFTER INSERT OR DELETE ON public.recap_reactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_reaction_counts();


-- ─── 4. group_lore ────────────────────────────────────────────────────────────
-- Pinned moments on a club page. Host pins a recap → becomes lore.

CREATE TABLE IF NOT EXISTS public.group_lore (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  recap_id   UUID REFERENCES public.recaps(id) ON DELETE SET NULL,
  round_id   UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,   -- 'The Rain Round', 'Nick's 12 on Seven'
  body       TEXT,            -- one sentence
  photo_url  TEXT,
  pinned_by  UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lore_club_id_idx ON public.group_lore(club_id);


-- ─── 5. user_presence ─────────────────────────────────────────────────────────
-- Lightweight ambient status. Not messaging. Auto-expires in 7 days.

CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT CHECK (status IN (
                'looking_for_fourth', 'down_for_twilight', 'playing_this_weekend',
                'walking_only', 'need_a_sunday_round', 'out_with_injury',
                'down_to_sub', 'custom'
              )),
  custom_text TEXT,            -- used when status = 'custom'
  location    TEXT,            -- optional 'In SF this week'
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── 6. profile_labels ────────────────────────────────────────────────────────
-- 2–3 semi-ironic identity descriptors per user, generated from stats.
-- App calls generate_profile_labels(user_id) after each round completes.

CREATE TABLE IF NOT EXISTS public.profile_labels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,   -- 'Vibes Captain', 'Sunrise Sicko', etc.
  rule_id      TEXT NOT NULL,   -- which rule produced it (for auditability)
  is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, label)
);

CREATE INDEX IF NOT EXISTS labels_user_id_idx ON public.profile_labels(user_id);


-- ─── 7. generate_superlatives() ──────────────────────────────────────────────
-- Call after a round is completed. Pass the round_id and the recap_id.
-- Creates one recap_superlatives row per rule that fires.
-- Safe to call multiple times (upserts on recap_id + rule).

CREATE OR REPLACE FUNCTION public.generate_superlatives(
  p_recap_id UUID,
  p_round_id UUID
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  r_host_id        UUID;
  r_scheduled_at   TIMESTAMPTZ;
  r_hour           INT;

  r_lowest_pid     UUID;
  r_lowest_tmp     UUID;
  r_lowest_score   INT;

  r_highest_pid    UUID;
  r_highest_tmp    UUID;
  r_highest_score  INT;

  r_first_pid      UUID;
  r_last_pid       UUID;
BEGIN
  -- Load round metadata
  SELECT host_id, scheduled_at
  INTO r_host_id, r_scheduled_at
  FROM public.rounds WHERE id = p_round_id;

  r_hour := EXTRACT(HOUR FROM r_scheduled_at AT TIME ZONE 'UTC');

  -- ── Lowest gross score (real players) ──
  SELECT rp.player_id, SUM(s.strokes) AS total
  INTO r_lowest_pid, r_lowest_score
  FROM public.scores s
  JOIN public.round_players rp ON rp.player_id = s.player_id AND rp.round_id = s.round_id
  WHERE s.round_id = p_round_id AND rp.player_id IS NOT NULL
  GROUP BY rp.player_id ORDER BY total ASC LIMIT 1;

  -- ── Lowest gross score (temp players) ──
  IF r_lowest_pid IS NULL THEN
    SELECT rp.temp_player_id, SUM(s.strokes) AS total
    INTO r_lowest_tmp, r_lowest_score
    FROM public.temp_scores s
    JOIN public.round_players rp ON rp.temp_player_id = s.temp_player_id AND rp.round_id = s.round_id
    WHERE s.round_id = p_round_id
    GROUP BY rp.temp_player_id ORDER BY total ASC LIMIT 1;
  END IF;

  -- ── Highest gross score (real players) ──
  SELECT rp.player_id, SUM(s.strokes) AS total
  INTO r_highest_pid, r_highest_score
  FROM public.scores s
  JOIN public.round_players rp ON rp.player_id = s.player_id AND rp.round_id = s.round_id
  WHERE s.round_id = p_round_id AND rp.player_id IS NOT NULL
  GROUP BY rp.player_id ORDER BY total DESC LIMIT 1;

  IF r_highest_pid IS NULL THEN
    SELECT rp.temp_player_id, SUM(s.strokes) AS total
    INTO r_highest_tmp, r_highest_score
    FROM public.temp_scores s
    JOIN public.round_players rp ON rp.temp_player_id = s.temp_player_id AND rp.round_id = s.round_id
    WHERE s.round_id = p_round_id
    GROUP BY rp.temp_player_id ORDER BY total DESC LIMIT 1;
  END IF;

  -- ── First RSVP (Day One) ──
  SELECT player_id INTO r_first_pid
  FROM public.round_players
  WHERE round_id = p_round_id AND player_id IS NOT NULL AND rsvp = 'in'
  ORDER BY joined_at ASC LIMIT 1;

  -- ── Last RSVP (Late Add Legend) ──
  SELECT player_id INTO r_last_pid
  FROM public.round_players
  WHERE round_id = p_round_id AND player_id IS NOT NULL AND rsvp = 'in'
  ORDER BY joined_at DESC LIMIT 1;

  -- ── Insert superlatives (skip duplicates) ──

  -- Host → Vibes Captain
  IF r_host_id IS NOT NULL THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    VALUES (p_recap_id, r_host_id, 'Vibes Captain', 'host')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Lowest score → Course Menace
  IF r_lowest_pid IS NOT NULL THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    VALUES (p_recap_id, r_lowest_pid, 'Course Menace', 'lowest_score')
    ON CONFLICT DO NOTHING;
  ELSIF r_lowest_tmp IS NOT NULL THEN
    INSERT INTO public.recap_superlatives (recap_id, temp_player_id, label, rule)
    VALUES (p_recap_id, r_lowest_tmp, 'Course Menace', 'lowest_score')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Highest score → Character Builder (only if different person from lowest)
  IF r_highest_pid IS NOT NULL AND r_highest_pid IS DISTINCT FROM r_lowest_pid THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    VALUES (p_recap_id, r_highest_pid, 'Character Builder', 'highest_score')
    ON CONFLICT DO NOTHING;
  ELSIF r_highest_tmp IS NOT NULL AND r_highest_tmp IS DISTINCT FROM r_lowest_tmp THEN
    INSERT INTO public.recap_superlatives (recap_id, temp_player_id, label, rule)
    VALUES (p_recap_id, r_highest_tmp, 'Character Builder', 'highest_score')
    ON CONFLICT DO NOTHING;
  END IF;

  -- First RSVP → Day One
  IF r_first_pid IS NOT NULL THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    VALUES (p_recap_id, r_first_pid, 'Day One', 'first_rsvp')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Last RSVP → Late Add Legend (only if different from first)
  IF r_last_pid IS NOT NULL AND r_last_pid IS DISTINCT FROM r_first_pid THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    VALUES (p_recap_id, r_last_pid, 'Late Add Legend', 'last_rsvp')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Early tee time → Sunrise Sicko (before 8am, all players in)
  IF r_scheduled_at IS NOT NULL AND r_hour < 8 THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    SELECT p_recap_id, player_id, 'Sunrise Sicko', 'early_tee_time'
    FROM public.round_players
    WHERE round_id = p_round_id AND player_id IS NOT NULL AND rsvp = 'in'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Late tee time → Twilight Merchant (after 5pm, all players in)
  IF r_scheduled_at IS NOT NULL AND r_hour >= 17 THEN
    INSERT INTO public.recap_superlatives (recap_id, player_id, label, rule)
    SELECT p_recap_id, player_id, 'Twilight Merchant', 'late_tee_time'
    FROM public.round_players
    WHERE round_id = p_round_id AND player_id IS NOT NULL AND rsvp = 'in'
    ON CONFLICT DO NOTHING;
  END IF;

END;
$$;


-- ─── 8. generate_profile_labels() ────────────────────────────────────────────
-- Recomputes identity labels for a user from their stat columns.
-- Call after each round completion or on a schedule.
-- Replaces all non-pinned labels; pinned ones are preserved.

CREATE OR REPLACE FUNCTION public.generate_profile_labels(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id;

  -- Remove old non-pinned labels
  DELETE FROM public.profile_labels
  WHERE user_id = p_user_id AND is_pinned = FALSE;

  -- Vibes Captain: hosted 5+ rounds
  IF p.rounds_hosted >= 5 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Vibes Captain', 'host_5_plus')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Sunrise Sicko: 5+ early bird rounds
  IF p.early_bird_rounds >= 5 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Sunrise Sicko', 'early_bird_5')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Reliable Fourth: 10+ rounds played
  IF p.rounds_played >= 10 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Reliable Fourth', 'rounds_10_plus')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Streak Demon: 4+ consecutive weeks
  IF p.streak_weeks >= 4 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Streak Demon', 'streak_4_weeks')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Scene Maker: 3+ large rounds (8+ players)
  IF p.large_rounds_hosted >= 3 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Scene Maker', 'large_rounds_3')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Well Traveled: 5+ courses played
  IF p.courses_played >= 5 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Well Traveled', 'courses_5_plus')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Social Glue: 5+ pals
  IF p.pals_count >= 5 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Social Glue', 'pals_5_plus')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

  -- Skin Collector: 5+ skins won
  IF p.skins_won >= 5 THEN
    INSERT INTO public.profile_labels (user_id, label, rule_id)
    VALUES (p_user_id, 'Skin Collector', 'skins_5_plus')
    ON CONFLICT (user_id, label) DO NOTHING;
  END IF;

END;
$$;


-- ─── 9. RLS stubs (disabled — enable with Twilio auth) ───────────────────────

ALTER TABLE public.recaps            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recap_superlatives DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recap_reactions   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_lore        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_labels    DISABLE ROW LEVEL SECURITY;

-- When you enable RLS, the policies are:
--
-- recaps: SELECT = visibility='public' OR created_by=auth.uid()
--                  OR round has a club the user is a member of
-- recap_reactions: SELECT = true; INSERT/DELETE = user_id = auth.uid()
-- group_lore: SELECT = user is club member; INSERT = user is club member
-- user_presence: SELECT = true; UPDATE = user_id = auth.uid()
-- profile_labels: SELECT = true; all writes = service role only


-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Call sequence after a round completes:
--
--   1. INSERT INTO recaps (...) RETURNING id → recap_id
--   2. SELECT generate_superlatives(recap_id, round_id)
--   3. SELECT generate_profile_labels(player_id) -- for each player in round
--
-- Everything else (reactions, lore, presence) is user-triggered from the app.
