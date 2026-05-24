import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

import { supabase } from './supabase';
import type {
  Profile, Round, Hole, RoundPlayer, Score, TempScore, SkinsResult, Pal, GuestRsvp,
  MatchTeam, MatchHole, RoundFormat, RsvpStatus, Club, ClubMember, ClubPost,
  ClubInvite, TempPlayer,
} from './database.types';

// ─── Profiles ─────────────────────────────────────────────────────────────────

export async function getProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
  return data;
}

export async function getLiveProfileStats(userId: string): Promise<{
  rounds_hosted: number;
  pals_count: number;
  clubs_joined: number;
}> {
  const [
    { count: rounds_hosted },
    { data: palA },
    { data: palB },
    { count: clubs_joined },
  ] = await Promise.all([
    supabase.from('rounds').select('*', { count: 'exact', head: true }).eq('host_id', userId),
    supabase.from('pals').select('rounds_together').eq('user_a_id', userId).gt('rounds_together', 0),
    supabase.from('pals').select('rounds_together').eq('user_b_id', userId).gt('rounds_together', 0),
    supabase.from('club_members').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return {
    rounds_hosted: rounds_hosted ?? 0,
    pals_count: (palA?.length ?? 0) + (palB?.length ?? 0),
    clubs_joined: clubs_joined ?? 0,
  };
}

export async function getProfilesExcluding(excludeIds: string[]): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .order('name');
  return (data ?? []) as Profile[];
}

export async function upsertProfile(profile: Partial<Profile> & { id: string; phone: string }) {
  return supabase.from('profiles').upsert(profile).eq('id', profile.id);
}

export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${userId}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: 'base64',
  });

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), { contentType: mime, upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function updateProfile(id: string, updates: Partial<Profile>) {
  const { error } = await supabase.from('profiles').update(updates as any).eq('id', id);
  if (error) throw error;
}

export async function incrementStat(
  userId: string,
  stat: keyof Pick<Profile,
    | 'rounds_played' | 'rounds_hosted' | 'pals_count' | 'streak_weeks'
    | 'skins_won' | 'early_bird_rounds' | 'clubs_joined' | 'introductions'
    | 'connectors' | 'rivalries' | 'regular_group_rounds' | 'guest_rounds'
    | 'large_rounds_hosted' | 'unique_groups_hosted' | 'courses_played'
    | 'cities_played' | 'reunions' | 'eagles_made' | 'birdies_made'
    | 'glue_rounds' | 'scorecards_kept' | 'photos_shared'
  >,
  by = 1,
) {
  const { data: current } = await supabase.from('profiles').select(stat).eq('id', userId).single();
  if (!current) return;
  const next = ((current as any)[stat] as number) + by;
  return supabase.from('profiles').update({ [stat]: next } as any).eq('id', userId);
}

// ─── Home screen ──────────────────────────────────────────────────────────────

export type HomeRound = Round & { players: RoundPlayer[] };

export async function getHomeRounds(userId: string): Promise<{
  hosting: HomeRound[];
  confirmed: HomeRound[];
  awaiting: HomeRound[];
  finished: HomeRound[];
}> {
  const empty = { hosting: [], confirmed: [], awaiting: [], finished: [] };

  const { data: memberships } = await supabase
    .from('round_players')
    .select('round_id, rsvp, is_host')
    .eq('player_id', userId);

  if (!memberships?.length) return empty;

  const roundIds = memberships.map((m) => m.round_id);

  const [{ data: rounds }, { data: allPlayers }] = await Promise.all([
    supabase
      .from('rounds')
      .select('*')
      .in('id', roundIds)
      .in('status', ['upcoming', 'active', 'completed'])
      .order('scheduled_at', { ascending: false }),
    supabase
      .from('round_players')
      .select('*, profile:profiles(*)')
      .in('round_id', roundIds)
      .eq('rsvp', 'in'),
  ]);

  if (!rounds?.length) return empty;

  const playersByRound: Record<string, RoundPlayer[]> = {};
  for (const p of allPlayers ?? []) {
    if (!playersByRound[p.round_id]) playersByRound[p.round_id] = [];
    playersByRound[p.round_id].push(p as RoundPlayer);
  }

  const byId = Object.fromEntries(rounds.map((r) => [r.id, r]));
  const hosting: HomeRound[] = [];
  const confirmed: HomeRound[] = [];
  const awaiting: HomeRound[] = [];
  const finished: HomeRound[] = [];

  for (const m of memberships) {
    const r = byId[m.round_id];
    if (!r) continue;
    const entry: HomeRound = { ...r, players: playersByRound[r.id] ?? [] };
    if (r.status === 'completed') {
      finished.push(entry);
    } else if (m.is_host) {
      hosting.push(entry);
    } else if (m.rsvp === 'in') {
      confirmed.push(entry);
    } else if (m.rsvp === 'pending' || m.rsvp === 'maybe') {
      awaiting.push(entry);
    }
  }

  // Most recent first, capped at 10
  finished.sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return 0;
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime();
  });

  return { hosting, confirmed, awaiting, finished: finished.slice(0, 10) };
}

