-- Clubs v1 — add club_id to rounds
-- Run in Supabase SQL Editor after migration_clubs_v2.sql

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rounds_club_id_idx ON public.rounds(club_id);
