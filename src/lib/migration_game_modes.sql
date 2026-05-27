-- ─── Game Modes Migration ─────────────────────────────────────────────────────
-- Run in Supabase SQL editor to activate Nassau, Wolf, Nines, Snake, Banker,
-- and Skins Net.

-- 1. format column is plain text — no enum to alter

-- 2. Format config (stores per-mode settings like stake amounts, net/gross)
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS format_config jsonb NOT NULL DEFAULT '{}';

-- 3. Course handicap per player (for Net modes)
ALTER TABLE public.round_players ADD COLUMN IF NOT EXISTS course_handicap integer;

-- 4. Putts per hole per player (for Snake)
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS putts integer;
ALTER TABLE public.temp_scores ADD COLUMN IF NOT EXISTS putts integer;

-- 5. Nassau bets (front/back/total + auto presses)
CREATE TABLE IF NOT EXISTS public.nassau_bets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('front','back','total','press')),
  start_hole    integer NOT NULL,
  end_hole      integer NOT NULL,
  parent_bet_id uuid REFERENCES public.nassau_bets(id)
);

CREATE TABLE IF NOT EXISTS public.nassau_holes (
  round_id    uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  bet_id      uuid NOT NULL REFERENCES public.nassau_bets(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  result      text CHECK (result IN ('a','b','halve')),
  PRIMARY KEY (bet_id, hole_number)
);

-- 6. Wolf (per-hole wolf identity + partner decision)
CREATE TABLE IF NOT EXISTS public.wolf_holes (
  round_id          uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number       integer NOT NULL,
  wolf_player_id    text NOT NULL,
  partner_player_id text,
  is_blind          boolean NOT NULL DEFAULT false,
  result            text CHECK (result IN ('wolf','pack')),
  PRIMARY KEY (round_id, hole_number)
);

-- 7. Banker (rotating banker, 1v1 results per opponent)
CREATE TABLE IF NOT EXISTS public.banker_holes (
  round_id         uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number      integer NOT NULL,
  banker_player_id text NOT NULL,
  PRIMARY KEY (round_id, hole_number)
);

CREATE TABLE IF NOT EXISTS public.banker_results (
  round_id    uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  player_id   text NOT NULL,
  result      text CHECK (result IN ('win','loss','halve')),
  PRIMARY KEY (round_id, hole_number, player_id)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.nassau_bets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nassau_holes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wolf_holes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banker_holes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banker_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nassau_bets_read"  ON public.nassau_bets FOR SELECT TO authenticated USING (true);
CREATE POLICY "nassau_bets_write" ON public.nassau_bets FOR ALL    TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = nassau_bets.round_id   AND rp.player_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = nassau_bets.round_id   AND rp.player_id = auth.uid()));

CREATE POLICY "nassau_holes_read"  ON public.nassau_holes FOR SELECT TO authenticated USING (true);
CREATE POLICY "nassau_holes_write" ON public.nassau_holes FOR ALL    TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = nassau_holes.round_id  AND rp.player_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = nassau_holes.round_id  AND rp.player_id = auth.uid()));

CREATE POLICY "wolf_holes_read"  ON public.wolf_holes FOR SELECT TO authenticated USING (true);
CREATE POLICY "wolf_holes_write" ON public.wolf_holes FOR ALL    TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = wolf_holes.round_id    AND rp.player_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = wolf_holes.round_id    AND rp.player_id = auth.uid()));

CREATE POLICY "banker_holes_read"  ON public.banker_holes FOR SELECT TO authenticated USING (true);
CREATE POLICY "banker_holes_write" ON public.banker_holes FOR ALL    TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = banker_holes.round_id  AND rp.player_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = banker_holes.round_id  AND rp.player_id = auth.uid()));

CREATE POLICY "banker_results_read"  ON public.banker_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "banker_results_write" ON public.banker_results FOR ALL    TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = banker_results.round_id AND rp.player_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM public.round_players rp WHERE rp.round_id = banker_results.round_id AND rp.player_id = auth.uid()));