// ─── Rounds ───────────────────────────────────────────────────────────────────

export async function createRound(params: {
  hostId: string;
  clubId?: string | null;
  title: string | null;
  courseName: string | null;
  format: RoundFormat;
  scheduledAt: string | null;
  spots: number;
  costCents: number;
  skinsBetCents: number;
  coverImageId: string | null;
  coverIsVideo: boolean;
  note: string | null;
  pollGuests: boolean;
  totalHoles: number;
  startingHole: number;
  pars: number[];          // length = totalHoles, index 0 = hole 1
  yardages?: number[];
}): Promise<Round | null> {
  const { data: round, error } = await supabase
    .from('rounds')
    .insert({
      host_id: params.hostId,
      ...(params.clubId ? { club_id: params.clubId } : {}),
      title: params.title,
      course_name: params.courseName,
      format: params.format,
      scheduled_at: params.scheduledAt,
      spots: params.spots,
      cost_cents: params.costCents,
      skins_bet_cents: params.skinsBetCents,
      cover_image_id: params.coverImageId,
      cover_is_video: params.coverIsVideo,
      note: params.note,
      poll_guests: params.pollGuests,
      total_holes: params.totalHoles,
      starting_hole: params.startingHole,
      status: 'upcoming',
      completed_at: null,
    })
    .select()
    .single();

  if (error || !round) {
    if (__DEV__) console.error('[createRound] insert failed:', JSON.stringify(error));
    return null;
  }

  // Insert holes
  const holes: Hole[] = params.pars.map((par, i) => ({
    round_id: round.id,
    hole_number: i + 1,
    par,
    yardage: params.yardages?.[i] ?? null,
  }));
  await supabase.from('holes').insert(holes as any);

  // Add host as a player
  await supabase.from('round_players').insert({
    round_id: round.id,
    player_id: params.hostId,
    rsvp: 'in',
    is_host: true,
  });

  // Increment host's rounds_hosted stat
  await incrementStat(params.hostId, 'rounds_hosted');

  return round;
}

export async function getRound(id: string): Promise<Round | null> {
  const { data } = await supabase.from('rounds').select('*').eq('id', id).single();
  return data;
}

export async function getRoundWithPlayers(id: string): Promise<(Round & { players: RoundPlayer[] }) | null> {
  const { data: round } = await supabase.from('rounds').select('*').eq('id', id).single();
  if (!round) return null;

  const { data: players } = await supabase
    .from('round_players')
    .select('*, profile:profiles!round_players_player_id_fkey(*), temp_player:temp_players!round_players_temp_player_id_fkey(*)')
    .eq('round_id', id)
    .order('joined_at');

  return { ...round, players: (players ?? []) as RoundPlayer[] };
}

export async function getHoles(roundId: string): Promise<Hole[]> {
  const { data } = await supabase
    .from('holes')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');
  return data ?? [];
}

export async function patchRound(id: string, updates: Partial<Round>) {
  const { error } = await supabase.from('rounds').update(updates as any).eq('id', id);
  if (error) throw error;
}

export async function updateRoundStatus(id: string, status: Round['status']) {
  const update: Partial<Round> = { status };
  if (status === 'completed') update.completed_at = new Date().toISOString();
  return supabase.from('rounds').update(update).eq('id', id);
}

