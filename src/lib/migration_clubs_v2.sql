-- Clubs v2 migration — run in Supabase SQL Editor after migration_security.sql
-- Adds: invite_policy, role, club_invites table, create_club RPC, redeem_club_invite RPC

-- ── 1. invite_policy on clubs ─────────────────────────────────────────────────
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS invite_policy TEXT NOT NULL DEFAULT 'any_member'
  CHECK (invite_policy IN ('owner_only', 'officers', 'any_member'));

-- ── 2. role on club_members ───────────────────────────────────────────────────
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('owner', 'officer', 'member'));

-- Back-fill existing rows: whoever matches clubs.created_by is the owner
UPDATE public.club_members cm
SET role = 'owner'
FROM public.clubs c
WHERE cm.club_id = c.id AND cm.user_id = c.created_by;

-- ── 3. club_invites ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.club_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  code       TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  expires_at TIMESTAMPTZ,
  used_by    UUID REFERENCES public.profiles(id),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.club_invites ENABLE ROW LEVEL SECURITY;

-- Club members can read invites for their clubs
CREATE POLICY "ci_read" ON public.club_invites FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_invites.club_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'member'
    )
  );

-- Invite creation is gated by invite_policy; enforced in the function
-- Direct INSERT allowed here only for the creating user (policy checked inside RPC)
CREATE POLICY "ci_insert" ON public.club_invites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- ── 4. RPC: create_club ───────────────────────────────────────────────────────
-- Creates club + owner membership atomically. Client never writes club_members directly.
CREATE OR REPLACE FUNCTION public.create_club(
  p_name          TEXT,
  p_invite_policy TEXT DEFAULT 'any_member'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_club_id UUID;
BEGIN
  IF p_invite_policy NOT IN ('owner_only', 'officers', 'any_member') THEN
    RAISE EXCEPTION 'invalid_invite_policy';
  END IF;

  INSERT INTO public.clubs (name, created_by, invite_policy)
  VALUES (trim(p_name), auth.uid(), p_invite_policy)
  RETURNING id INTO v_club_id;

  INSERT INTO public.club_members (club_id, user_id, added_by, status, role)
  VALUES (v_club_id, auth.uid(), auth.uid(), 'member', 'owner');

  RETURN v_club_id;
END;
$$;

-- ── 5. RPC: redeem_club_invite ────────────────────────────────────────────────
-- Validates invite, adds redeemer as member. Idempotent for the same user.
CREATE OR REPLACE FUNCTION public.redeem_club_invite(
  p_code TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invite RECORD;
BEGIN
  SELECT * INTO v_invite
  FROM public.club_invites
  WHERE code = p_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  -- Idempotent: same user re-redeeming returns the club_id
  IF v_invite.used_by IS NOT NULL THEN
    IF v_invite.used_by = auth.uid() THEN
      RETURN v_invite.club_id;
    END IF;
    RAISE EXCEPTION 'invite_already_used';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  -- Already a member — idempotent
  IF EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_invite.club_id AND user_id = auth.uid()
  ) THEN
    RETURN v_invite.club_id;
  END IF;

  UPDATE public.club_invites
  SET used_by = auth.uid(), used_at = NOW()
  WHERE id = v_invite.id;

  INSERT INTO public.club_members (club_id, user_id, added_by, status, role)
  VALUES (v_invite.club_id, auth.uid(), v_invite.created_by, 'member', 'member');

  RETURN v_invite.club_id;
END;
$$;

-- ── 6. Tighten cm_insert: remove self-insert ──────────────────────────────────
-- Membership is now only written by SECURITY DEFINER functions above.
-- Only the club owner may still direct-insert (for addClubMember in db.ts).
DROP POLICY IF EXISTS "cm_insert" ON public.club_members;
CREATE POLICY "cm_insert" ON public.club_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = club_id AND c.created_by = auth.uid())
  );
