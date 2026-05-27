-- ─── Retention / Re-initiation Migration ─────────────────────────────────────
-- Phase 2: availability polling via poll_votes table
-- format_config (already added) stores pollOptions as ISO date string array

CREATE TABLE IF NOT EXISTS public.poll_votes (
  round_id     uuid        NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  voter_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_index integer     NOT NULL CHECK (option_index >= 0),
  voted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, voter_id)
);

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon via the zero-install invite link) can read tallies
CREATE POLICY "poll_votes_read_auth" ON public.poll_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "poll_votes_read_anon" ON public.poll_votes FOR SELECT TO anon      USING (true);

-- Only the voter themselves can write their own vote
CREATE POLICY "poll_votes_write" ON public.poll_votes FOR ALL TO authenticated
  USING     (voter_id = auth.uid())
  WITH CHECK (voter_id = auth.uid());