export async function getMyRounds(userId: string): Promise<{
  hosting: Round[];
  confirmed: Round[];
  awaiting: Round[];
}> {
  // Rounds where user is a player
  const { data: memberships } = await supabase
    .from('round_players')
    .select('round_id, rsvp, is_host')
    .eq('player_id', userId);

  if (!memberships?.length) return { hosting: [], confirmed: [], awaiting: [] };

  const roundIds = memberships.map((m) => m.round_id);
  const { data: rounds } = await supabase
    .from('rounds')
    .select('*')
    .in('id', roundIds)
    .in('status', ['upcoming', 'active'])
    .order('scheduled_at');

  const byId = Object.fromEntries((rounds ?? []).map((r) => [r.id, r]));

  const hosting: Round[] = [];
  const confirmed: Round[] = [];
  const awaiting: Round[] = [];

  for (const m of memberships) {
    const r = byId[m.round_id];
    if (!r) continue;
    if (m.is_host) {
      hosting.push(r);
    } else if (m.rsvp === 'in' || m.rsvp === 'pending') {
      (m.rsvp === 'in' ? confirmed : awaiting).push(r);
    }
  }

  return { hosting, confirmed, awaiting };
}

// ─── Guest RSVPs (no auth required) ───────────────────────────────────────────

export async function addGuestRsvp(
  roundId: string,
  name: string,
  rsvp: 'in' | 'maybe' | 'out',
  phone?: string,
): Promise<GuestRsvp | null> {
  const { data, error } = await supabase
    .from('guest_rsvps')
    .insert({ round_id: roundId, name: name.trim(), rsvp, phone: phone ?? null })
    .select()
    .single();
  if (error) return null;
  return data as GuestRsvp;
}

export async function getGuestRsvps(roundId: string): Promise<GuestRsvp[]> {
  const { data } = await supabase
    .from('guest_rsvps')
    .select('*')
    .eq('round_id', roundId)
    .order('created_at');
  return (data ?? []) as GuestRsvp[];
}

// ─── Inviting players ─────────────────────────────────────────────────────────

export async function invitePlayer(roundId: string, playerId: string) {
  return supabase.from('round_players').upsert({
    round_id: roundId,
    player_id: playerId,
    rsvp: 'pending',
    is_host: false,
  });
}

export async function bulkInviteToRound(roundId: string, playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return;
  await supabase.from('round_players').upsert(
    playerIds.map((id) => ({ round_id: roundId, player_id: id, rsvp: 'pending' as RsvpStatus, is_host: false }))
  );
}

export async function updateRsvp(roundId: string, playerId: string, rsvp: RsvpStatus) {
  return supabase
    .from('round_players')
    .update({ rsvp })
    .eq('round_id', roundId)
    .eq('player_id', playerId);
}

// ─── Temp players ─────────────────────────────────────────────────────────────

export async function createTempPlayer(
  roundId: string,
  name: string,
  phone: string | null,
  createdBy: string,
): Promise<TempPlayer | null> {
  const { data } = await supabase
    .from('temp_players')
    .insert({ round_id: roundId, name: name.trim(), phone: phone || null, created_by: createdBy })
    .select()
    .single();
  return (data as TempPlayer) ?? null;
}

export async function claimTempPlayersByPhone(phone: string, realPlayerId: string): Promise<void> {
  const cleaned = phone.replace(/\D/g, '').replace(/^1/, '');
  const { data: temps } = await supabase
    .from('temp_players')
    .select('id')
    .or(`phone.eq.${cleaned},phone.eq.+1${cleaned},phone.eq.1${cleaned}`);
  if (!temps?.length) return;
  await Promise.all(
    (temps as { id: string }[]).map((tp) =>
      (supabase.rpc as any)('claim_temp_player', {
        p_temp_player_id: tp.id,
        p_real_player_id: realPlayerId,
      })
    )
  );
}

export async function addTempPlayerToRound(roundId: string, tempPlayerId: string): Promise<void> {
  await supabase.from('round_players').insert({
    round_id: roundId,
    temp_player_id: tempPlayerId,
    rsvp: 'in' as RsvpStatus,
    is_host: false,
  } as any);
}

export async function removePlayerFromRound(roundId: string, playerId: string): Promise<void> {
  await supabase.from('round_players').delete().eq('round_id', roundId).eq('player_id', playerId);
}

export async function removeTempPlayerFromRound(roundId: string, tempPlayerId: string): Promise<void> {
  await supabase.from('round_players').delete().eq('round_id', roundId).eq('temp_player_id', tempPlayerId);
  await supabase.from('temp_players').delete().eq('id', tempPlayerId);
}

