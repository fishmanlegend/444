-- ─── Game Mechanics Migration ─────────────────────────────────────────────────
-- Rivalries, belts, predictions, rematches, season standings,
-- clubhouse wall, disputes. Pure DB layer — no frontend required.
-- Run after migration_memory_machine.sql.
-- ──────────────────────────────────────────────────────────────────────────────


-- ─── 1. rivalries ─────────────────────────────────────────────────────────────
-- Denormalized head-to-head record between any two players.
-- player_a_id is always LEAST(a,b) so there's one row per pair.
-- Updated by update_rivalries() after each round completes.

CREATE TABLE IF NOT EXISTS public.rivalries (
  player_a_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_b_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  a_wins         INT NOT NULL DEFAULT 0,
  b_wins         INT NOT NULL DEFAULT 0,
  ties           INT NOT NULL DEFAULT 0,
  rounds_together INT NOT NULL DEFAULT 0,
  last_round_id  UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  last_played_at TIMESTAMPTZ,
  PRIMARY KEY (player_a_id, player_b_id),
  CHECK (player_a_id < player_b_id)   -- enforces LEAST/GREATEST ordering
);

CREATE INDEX IF NOT EXISTS rivalries_a_idx ON public.rivalries(player_a_id);
CREATE INDEX IF NOT EXISTS rivalries_b_idx ON public.rivalries(player_b_id);


-- ─── 2. club_belts ────────────────────────────────────────────────────────────
-- One row per belt per club. Updated after each round.
-- Belt types (V1): 'low_score', 'most_hosted', 'worst_collapse'
-- Add more belt_type values as you build them.

CREATE TABLE IF NOT EXISTS public.club_belts (
  club_id        UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  belt_type      TEXT NOT NULL,
  holder_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  won_at_round_id UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  held_since     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  streak_count   INT NOT NULL DEFAULT 1,   -- consecutive defenses
  PRIMARY KEY (club_id, belt_type)
);

CREATE INDEX IF NOT EXISTS belts_club_id_idx ON public.club_belts(club_id);


-- ─── 3. seasons ───────────────────────────────────────────────────────────────
-- A named competition window for a club (e.g. "Spring Series 2026").
-- One active season per club at a time.

CREATE TABLE IF NOT EXISTS public.seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,              -- 'Spring Series', 'The 444 Open'
  start_date  DATE NOT NULL,
  end_date    DATE,                       -- null = ongoing
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seasons_club_id_idx ON public.seasons(club_id);

-- Points ledger per player per season.
CREATE TABLE IF NOT EXISTS public.season_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   UUID NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points      INT NOT NULL DEFAULT 0,
  breakdown   JSONB NOT NULL DEFAULT '{}',
  -- breakdown shape: {"attended":3,"hosted":1,"won":1,"new_player":0}
  UNIQUE (season_id, user_id)
);

CREATE INDEX IF NOT EXISTS season_points_season_idx ON public.season_points(season_id);
CREATE INDEX IF NOT EXISTS season_points_user_idx   ON public.season_points(user_id);


-- ─── 4. round_predictions ─────────────────────────────────────────────────────
-- Pre-round voting. Players submit before tee time; results set after round.

CREATE TABLE IF NOT EXISTS public.round_predictions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id            UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  predictor_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category            TEXT NOT NULL,
  -- categories: 'winner','meltdown','late_arrival','first_fairway',
  --             'total_birdies_over','total_birdies_under','cart_or_walk'
  predicted_player_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  custom_answer       TEXT,             -- for numeric/text predictions
  was_correct         BOOLEAN,          -- set by resolve_predictions()
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, predictor_id, category)
);

CREATE INDEX IF NOT EXISTS predictions_round_id_idx ON public.round_predictions(round_id);


-- ─── 5. rematches ─────────────────────────────────────────────────────────────
-- "Run it back" challenge auto-created after a recap.
-- Accepted = a new round gets created; new_round_id is set.

