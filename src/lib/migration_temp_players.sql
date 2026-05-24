-- ─── Temp players ─────────────────────────────────────────────────────────────
-- Run in Supabase SQL Editor after the main schema.sql

CREATE TABLE IF NOT EXISTS public.temp_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id      UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anonymized_at TIMESTAMPTZ
);

ALTER TABLE public.temp_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp_read"   ON public.temp_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "tp_insert" ON public.temp_players FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "tp_delete" ON public.temp_players FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid())
  );

-- ─── round_players modifications ──────────────────────────────────────────────

ALTER TABLE public.round_players ALTER COLUMN player_id DROP NOT NULL;

ALTER TABLE public.round_players
  ADD COLUMN IF NOT EXISTS temp_player_id UUID;

ALTER TABLE public.round_players
  ADD CONSTRAINT round_players_temp_player_id_fkey
    FOREIGN KEY (temp_player_id) REFERENCES public.temp_players(id) ON DELETE CASCADE;

-- Exactly one of (player_id, temp_player_id) must be set
ALTER TABLE public.round_players
  ADD CONSTRAINT rp_one_player CHECK (num_nonnulls(player_id, temp_player_id) = 1);

-- Drop the old simple unique and replace with partial uniques
ALTER TABLE public.round_players DROP CONSTRAINT IF EXISTS round_players_round_id_player_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS rp_real_uniq
  ON public.round_players(round_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rp_temp_uniq
  ON public.round_players(round_id, temp_player_id) WHERE temp_player_id IS NOT NULL;

-- Update the rp_insert policy so hosts can add temp players
DROP POLICY IF EXISTS "rp_insert" ON public.round_players;
CREATE POLICY "rp_insert" ON public.round_players FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = player_id
    OR (
      temp_player_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.temp_players tp
        WHERE tp.id = temp_player_id AND tp.created_by = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid())
  );

-- ─── temp_scores ──────────────────────────────────────────────────────────────
-- Separate table so the existing scores table and its PK remain untouched.

CREATE TABLE IF NOT EXISTS public.temp_scores (
  round_id       UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  temp_player_id UUID NOT NULL REFERENCES public.temp_players(id) ON DELETE CASCADE,
  hole_number    INT NOT NULL CHECK (hole_number BETWEEN 1 AND 36),
  strokes        INT CHECK (strokes > 0),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (round_id, temp_player_id, hole_number)
);

ALTER TABLE public.temp_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ts_read"  ON public.temp_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "ts_write" ON public.temp_scores FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = temp_scores.round_id AND rp.player_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = temp_scores.round_id AND rp.player_id = auth.uid()
    )
  );

-- ─── Claim function ────────────────────────────────────────────────────────────
-- Call after a guest signs up: re-points all temp references to the real profile.

CREATE OR REPLACE FUNCTION public.claim_temp_player(
  p_temp_player_id UUID,
  p_real_player_id UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.round_players
    SET player_id = p_real_player_id, temp_player_id = NULL
    WHERE temp_player_id = p_temp_player_id;

  INSERT INTO public.scores (round_id, player_id, hole_number, strokes, recorded_at)
    SELECT round_id, p_real_player_id, hole_number, strokes, recorded_at
    FROM public.temp_scores
    WHERE temp_player_id = p_temp_player_id
    ON CONFLICT (round_id, player_id, hole_number) DO NOTHING;

  DELETE FROM public.temp_scores  WHERE temp_player_id = p_temp_player_id;
  DELETE FROM public.temp_players WHERE id             = p_temp_player_id;
END;
$$;

-- ─── Anonymization (run via cron after 30 days) ────────────────────────────────
-- UPDATE public.temp_players
--   SET name = 'Guest', phone = NULL, anonymized_at = NOW()
--   WHERE anonymized_at IS NULL AND created_at < NOW() - INTERVAL '30 days';