export async function lookupProfileByPhone(phone: string): Promise<Profile | null> {
  const cleaned = phone.replace(/\D/g, '');
  const { data } = await supabase.from('profiles').select('*').eq('phone', cleaned).maybeSingle();
  if (data) return data as Profile;
  const { data: data2 } = await supabase.from('profiles').select('*').eq('phone', `+1${cleaned}`).maybeSingle();
  return (data2 as Profile) ?? null;
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export async function upsertScore(
  roundId: string,
  playerId: string,
  holeNumber: number,
  strokes: number | null,
  recordedBy?: string,
) {
  return supabase.from('scores').upsert({
    round_id: roundId,
    player_id: playerId,
    hole_number: holeNumber,
    strokes,
    recorded_at: new Date().toISOString(),
    ...(recordedBy ? { recorded_by: recordedBy } : {}),
  });
}

export async function upsertTempScore(
  roundId: string,
  tempPlayerId: string,
  holeNumber: number,
  strokes: number | null,
): Promise<void> {
  if (strokes === null) {
    await supabase.from('temp_scores').delete()
      .eq('round_id', roundId).eq('temp_player_id', tempPlayerId).eq('hole_number', holeNumber);
  } else {
    await supabase.from('temp_scores').upsert({
      round_id: roundId,
      temp_player_id: tempPlayerId,
      hole_number: holeNumber,
      strokes,
      recorded_at: new Date().toISOString(),
    });
  }
}

export async function getScores(roundId: string): Promise<Score[]> {
  const { data } = await supabase
    .from('scores')
    .select('*')
    .eq('round_id', roundId);
  return data ?? [];
}

export async function getTempScores(roundId: string): Promise<TempScore[]> {
  const { data } = await supabase
    .from('temp_scores')
    .select('*')
    .eq('round_id', roundId);
  return (data ?? []) as TempScore[];
}

export async function upsertHole(roundId: string, holeNumber: number, par: number, yardage: number | null): Promise<void> {
  await supabase.from('holes').upsert({ round_id: roundId, hole_number: holeNumber, par, yardage });
}

// Organizes scores into scores[playerIndex][holeIndex] for scorecard screens
export function indexScores(
  scores: Score[],
  playerIds: string[],
  totalHoles: number,
): (number | null)[][] {
  const grid: (number | null)[][] = playerIds.map(() =>
    Array(totalHoles).fill(null)
  );
  for (const s of scores) {
    const pi = playerIds.indexOf(s.player_id);
    if (pi >= 0 && s.hole_number >= 1 && s.hole_number <= totalHoles) {
      grid[pi][s.hole_number - 1] = s.strokes;
    }
  }
  return grid;
}

// ─── Skins ────────────────────────────────────────────────────────────────────

export async function upsertSkinsResult(result: SkinsResult) {
  return supabase.from('skins_results').upsert(result as any);
}

export async function getSkinsResults(roundId: string): Promise<SkinsResult[]> {
  const { data } = await supabase
    .from('skins_results')
    .select('*')
    .eq('round_id', roundId)
    .order('hole_number');
  return data ?? [];
}

// ─── Round comments ───────────────────────────────────────────────────────────

export async function getRoundComments(roundId: string) {
  const { data } = await supabase
    .from('round_comments')
    .select('*, profile:profiles(*)')
    .eq('round_id', roundId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function addRoundComment(roundId: string, userId: string, body: string) {
  return supabase.from('round_comments').insert({ round_id: roundId, user_id: userId, body: body.trim() });
}

// ─── Pals ─────────────────────────────────────────────────────────────────────

export async function getPals(userId: string): Promise<(Pal & { profile: Profile })[]> {
  const [{ data: asA, error: errA }, { data: asB, error: errB }] = await Promise.all([
    supabase.from('pals').select('*').eq('user_a_id', userId),
    supabase.from('pals').select('*').eq('user_b_id', userId),
  ]);
  if (errA || errB) throw new Error(errA?.message ?? errB?.message);

  const palsData = [...(asA ?? []), ...(asB ?? [])];
  if (palsData.length === 0) return [];

  const otherIds = palsData.map((pal: any) =>
    pal.user_a_id === userId ? pal.user_b_id : pal.user_a_id,
  );

  const { data: profilesData } = await supabase.from('profiles').select('*').in('id', otherIds);
  const profileMap = Object.fromEntries(((profilesData ?? []) as Profile[]).map((p) => [p.id, p]));

  return palsData
    .sort((a: any, b: any) => (b.rounds_together - a.rounds_together) || (b.invites_together - a.invites_together))
    .map((pal: any) => {
      const otherId = pal.user_a_id === userId ? pal.user_b_id : pal.user_a_id;
      return { ...pal, profile: profileMap[otherId] as Profile };
    });
}

export async function upsertPal(userAId: string, userBId: string) {
  const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  const { data: existing } = await supabase
    .from('pals')
    .select('rounds_together, invites_together')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .single();

  if (existing) {
    // First actual round together (was invite-only before) → both earn a new pal
    if (existing.rounds_together === 0) {
      await Promise.all([incrementStat(a, 'pals_count'), incrementStat(b, 'pals_count')]);
    }
    return supabase.from('pals')
      .update({ rounds_together: existing.rounds_together + 1, invites_together: (existing.invites_together ?? 0) + 1 })
      .eq('user_a_id', a).eq('user_b_id', b);
  }
  // Brand new relationship
  await Promise.all([incrementStat(a, 'pals_count'), incrementStat(b, 'pals_count')]);
  return supabase.from('pals').insert({ user_a_id: a, user_b_id: b, rounds_together: 1, invites_together: 1 });
}

export async function upsertInvitePal(userAId: string, userBId: string) {
  const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  const { data: existing } = await supabase
    .from('pals')
    .select('rounds_together, invites_together')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .single();

  if (existing) {
    return supabase.from('pals')
      .update({ invites_together: (existing.invites_together ?? 0) + 1 })
      .eq('user_a_id', a).eq('user_b_id', b);
  }
  return supabase.from('pals').insert({ user_a_id: a, user_b_id: b, rounds_together: 0, invites_together: 1 });
}

// ─── Round completion (call after final score submitted) ─────────────────────

export async function finalizeRound(
  roundId: string,
  playerIds: string[],
  hostId: string,
  scheduledAt: string | null,
  skinsWinnerIds?: string[],    // one per hole, null = carryover
  skinsPotValue?: number,
  winnerId?: string | null,
) {
  await updateRoundStatus(roundId, 'completed');

  // Increment rounds_played for all confirmed players
  for (const pid of playerIds) {
    await incrementStat(pid, 'rounds_played');
  }

  // Streak tracking — increment streak_weeks if this is a new week
  for (const pid of playerIds) {
    const { data: p } = await supabase.from('profiles').select('last_round_week, streak_weeks').eq('id', pid).single();
    if (p) {
      const thisWeek = getWeekStart(scheduledAt ?? new Date().toISOString());
      const lastWeek = p.last_round_week ? getWeekStart(addDays(p.last_round_week, 7)) : null;
      const isConsecutive = lastWeek === thisWeek;
      await supabase.from('profiles').update({
        last_round_week: thisWeek,
        streak_weeks: isConsecutive ? p.streak_weeks + 1 : 1,
      }).eq('id', pid);
    }
  }

  // Invite pairs — everyone on the round, regardless of rsvp
  const { data: allPlayers } = await supabase
    .from('round_players').select('player_id').eq('round_id', roundId);
  const allPlayerIds = (allPlayers ?? []).map((p: any) => p.player_id as string);
  for (let i = 0; i < allPlayerIds.length; i++) {
    for (let j = i + 1; j < allPlayerIds.length; j++) {
      await upsertInvitePal(allPlayerIds[i], allPlayerIds[j]);
    }
  }

  // Pals — increment rounds_together for confirmed players only
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      await upsertPal(playerIds[i], playerIds[j]);
    }
  }

  // Skins wins
  if (skinsWinnerIds) {
    for (const winnerId of skinsWinnerIds) {
      if (winnerId) await incrementStat(winnerId, 'skins_won');
    }
    if (skinsPotValue) {
      for (const winnerId of skinsWinnerIds) {
        if (winnerId) {
          const { data: p } = await supabase.from('profiles').select('biggest_skins_pot').eq('id', winnerId).single();
          if (p && skinsPotValue > p.biggest_skins_pot) {
            await supabase.from('profiles').update({ biggest_skins_pot: skinsPotValue }).eq('id', winnerId);
          }
        }
      }
    }
  }

  // Early bird: if tee time before 8 AM
  if (scheduledAt) {
    const hour = new Date(scheduledAt).getHours();
    if (hour < 8) {
      for (const pid of playerIds) await incrementStat(pid, 'early_bird_rounds');
    }
  }

  // Large round host (8+ players)
  if (playerIds.length >= 8) {
    await incrementStat(hostId, 'large_rounds_hosted');
  }

  // ─── Memory machine + game mechanics ────────────────────────────────────────

  const { data: roundMeta } = await supabase
    .from('rounds')
    .select('club_id, cover_image_id')
    .eq('id', roundId)
    .single();

  const { data: recap } = await supabase
    .from('recaps')
    .insert({
      round_id: roundId,
      created_by: hostId,
      cover_image_id: roundMeta?.cover_image_id ?? null,
      winner_id: winnerId ?? null,
      visibility: roundMeta?.club_id ? 'club' : 'public',
    })
    .select('id')
    .single();

  if (recap?.id) {
    await (supabase.rpc as any)('generate_superlatives', {
      p_recap_id: recap.id,
      p_round_id: roundId,
    });
    for (const pid of playerIds) {
      await (supabase.rpc as any)('generate_profile_labels', { p_user_id: pid });
    }
  }

  await (supabase.rpc as any)('update_rivalries', { p_round_id: roundId });

  if (roundMeta?.club_id) {
    await (supabase.rpc as any)('update_club_belts', { p_round_id: roundId });
    await (supabase.rpc as any)('award_season_points', { p_round_id: roundId });
  }
}

// ─── Match play ───────────────────────────────────────────────────────────────

export async function getMatchTeams(roundId: string): Promise<MatchTeam[]> {
  const { data } = await supabase.from('match_teams').select('*').eq('round_id', roundId);
  return (data ?? []) as MatchTeam[];
}

export async function upsertMatchTeam(roundId: string, playerId: string, team: 'a' | 'b') {
  return supabase.from('match_teams').upsert({ round_id: roundId, player_id: playerId, team });
}

export async function deleteMatchTeam(roundId: string, playerId: string) {
  return supabase.from('match_teams').delete().eq('round_id', roundId).eq('player_id', playerId);
}

export async function getMatchHoles(roundId: string): Promise<MatchHole[]> {
  const { data } = await supabase.from('match_holes').select('*').eq('round_id', roundId);
  return (data ?? []) as MatchHole[];
}

export async function upsertMatchHole(roundId: string, holeNumber: number, result: 'a' | 'b' | 'halve' | null) {
  if (result === null) {
    return supabase.from('match_holes').delete().eq('round_id', roundId).eq('hole_number', holeNumber);
  }
  return supabase.from('match_holes').upsert({ round_id: roundId, hole_number: holeNumber, result });
}

// ─── Clubs ────────────────────────────────────────────────────────────────────

export async function getMyClubs(userId: string): Promise<Club[]> {
  const { data: memberships } = await supabase
    .from('club_members')
    .select('club_id')
    .eq('user_id', userId);
  if (!memberships?.length) return [];

  const clubIds = (memberships as { club_id: string }[]).map((m) => m.club_id);
  const { data: clubs } = await supabase
    .from('clubs')
    .select('*')
    .in('id', clubIds)
    .order('created_at', { ascending: false });

  if (!clubs?.length) return [];

  const [{ data: allMembers }, { data: upcomingRounds }] = await Promise.all([
    supabase
      .from('club_members')
      .select('*, profile:profiles!club_members_user_id_fkey(*)')
      .in('club_id', clubIds),
    supabase
      .from('rounds')
      .select('*')
      .in('club_id', clubIds)
      .in('status', ['upcoming', 'active'])
      .order('scheduled_at', { ascending: true }),
  ]);

  const nextRoundByClub: Record<string, Round> = {};
  for (const r of (upcomingRounds ?? []) as Round[]) {
    if (r.club_id && !nextRoundByClub[r.club_id]) {
      nextRoundByClub[r.club_id] = r;
    }
  }

  return (clubs as Club[]).map((club) => ({
    ...club,
    members: ((allMembers ?? []) as ClubMember[]).filter((m) => m.club_id === club.id),
    nextRound: nextRoundByClub[club.id] ?? null,
  }));
}

export async function getClubWithMembers(clubId: string): Promise<Club | null> {
  const { data: club } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single();
  if (!club) return null;

  const { data: members } = await supabase
    .from('club_members')
    .select('*, profile:profiles!club_members_user_id_fkey(*)')
    .eq('club_id', clubId)
    .order('joined_at', { ascending: true });

  return { ...(club as Club), members: (members ?? []) as ClubMember[] };
}

export async function createClub(
  _userId: string,
  name: string,
  invitePolicy: 'owner_only' | 'officers' | 'any_member' = 'any_member',
): Promise<Club | null> {
  const { data, error } = await supabase.rpc('create_club', {
    p_name: name,
    p_invite_policy: invitePolicy,
  });
  if (error || !data) return null;
  return getClubWithMembers(data as string);
}

export async function redeemClubInvite(code: string): Promise<{ clubId: string } | { error: string }> {
  const { data, error } = await supabase.rpc('redeem_club_invite', { p_code: code });
  if (error) return { error: error.message };
  return { clubId: data as string };
}

export async function createClubInvite(clubId: string, createdBy: string): Promise<ClubInvite | null> {
  const { data, error } = await supabase
    .from('club_invites')
    .insert({ club_id: clubId, created_by: createdBy } as any)
    .select()
    .single();
  if (error) return null;
  return data as ClubInvite;
}

export async function addClubMember(clubId: string, userId: string, addedBy: string): Promise<void> {
  await supabase
    .from('club_members')
    .insert({ club_id: clubId, user_id: userId, added_by: addedBy, status: 'pending' as const });
}

export async function removeClubMember(clubId: string, userId: string): Promise<void> {
  await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', userId);
}

export async function patchClub(clubId: string, updates: Partial<Club>): Promise<void> {
  const { error } = await supabase.from('clubs').update(updates as any).eq('id', clubId);
  if (error) throw error;
}

export async function getClubPosts(clubId: string): Promise<ClubPost[]> {
  const { data } = await supabase
    .from('club_posts')
    .select('*, profile:profiles(*)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as ClubPost[];
}

export async function getClubMessages(clubId: string, limit = 100): Promise<ClubPost[]> {
  const { data } = await supabase
    .from('club_posts')
    .select('*, profile:profiles(*)')
    .eq('club_id', clubId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return (data ?? []) as ClubPost[];
}

export async function addClubPost(clubId: string, authorId: string, body: string): Promise<ClubPost | null> {
  const { data, error } = await supabase
    .from('club_posts')
    .insert({ club_id: clubId, author_id: authorId, body })
    .select('*, profile:profiles(*)')
    .single();
  if (error) return null;
  return data as ClubPost;
}

export async function getClubRounds(clubId: string): Promise<Round[]> {
  const { data } = await supabase
    .from('rounds')
    .select('*')
    .eq('club_id', clubId)
    .in('status', ['upcoming', 'active'])
    .order('scheduled_at');
  return (data ?? []) as Round[];
}

// ─── Cover image stats ────────────────────────────────────────────────────────

let _popularCache: { ids: string[]; at: number } | null = null;
const POPULAR_TTL_MS = 5 * 60 * 1000;

export function trackCoverPick(imageId: string, userId?: string): void {
  (supabase.rpc as any)('increment_cover_pick', { img_id: imageId }).then(() => {
    _popularCache = null;
  });
  if (userId) {
    (supabase.rpc as any)('increment_user_cover_pick', { p_user_id: userId, img_id: imageId }).then(() => {
      _userPickCache.delete(userId);
    });
  }
}

export async function getPopularCoverIds(): Promise<string[]> {
  if (_popularCache && Date.now() - _popularCache.at < POPULAR_TTL_MS) return _popularCache.ids;
  const { data } = await supabase
    .from('cover_image_stats')
    .select('image_id')
    .order('pick_count', { ascending: false })
    .limit(20);
  const ids = (data ?? []).map((r: any) => r.image_id as string);
  _popularCache = { ids, at: Date.now() };
  return ids;
}

const _userPickCache = new Map<string, { picks: { imageId: string; count: number }[]; at: number }>();

export async function getUserCoverHistory(userId: string): Promise<{ imageId: string; count: number }[]> {
  const cached = _userPickCache.get(userId);
  if (cached && Date.now() - cached.at < POPULAR_TTL_MS) return cached.picks;
  const { data } = await supabase
    .from('user_cover_picks')
    .select('image_id, pick_count')
    .eq('user_id', userId)
    .order('pick_count', { ascending: false })
    .limit(30);
  const picks = (data ?? []).map((r: any) => ({ imageId: r.image_id as string, count: r.pick_count as number }));
  _userPickCache.set(userId, { picks, at: Date.now() });
  return picks;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getWeekStart(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
