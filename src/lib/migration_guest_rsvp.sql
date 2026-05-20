-- Guest RSVP migration — run in Supabase SQL Editor

-- ── Guest RSVPs table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guest_rsvps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT,
  rsvp       TEXT NOT NULL DEFAULT 'in' CHECK (rsvp IN ('in','maybe','out')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.guest_rsvps ENABLE ROW LEVEL SECURITY;

-- Anon can insert (the whole point — no login required)
CREATE POLICY "guest_rsvp_insert" ON public.guest_rsvps
  FOR INSERT TO anon WITH CHECK (true);

-- Only the host can read guest RSVPs
CREATE POLICY "guest_rsvp_read_host" ON public.guest_rsvps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()
  ));

-- Authenticated players in the round can also read
CREATE POLICY "guest_rsvp_read_player" ON public.guest_rsvps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.round_players rp WHERE rp.round_id = round_id AND rp.player_id = auth.uid()
  ));

-- ── Allow anon to read round data (needed for the public invite page) ─────────
CREATE POLICY "rounds_read_anon" ON public.rounds
  FOR SELECT TO anon USING (true);

CREATE POLICY "rp_read_anon" ON public.round_players
  FOR SELECT TO anon USING (true);

CREATE POLICY "profiles_read_anon" ON public.profiles
  FOR SELECT TO anon USING (true);