CREATE TABLE IF NOT EXISTS public.rematches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  proposed_by     UUID NOT NULL REFERENCES public.profiles(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','expired')),
  new_round_id    UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Also track rematch lineage on rounds themselves
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS rematch_of UUID REFERENCES public.rounds(id) ON DELETE SET NULL;


-- ─── 6. superlative_disputes ──────────────────────────────────────────────────
-- Players react to their superlatives: accept, dispute, or appeal.
-- If fake_news votes >= 50% of round players, status flips to 'under_investigation'.

ALTER TABLE public.recap_superlatives
  ADD COLUMN IF NOT EXISTS dispute_status TEXT NOT NULL DEFAULT 'valid'
  CHECK (dispute_status IN ('valid','under_investigation','overturned'));

CREATE TABLE IF NOT EXISTS public.superlative_disputes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  superlative_id   UUID NOT NULL REFERENCES public.recap_superlatives(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.profiles(id),
  vote             TEXT NOT NULL
                   CHECK (vote IN ('fake_news','unfortunately_accurate','appeal','no_comment')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (superlative_id, user_id)
);

CREATE INDEX IF NOT EXISTS disputes_superlative_idx ON public.superlative_disputes(superlative_id);

-- Trigger: flip dispute_status when fake_news votes reach 50%+ of round players

CREATE OR REPLACE FUNCTION public.check_dispute_threshold()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_round_id        UUID;
  v_player_count    INT;
  v_fake_news_count INT;
BEGIN
  SELECT r.round_id INTO v_round_id
  FROM public.recap_superlatives rs
  JOIN public.recaps r ON r.id = rs.recap_id
  WHERE rs.id = NEW.superlative_id;

  SELECT COUNT(*) INTO v_player_count
  FROM public.round_players
  WHERE round_id = v_round_id AND rsvp = 'in';

  SELECT COUNT(*) INTO v_fake_news_count
  FROM public.superlative_disputes
  WHERE superlative_id = NEW.superlative_id AND vote = 'fake_news';

  IF v_player_count > 0 AND v_fake_news_count::float / v_player_count >= 0.5 THEN
    UPDATE public.recap_superlatives
    SET dispute_status = 'under_investigation'
    WHERE id = NEW.superlative_id AND dispute_status = 'valid';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_dispute ON public.superlative_disputes;
CREATE TRIGGER trg_check_dispute
  AFTER INSERT ON public.superlative_disputes
  FOR EACH ROW EXECUTE FUNCTION public.check_dispute_threshold();


-- ─── 7. update_rivalries() ───────────────────────────────────────────────────
-- Call after a round completes. Reads scores for all player pairs in the round
-- and upserts their head-to-head record.

CREATE OR REPLACE FUNCTION public.update_rivalries(p_round_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  -- For every pair of players with scores in this round
  FOR r IN
    SELECT
      LEAST(a.player_id, b.player_id)    AS pid_a,
      GREATEST(a.player_id, b.player_id) AS pid_b,
      SUM(sa.strokes)                    AS score_a_raw,
      SUM(sb.strokes)                    AS score_b_raw
    FROM public.round_players a
    JOIN public.round_players b
      ON b.round_id = a.round_id
      AND b.player_id > a.player_id      -- avoid duplicate pairs
    JOIN public.scores sa
      ON sa.round_id = a.round_id AND sa.player_id = a.player_id
    JOIN public.scores sb
      ON sb.round_id = b.round_id AND sb.player_id = b.player_id
      AND sb.hole_number = sa.hole_number
    WHERE a.round_id = p_round_id
      AND a.player_id IS NOT NULL
      AND b.player_id IS NOT NULL
    GROUP BY a.player_id, b.player_id
  LOOP
    INSERT INTO public.rivalries
      (player_a_id, player_b_id, a_wins, b_wins, ties, rounds_together, last_round_id, last_played_at)
    VALUES (
      r.pid_a, r.pid_b,
      CASE WHEN r.score_a_raw < r.score_b_raw THEN 1 ELSE 0 END,
      CASE WHEN r.score_b_raw < r.score_a_raw THEN 1 ELSE 0 END,
      CASE WHEN r.score_a_raw = r.score_b_raw THEN 1 ELSE 0 END,
      1,
      p_round_id, NOW()
    )
    ON CONFLICT (player_a_id, player_b_id) DO UPDATE SET
      a_wins          = rivalries.a_wins + EXCLUDED.a_wins,
      b_wins          = rivalries.b_wins + EXCLUDED.b_wins,
      ties            = rivalries.ties   + EXCLUDED.ties,
      rounds_together = rivalries.rounds_together + 1,
      last_round_id   = EXCLUDED.last_round_id,
      last_played_at  = EXCLUDED.last_played_at;
  END LOOP;
END;
$$;


-- ─── 8. update_club_belts() ──────────────────────────────────────────────────
-- Call after a round completes. Determines new belt holders for the club
-- the round belongs to (via club_members).

CREATE OR REPLACE FUNCTION public.update_club_belts(p_round_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_club_id         UUID;
  v_low_score_pid   UUID;
  v_host_pid        UUID;
  v_worst_pid       UUID;
  v_prev_holder     UUID;
BEGIN
  -- Find which club this round belongs to (first matching club membership)
  SELECT cm.club_id INTO v_club_id
  FROM public.round_players rp
  JOIN public.club_members cm ON cm.user_id = rp.player_id
  WHERE rp.round_id = p_round_id AND rp.rsvp = 'in'
  LIMIT 1;

  IF v_club_id IS NULL THEN RETURN; END IF;

  -- ── Low score belt ──
  SELECT player_id INTO v_low_score_pid
  FROM public.scores
  WHERE round_id = p_round_id
  GROUP BY player_id
  ORDER BY SUM(strokes) ASC LIMIT 1;

  IF v_low_score_pid IS NOT NULL THEN
    SELECT holder_id INTO v_prev_holder
    FROM public.club_belts
    WHERE club_id = v_club_id AND belt_type = 'low_score';

    INSERT INTO public.club_belts (club_id, belt_type, holder_id, won_at_round_id, held_since, streak_count)
    VALUES (v_club_id, 'low_score', v_low_score_pid, p_round_id, NOW(),
      CASE WHEN v_prev_holder = v_low_score_pid THEN
        (SELECT streak_count + 1 FROM public.club_belts WHERE club_id = v_club_id AND belt_type = 'low_score')
      ELSE 1 END
    )
    ON CONFLICT (club_id, belt_type) DO UPDATE SET
      holder_id        = EXCLUDED.holder_id,
      won_at_round_id  = EXCLUDED.won_at_round_id,
      held_since       = EXCLUDED.held_since,
      streak_count     = EXCLUDED.streak_count;
  END IF;

  -- ── Most hosted belt (all-time within club) ──
  SELECT r.host_id INTO v_host_pid
  FROM public.rounds r
  JOIN public.round_players rp ON rp.round_id = r.id
  JOIN public.club_members cm ON cm.user_id = rp.player_id AND cm.club_id = v_club_id
  WHERE r.status = 'completed'
  GROUP BY r.host_id
  ORDER BY COUNT(*) DESC LIMIT 1;

  IF v_host_pid IS NOT NULL THEN
    INSERT INTO public.club_belts (club_id, belt_type, holder_id, won_at_round_id, held_since, streak_count)
    VALUES (v_club_id, 'most_hosted', v_host_pid, p_round_id, NOW(), 1)
    ON CONFLICT (club_id, belt_type) DO UPDATE SET
      holder_id       = EXCLUDED.holder_id,
      won_at_round_id = EXCLUDED.won_at_round_id,
      held_since      = CASE WHEN club_belts.holder_id = EXCLUDED.holder_id
                             THEN club_belts.held_since ELSE NOW() END,
      streak_count    = CASE WHEN club_belts.holder_id = EXCLUDED.holder_id
                             THEN club_belts.streak_count + 1 ELSE 1 END;
  END IF;

  -- ── Worst collapse belt (highest score this round) ──
  SELECT player_id INTO v_worst_pid
  FROM public.scores
  WHERE round_id = p_round_id
  GROUP BY player_id
  ORDER BY SUM(strokes) DESC LIMIT 1;

  IF v_worst_pid IS NOT NULL THEN
    INSERT INTO public.club_belts (club_id, belt_type, holder_id, won_at_round_id, held_since, streak_count)
    VALUES (v_club_id, 'worst_collapse', v_worst_pid, p_round_id, NOW(), 1)
    ON CONFLICT (club_id, belt_type) DO UPDATE SET
      holder_id       = EXCLUDED.holder_id,
      won_at_round_id = EXCLUDED.won_at_round_id,
      held_since      = NOW(),
      streak_count    = 1;
  END IF;

END;
$$;


-- ─── 9. award_season_points() ────────────────────────────────────────────────
-- Call after a round completes. Awards points to all players for the club's
-- active season. Creates season_points rows if they don't exist yet.
-- Point values: attended=1, hosted=2, won=3, new_player=2

CREATE OR REPLACE FUNCTION public.award_season_points(p_round_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_club_id    UUID;
  v_season_id  UUID;
  v_host_id    UUID;
  v_winner_id  UUID;
  r            RECORD;
BEGIN
  -- Find club
  SELECT cm.club_id INTO v_club_id
  FROM public.round_players rp
  JOIN public.club_members cm ON cm.user_id = rp.player_id
  WHERE rp.round_id = p_round_id AND rp.rsvp = 'in'
  LIMIT 1;

  IF v_club_id IS NULL THEN RETURN; END IF;

  -- Find active season
  SELECT id INTO v_season_id
  FROM public.seasons
  WHERE club_id = v_club_id AND is_active = TRUE
  LIMIT 1;

  IF v_season_id IS NULL THEN RETURN; END IF;

  SELECT host_id INTO v_host_id FROM public.rounds WHERE id = p_round_id;

  -- Low score winner
  SELECT player_id INTO v_winner_id
  FROM public.scores WHERE round_id = p_round_id
  GROUP BY player_id ORDER BY SUM(strokes) ASC LIMIT 1;

  -- Award points for each player
  FOR r IN
    SELECT player_id FROM public.round_players
    WHERE round_id = p_round_id AND rsvp = 'in' AND player_id IS NOT NULL
  LOOP
    INSERT INTO public.season_points (season_id, user_id, points, breakdown)
    VALUES (v_season_id, r.player_id, 0, '{}')
    ON CONFLICT (season_id, user_id) DO NOTHING;

    -- Attendance: +1
    UPDATE public.season_points SET
      points    = points + 1,
      breakdown = jsonb_set(breakdown, '{attended}',
                    ((COALESCE(breakdown->>'attended','0'))::int + 1)::text::jsonb)
    WHERE season_id = v_season_id AND user_id = r.player_id;

    -- Hosted: +2
    IF r.player_id = v_host_id THEN
      UPDATE public.season_points SET
        points    = points + 2,
        breakdown = jsonb_set(breakdown, '{hosted}',
                      ((COALESCE(breakdown->>'hosted','0'))::int + 1)::text::jsonb)
      WHERE season_id = v_season_id AND user_id = r.player_id;
    END IF;

    -- Won: +3
    IF r.player_id = v_winner_id THEN
      UPDATE public.season_points SET
        points    = points + 3,
        breakdown = jsonb_set(breakdown, '{won}',
                      ((COALESCE(breakdown->>'won','0'))::int + 1)::text::jsonb)
      WHERE season_id = v_season_id AND user_id = r.player_id;
    END IF;
  END LOOP;

END;
$$;


-- ─── 10. RLS stubs ───────────────────────────────────────────────────────────

ALTER TABLE public.rivalries             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_belts            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_points         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_predictions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rematches             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.superlative_disputes  DISABLE ROW LEVEL SECURITY;


-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Full call sequence after a round completes:
--
--   1.  INSERT INTO recaps (...)                    → recap_id
--   2.  SELECT generate_superlatives(recap_id, round_id)
--   3.  SELECT generate_profile_labels(player_id)   -- for each player
--   4.  SELECT update_rivalries(round_id)
--   5.  SELECT update_club_belts(round_id)
--   6.  SELECT award_season_points(round_id)
--
-- User-triggered (from frontend when built):
--   - round_predictions   INSERT before round starts
--   - rematches           INSERT after recap is viewed
--   - superlative_disputes INSERT after superlatives drop
--
-- Clubhouse wall is a query, not a table — see below.

-- ─── Clubhouse wall query (run against existing data, no new table needed) ───
--
-- SELECT
--   (SELECT name FROM profiles p JOIN club_belts cb ON cb.holder_id = p.id
--    WHERE cb.club_id = $1 AND cb.belt_type = 'low_score') AS belt_low_score,
--
--   (SELECT name FROM profiles p JOIN club_belts cb ON cb.holder_id = p.id
--    WHERE cb.club_id = $1 AND cb.belt_type = 'most_hosted') AS belt_host,
--
--   (SELECT title FROM group_lore WHERE club_id = $1 ORDER BY created_at DESC LIMIT 1) AS latest_lore,
--
--   (SELECT COUNT(*) FROM rounds r JOIN round_players rp ON rp.round_id = r.id
--    JOIN club_members cm ON cm.user_id = rp.player_id AND cm.club_id = $1
--    WHERE r.status = 'completed') AS total_rounds,
--
--   (SELECT name FROM profiles p
--    JOIN (SELECT player_a_id AS pid, a_wins+b_wins AS w FROM rivalries
--          UNION ALL SELECT player_b_id, b_wins+a_wins FROM rivalries) rv ON rv.pid = p.id
--    JOIN club_members cm ON cm.user_id = p.id AND cm.club_id = $1
--    ORDER BY w DESC LIMIT 1) AS most_competitive_player;
