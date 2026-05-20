-- 444 Golf App — run this in Supabase SQL Editor

-- Drop everything cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP TABLE IF EXISTS public.pals CASCADE;
DROP TABLE IF EXISTS public.skins_results CASCADE;
DROP TABLE IF EXISTS public.scores CASCADE;
DROP TABLE IF EXISTS public.round_players CASCADE;
DROP TABLE IF EXISTS public.holes CASCADE;
DROP TABLE IF EXISTS public.rounds CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- profiles
CREATE TABLE public.profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  phone                TEXT UNIQUE NOT NULL,
  name                 TEXT,
  handle               TEXT UNIQUE,
  initials             TEXT,
  avatar_color         TEXT NOT NULL DEFAULT '#284726',
  avatar_text_color    TEXT NOT NULL DEFAULT '#d8d6af',
  location             TEXT,
  bio                  TEXT,
  rounds_played        INT NOT NULL DEFAULT 0,
  rounds_hosted        INT NOT NULL DEFAULT 0,
  pals_count           INT NOT NULL DEFAULT 0,
  streak_weeks         INT NOT NULL DEFAULT 0,
  last_round_week      DATE,
  skins_won            INT NOT NULL DEFAULT 0,
  biggest_skins_pot    INT NOT NULL DEFAULT 0,
  early_bird_rounds    INT NOT NULL DEFAULT 0,
  clubs_joined         INT NOT NULL DEFAULT 0,
  introductions        INT NOT NULL DEFAULT 0,
  connectors           INT NOT NULL DEFAULT 0,
  rivalries            INT NOT NULL DEFAULT 0,
  regular_group_rounds INT NOT NULL DEFAULT 0,
  guest_rounds         INT NOT NULL DEFAULT 0,
  large_rounds_hosted  INT NOT NULL DEFAULT 0,
  unique_groups_hosted INT NOT NULL DEFAULT 0,
  courses_played       INT NOT NULL DEFAULT 0,
  cities_played        INT NOT NULL DEFAULT 0,
  reunions             INT NOT NULL DEFAULT 0,
  eagles_made          INT NOT NULL DEFAULT 0,
  birdies_made         INT NOT NULL DEFAULT 0,
  glue_rounds          INT NOT NULL DEFAULT 0,
  scorecards_kept      INT NOT NULL DEFAULT 0,
  photos_shared        INT NOT NULL DEFAULT 0,
  best_score           INT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- rounds
CREATE TABLE public.rounds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          UUID NOT NULL REFERENCES public.profiles(id),
  title            TEXT,
  course_name      TEXT,
  format           TEXT NOT NULL CHECK (format IN ('stroke','skins','stableford','match')),
  scheduled_at     TIMESTAMPTZ,
  spots            INT NOT NULL DEFAULT 4,
  cost_cents       INT NOT NULL DEFAULT 0,
  skins_bet_cents  INT NOT NULL DEFAULT 0,
  cover_image_id   TEXT,
  cover_is_video   BOOLEAN NOT NULL DEFAULT FALSE,
  note             TEXT,
  poll_guests      BOOLEAN NOT NULL DEFAULT FALSE,
  total_holes      INT NOT NULL DEFAULT 18,
  starting_hole    INT NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed','cancelled')),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- holes
CREATE TABLE public.holes (
  round_id     UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number  INT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par          INT NOT NULL DEFAULT 4 CHECK (par BETWEEN 3 AND 5),
  yardage      INT,
  PRIMARY KEY (round_id, hole_number)
);

-- round_players
CREATE TABLE public.round_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES public.profiles(id),
  rsvp       TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp IN ('in','maybe','out','pending')),
  is_host    BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, player_id)
);

-- scores
CREATE TABLE public.scores (
  round_id     UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id    UUID NOT NULL REFERENCES public.profiles(id),
  hole_number  INT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes      INT CHECK (strokes > 0),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_id, player_id, hole_number)
);

-- skins_results
CREATE TABLE public.skins_results (
  round_id     UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number  INT NOT NULL,
  winner_id    UUID REFERENCES public.profiles(id),
  pot_value    INT NOT NULL DEFAULT 1,
  PRIMARY KEY (round_id, hole_number)
);

-- pals
CREATE TABLE public.pals (
  user_a_id       UUID NOT NULL REFERENCES public.profiles(id),
  user_b_id       UUID NOT NULL REFERENCES public.profiles(id),
  rounds_together INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id < user_b_id)
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone)
  VALUES (NEW.id, COALESCE(NEW.phone, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skins_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pals          ENABLE ROW LEVEL SECURITY;

-- Policies: profiles
CREATE POLICY "profiles_read"   ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Policies: rounds
CREATE POLICY "rounds_read"   ON public.rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "rounds_insert" ON public.rounds FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "rounds_update" ON public.rounds FOR UPDATE TO authenticated USING (auth.uid() = host_id);
CREATE POLICY "rounds_delete" ON public.rounds FOR DELETE TO authenticated USING (auth.uid() = host_id);

-- Policies: holes
CREATE POLICY "holes_read"  ON public.holes FOR SELECT TO authenticated USING (true);
CREATE POLICY "holes_write" ON public.holes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()));

-- Policies: round_players
CREATE POLICY "rp_read"   ON public.round_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "rp_insert" ON public.round_players FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    OR EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid())
  );
CREATE POLICY "rp_update_own" ON public.round_players FOR UPDATE TO authenticated
  USING (auth.uid() = player_id OR EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()));
CREATE POLICY "rp_delete" ON public.round_players FOR DELETE TO authenticated
  USING (auth.uid() = player_id OR EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()));

-- Policies: scores
CREATE POLICY "scores_read"  ON public.scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "scores_write" ON public.scores FOR ALL TO authenticated
  USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

-- Policies: skins_results
CREATE POLICY "skins_read"  ON public.skins_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "skins_write" ON public.skins_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()));

-- Policies: pals
CREATE POLICY "pals_read"  ON public.pals FOR SELECT TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);
CREATE POLICY "pals_write" ON public.pals FOR ALL TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);
