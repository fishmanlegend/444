-- Match play tables — run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.match_teams (
  round_id   UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team       TEXT NOT NULL CHECK (team IN ('a', 'b')),
  PRIMARY KEY (round_id, player_id)
);

ALTER TABLE public.match_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_teams_rw" ON public.match_teams FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.match_holes (
  round_id    UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number INT  NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  result      TEXT CHECK (result IN ('a', 'b', 'halve')),
  PRIMARY KEY (round_id, hole_number)
);

ALTER TABLE public.match_holes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_holes_rw" ON public.match_holes FOR ALL USING (true) WITH CHECK (true);
