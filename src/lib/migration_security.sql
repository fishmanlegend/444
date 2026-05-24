-- Security hardening migration — run in Supabase SQL Editor
-- Covers: recorded_by column, match RLS, scores policy for trackOthers,
--         clubs/club_members/club_posts/round_comments tables + RLS

-- ── 1. scores: add recorded_by column ────────────────────────────────────────
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.profiles(id);

-- ── 2. scores: allow round participants to record for others (trackOthers) ───
DROP POLICY IF EXISTS "scores_write" ON public.scores;
CREATE POLICY "scores_write" ON public.scores FOR ALL TO authenticated
  USING (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = scores.round_id AND rp.player_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = player_id
    OR EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = scores.round_id AND rp.player_id = auth.uid()
    )
  );

-- ── 3. match_teams: restrict to round host ────────────────────────────────────
DROP POLICY IF EXISTS "match_teams_rw" ON public.match_teams;
CREATE POLICY "match_teams_read" ON public.match_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "match_teams_write" ON public.match_teams FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid()));

-- ── 4. match_holes: restrict to round participants ────────────────────────────
DROP POLICY IF EXISTS "match_holes_rw" ON public.match_holes;
CREATE POLICY "match_holes_read" ON public.match_holes FOR SELECT TO authenticated USING (true);
CREATE POLICY "match_holes_write" ON public.match_holes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = match_holes.round_id AND rp.player_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.round_players rp
      WHERE rp.round_id = match_holes.round_id AND rp.player_id = auth.uid()
    )
  );

-- ── 5. clubs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clubs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  created_by                  UUID NOT NULL REFERENCES public.profiles(id),
  banner_image_id             TEXT,
  banner_is_video             BOOLEAN NOT NULL DEFAULT FALSE,
  only_host_can_create_rounds BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clubs_read"   ON public.clubs FOR SELECT TO authenticated USING (true);
CREATE POLICY "clubs_insert" ON public.clubs FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "clubs_update" ON public.clubs FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "clubs_delete" ON public.clubs FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- ── 6. club_members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.club_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id   UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by  UUID REFERENCES public.profiles(id),
  status    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, user_id)
);

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cm_read" ON public.club_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "cm_insert" ON public.club_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_id AND c.created_by = auth.uid())
  );
CREATE POLICY "cm_update" ON public.club_members FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_id AND c.created_by = auth.uid())
  );
CREATE POLICY "cm_delete" ON public.club_members FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_id AND c.created_by = auth.uid())
  );

-- ── 7. club_posts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.club_posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.club_posts ENABLE ROW LEVEL SECURITY;

-- Members of the club can read posts
CREATE POLICY "cp_read" ON public.club_posts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_posts.club_id AND cm.user_id = auth.uid() AND cm.status = 'member'
    )
  );
-- Must be a member to post
CREATE POLICY "cp_insert" ON public.club_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_posts.club_id AND cm.user_id = auth.uid() AND cm.status = 'member'
    )
  );
-- Author or club creator can delete
CREATE POLICY "cp_delete" ON public.club_posts FOR DELETE TO authenticated
  USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_id AND c.created_by = auth.uid())
  );

-- ── 8. round_comments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.round_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.round_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rc_read"   ON public.round_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "rc_insert" ON public.round_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
-- Author or round host can delete
CREATE POLICY "rc_delete" ON public.round_comments FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.rounds r WHERE r.id = round_id AND r.host_id = auth.uid())
  );
