// Badge definitions and logic.
// Stats come from Supabase queries (see UserStats below).
// computeEarnedBadges() runs client-side for now; move to a Postgres function
// or Edge Function once real data exists.
//
// Total badges: 24

// ─── Types ────────────────────────────────────────────────────────────────────

export type BadgeId =
  // Group 1 — core activity
  | 'rounds_played'
  | 'rounds_hosted'
  | 'pals_made'
  | 'streak'
  | 'courses_played'
  | 'early_bird'
  // Group 2 — money & scoring
  | 'skins_won'
  | 'scoring'
  | 'big_winner'
  // Group 3 — social graph
  | 'plus_one'
  | 'connector'
  | 'rivalry'
  | 'the_regular'
  | 'guest_of_honor'
  // Group 4 — hosting
  | 'rounds_hosted_large'   // party_starter
  | 'host_with_most'
  | 'reunion'
  // Group 5 — exploration
  | 'road_warrior'
  | 'club'
  // Group 6 — on-course performance
  | 'eagle_eye'
  | 'birdie_machine'
  // Group 7 — community
  | 'the_glue'
  | 'accountant'
  | 'photographer';

export type BadgeTier = {
  threshold: number;
  title: string;
};

export type BadgeDefinition = {
  id: BadgeId;
  emoji: string;
  name: string;
  tiers: BadgeTier[];
  describe: (threshold: number) => string;
  // 'lte' for badges where lower stat = better (e.g. best golf score)
  compare?: 'gte' | 'lte';
};

// Supabase query shape — one row per user from a `user_stats` view.
export type UserStats = {
  // Core activity
  roundsPlayed: number;
  roundsHosted: number;
  palsMade: number;
  currentStreakWeeks: number;
  coursesPlayed: number;         // COUNT(DISTINCT course_name) on rounds
  earlyBirdRounds: number;       // rounds where tee_time < 08:00 local

  // Money & scoring
  skinsWon: number;
  bestScore: number | null;      // lowest 18-hole gross score logged
  biggestSkinsPot: number;       // largest single skins pot won ($)

  // Social graph
  introductions: number;         // referrals table: rows where referrer_id = user
  connectors: number;            // referrals where referred user went on to host ≥1 round
  rivalries: number;             // pals played 5+ rounds against (pair-level query)
  regularGroupRounds: number;    // rounds with same core group composition (complex — see SQL hint)
  guestRounds: number;           // rounds where <50% of players are in user's usual pals

  // Hosting
  largeRoundsHosted: number;     // rounds hosted with 8+ players
  uniqueGroupsHosted: number;    // COUNT(DISTINCT group_hash) where group_hash = sorted player IDs

  // Exploration
  // Requires place_id (Google Places) on rounds for reliable city dedup.
  // Fall back to COUNT(DISTINCT city) from reverse-geocoded tee_location if available.
  citiesPlayed: number;

  // Other
  reunions: number;              // rounds with a pal after 6+ months since last shared round
  clubsJoined: number;

  // On-course performance
  eaglesMade: number;            // COUNT of eagle scores across all tracked scorecards
  birdiesMade: number;           // COUNT of birdie scores across all tracked scorecards

  // Community
  glueRounds: number;            // rounds where user bridged two otherwise disconnected friend groups
  scorecardsKept: number;        // scorecards fully submitted (all holes entered)
  photosShared: number;          // photos posted to any round
};

export type EarnedBadgeTier = {
  badgeId: BadgeId;
  tierIndex: number;             // -1 = not yet earned, 0–3 = current tier
  title: string | null;
  nextThreshold: number | null;  // null = max tier reached or not applicable
  progress: number;
};

// ─── Definitions ──────────────────────────────────────────────────────────────

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ── Core activity ──────────────────────────────────────────────────────────
  {
    id: 'rounds_played',
    emoji: '🏌️',
    name: 'Rounds Played',
    describe: (n) => `Played ${n} round${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,   title: 'First Tee' },
      { threshold: 10,  title: 'Regular' },
      { threshold: 50,  title: 'Veteran' },
      { threshold: 100, title: 'Legend' },
    ],
  },
  {
    id: 'rounds_hosted',
    emoji: '🎯',
    name: 'Rounds Hosted',
    describe: (n) => `Hosted ${n} round${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Organizer' },
      { threshold: 5,  title: 'Club Captain' },
      { threshold: 15, title: 'Commissioner' },
      { threshold: 30, title: 'The Fixer' },
    ],
  },
  {
    id: 'pals_made',
    emoji: '🤝',
    name: 'Pals Made',
    describe: (n) => `Golfed with ${n} pal${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Friendly' },
      { threshold: 10, title: 'Social' },
      { threshold: 25, title: 'Connector' },
      { threshold: 50, title: 'Mayor' },
    ],
  },
  {
    id: 'streak',
    emoji: '🔥',
    name: 'Streak',
    describe: (n) => `${n} consecutive week${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 2,  title: 'Getting Hooked' },
      { threshold: 5,  title: 'Weekend Warrior' },
      { threshold: 10, title: 'Obsessed' },
      { threshold: 20, title: 'Send Help' },
    ],
  },
  {
    id: 'courses_played',
    emoji: '🗺️',
    name: 'Courses Played',
    describe: (n) => `Played ${n} course${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Local' },
      { threshold: 5,  title: 'Traveler' },
      { threshold: 20, title: 'Explorer' },
      { threshold: 50, title: 'Globetrotter' },
    ],
  },
  {
    id: 'early_bird',
    emoji: '🌅',
    name: 'Early Bird',
    describe: (n) => `${n} early tee time${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 2,  title: 'Early Bird' },
      { threshold: 5,  title: 'Dawn Patrol' },
      { threshold: 15, title: 'Sunrise Regular' },
      { threshold: 30, title: 'First Light' },
    ],
  },

  // ── Money & scoring ────────────────────────────────────────────────────────
  {
    id: 'skins_won',
    emoji: '💰',
    name: 'Skins Won',
    describe: (n) => `Won ${n} skin${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 3,  title: 'Lucky' },
      { threshold: 15, title: 'Hustler' },
      { threshold: 35, title: 'Shark' },
      { threshold: 75, title: 'The Bank' },
    ],
  },
  {
    id: 'scoring',
    emoji: '📊',
    name: 'Scoring',
    // Lower score = better; tiers unlock when bestScore <= threshold
    compare: 'lte',
    describe: (n) => `Best score: ${n}`,
    tiers: [
      { threshold: 99, title: 'Bogey Man' },
      { threshold: 89, title: 'Bogey Golfer' },
      { threshold: 79, title: 'Scratch Curious' },
      { threshold: 72, title: 'Par Hunter' },
    ],
  },
  {
    id: 'big_winner',
    emoji: '🏆',
    name: 'Big Winner',
    describe: (n) => `Won a $${n}+ pot`,
    tiers: [
      { threshold: 10,  title: 'In the Money' },
      { threshold: 25,  title: 'Payday' },
      { threshold: 50,  title: 'High Roller' },
      { threshold: 100, title: 'The House' },
    ],
  },

  // ── Social graph ───────────────────────────────────────────────────────────
  {
    id: 'plus_one',
    emoji: '➕',
    name: 'Plus One',
    describe: (n) => `Brought ${n} pal${n === 1 ? '' : 's'} to CC.`,
    tiers: [
      { threshold: 1,  title: 'Wingman' },
      { threshold: 3,  title: 'Recruiter' },
      { threshold: 5,  title: 'Ambassador' },
      { threshold: 10, title: 'The Introducer' },
    ],
  },
  {
    id: 'connector',
    emoji: '🔗',
    name: 'The Connector',
    describe: (n) => `${n} invite${n === 1 ? '' : 's'} led to a hosted round`,
    tiers: [
      { threshold: 1,  title: 'Spark' },
      { threshold: 3,  title: 'Igniter' },
      { threshold: 5,  title: 'Catalyst' },
      { threshold: 10, title: 'The Connector' },
    ],
  },
  {
    id: 'rivalry',
    emoji: '⚔️',
    name: 'Rivalry',
    describe: (n) => `${n} rival${n === 1 ? '' : 'ries'} (5+ matchups)`,
    tiers: [
      { threshold: 1, title: 'Getting Personal' },
      { threshold: 3, title: 'It\'s On' },
      { threshold: 5, title: 'Nemesis' },
      { threshold: 10, title: 'Arch Rivals' },
    ],
  },
  {
    id: 'the_regular',
    emoji: '📅',
    name: 'The Regular',
    describe: (n) => `${n} round${n === 1 ? '' : 's'} with the same crew`,
    tiers: [
      { threshold: 5,  title: 'Your People' },
      { threshold: 10, title: 'Crew' },
      { threshold: 25, title: 'The Core' },
      { threshold: 50, title: 'Family' },
    ],
  },
  {
    id: 'guest_of_honor',
    emoji: '🎟️',
    name: 'Guest of Honor',
    describe: (n) => `Ran with ${n} new crew${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Fresh Face' },
      { threshold: 3,  title: 'Open Book' },
      { threshold: 5,  title: 'Well Rounded' },
      { threshold: 10, title: 'Everyone\'s Guest' },
    ],
  },

  // ── Hosting ────────────────────────────────────────────────────────────────
  {
    id: 'rounds_hosted_large',
    emoji: '🎉',
    name: 'Party Starter',
    describe: (n) => `Hosted ${n} round${n === 1 ? '' : 's'} with 8+ players`,
    tiers: [
      { threshold: 1,  title: 'You Go Big' },
      { threshold: 3,  title: 'Fan Favorite' },
      { threshold: 5,  title: 'Scene Maker' },
      { threshold: 10, title: 'The Party' },
    ],
  },
  {
    id: 'host_with_most',
    emoji: '🏠',
    name: 'Host with the Most',
    describe: (n) => `Hosted ${n} unique group${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 3,  title: 'Open Door' },
      { threshold: 5,  title: 'The Hub' },
      { threshold: 10, title: 'Host with the Most' },
      { threshold: 20, title: 'Everyone\'s Host' },
    ],
  },
  {
    id: 'reunion',
    emoji: '🎊',
    name: 'The Reunion',
    describe: (n) => `${n} reunion round${n === 1 ? '' : 's'} (6+ months apart)`,
    tiers: [
      { threshold: 1,  title: 'Like It Never Stopped' },
      { threshold: 3,  title: 'Old Friends' },
      { threshold: 5,  title: 'Reunion Tour' },
      { threshold: 10, title: 'The Comeback' },
    ],
  },

  // ── Exploration ────────────────────────────────────────────────────────────
  {
    id: 'road_warrior',
    emoji: '✈️',
    name: 'Road Warrior',
    // Requires place_id on rounds → city extracted via Google Places API
    describe: (n) => `Played in ${n} cit${n === 1 ? 'y' : 'ies'}`,
    tiers: [
      { threshold: 2,  title: 'Day Tripper' },
      { threshold: 5,  title: 'Road Warrior' },
      { threshold: 10, title: 'On Tour' },
      { threshold: 20, title: 'Globe Trotter' },
    ],
  },
  {
    id: 'club',
    emoji: '🪪',
    name: 'Club Member',
    describe: (n) => `Member of ${n} club${n === 1 ? '' : 's'}`,
    tiers: [{ threshold: 1, title: 'Member' }],
  },

  // ── On-course performance ──────────────────────────────────────────────────
  {
    id: 'eagle_eye',
    emoji: '🦅',
    name: 'Eagle Eye',
    describe: (n) => `Made ${n} eagle${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 3,  title: 'Fortunate' },
      { threshold: 8,  title: 'Eagle Eye' },
      { threshold: 20, title: 'Double Trouble' },
      { threshold: 50, title: 'Soaring' },
    ],
  },
  {
    id: 'birdie_machine',
    emoji: '🐦',
    name: 'Birdie Machine',
    describe: (n) => `Made ${n} birdie${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 5,   title: 'Birdie' },
      { threshold: 20,  title: 'Bird Dog' },
      { threshold: 50,  title: 'Machine' },
      { threshold: 100, title: 'Full Flock' },
    ],
  },

  // ── Community ──────────────────────────────────────────────────────────────
  {
    id: 'the_glue',
    emoji: '🫂',
    name: 'The Glue',
    // glueRounds: rounds where user bridged otherwise disconnected friend groups
    describe: (n) => `Kept ${n} group${n === 1 ? '' : 's'} together`,
    tiers: [
      { threshold: 3,  title: 'Glue' },
      { threshold: 8,  title: 'Super Glue' },
      { threshold: 15, title: 'Cement' },
      { threshold: 25, title: 'Bedrock' },
    ],
  },
  {
    id: 'accountant',
    emoji: '📋',
    name: 'Accountant',
    describe: (n) => `Kept score for ${n} round${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Diligent' },
      { threshold: 5,  title: 'Accountant' },
      { threshold: 15, title: 'Auditor' },
      { threshold: 30, title: 'The IRS' },
    ],
  },
  {
    id: 'photographer',
    emoji: '📸',
    name: 'Photographer',
    describe: (n) => `Shared ${n} photo${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Snap' },
      { threshold: 5,  title: 'Sharer' },
      { threshold: 15, title: 'Promoter' },
      { threshold: 30, title: 'Paparazzi' },
    ],
  },
];

// ─── Default pinned set ───────────────────────────────────────────────────────
// The 6 shown by default — highlights the more novel/fun badges.
// Users can swap via the organizer sheet.
export const PROFILE_BADGE_IDS: BadgeId[] = [
  'rounds_played',
  'rounds_hosted',
  'pals_made',
  'streak',
  'skins_won',
  'plus_one',
  'rivalry',
  'guest_of_honor',
  'club',
];

// ─── Supabase query hints ─────────────────────────────────────────────────────
//
// user_stats view (Supabase SQL editor — simplified):
//
// SELECT
//   p.id,
//   COUNT(DISTINCT rp.round_id) FILTER (WHERE rp.status='in')                AS rounds_played,
//   COUNT(DISTINCT r.id)        FILTER (WHERE r.host_id=p.id)                AS rounds_hosted,
//   COUNT(DISTINCT pal.id)                                                    AS pals_made,
//   COUNT(DISTINCT r.course_name) FILTER (WHERE rp.status='in')              AS courses_played,
//   COALESCE(SUM(sw.skins_won),0)                                            AS skins_won,
//   COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM r.tee_time AT TIME ZONE p.timezone)<8
//                      AND rp.status='in')                                   AS early_bird_rounds,
//   MIN(sc.gross_score) FILTER (WHERE sc.holes=18)                           AS best_score,
//   COALESCE(MAX(sp.pot_won),0)                                              AS biggest_skins_pot,
//   COUNT(DISTINCT ref.new_user_id)                                           AS introductions,
//   COUNT(DISTINCT ref2.new_user_id) FILTER (WHERE ref2.went_on_to_host)     AS connectors,
//   -- rivalries: pair-level subquery (rounds_together >= 5)
//   -- regularGroupRounds: group_hash = MD5(sorted player IDs), MAX(count per hash)
//   -- citiesPlayed: COUNT(DISTINCT place.city) joined via rounds.place_id
//   -- largeRoundsHosted: rounds hosted where player_count >= 8
//   -- uniqueGroupsHosted: COUNT(DISTINCT group_hash) for hosted rounds
//   -- reunions: rounds where last_shared_round_with_pal > 6 months ago
//   COUNT(DISTINCT cm.club_id)                                                AS clubs_joined
// FROM profiles p ...

// ─── Compute ──────────────────────────────────────────────────────────────────

function statForBadge(id: BadgeId, stats: UserStats): number {
  switch (id) {
    case 'rounds_played':       return stats.roundsPlayed;
    case 'rounds_hosted':       return stats.roundsHosted;
    case 'pals_made':           return stats.palsMade;
    case 'streak':              return stats.currentStreakWeeks;
    case 'courses_played':      return stats.coursesPlayed;
    case 'early_bird':          return stats.earlyBirdRounds;
    case 'skins_won':           return stats.skinsWon;
    case 'scoring':             return stats.bestScore ?? Infinity;
    case 'big_winner':          return stats.biggestSkinsPot;
    case 'plus_one':            return stats.introductions;
    case 'connector':           return stats.connectors;
    case 'rivalry':             return stats.rivalries;
    case 'the_regular':         return stats.regularGroupRounds;
    case 'guest_of_honor':      return stats.guestRounds;
    case 'rounds_hosted_large': return stats.largeRoundsHosted;
    case 'host_with_most':      return stats.uniqueGroupsHosted;
    case 'reunion':             return stats.reunions;
    case 'road_warrior':        return stats.citiesPlayed;
    case 'club':                return stats.clubsJoined;
    case 'eagle_eye':           return stats.eaglesMade;
    case 'birdie_machine':      return stats.birdiesMade;
    case 'the_glue':            return stats.glueRounds;
    case 'accountant':          return stats.scorecardsKept;
    case 'photographer':        return stats.photosShared;
  }
}

export function computeEarnedBadges(stats: UserStats): EarnedBadgeTier[] {
  return BADGE_DEFINITIONS.map((def) => {
    const value = statForBadge(def.id, stats);
    const lte = def.compare === 'lte';
    const earned = def.tiers.filter((t) => lte ? value <= t.threshold : value >= t.threshold);
    // For lte badges (scoring), higher tiers = lower thresholds — sort descending
    if (lte) earned.sort((a, b) => a.threshold - b.threshold);
    const tierIndex = earned.length - 1;
    const current = earned[tierIndex];
    const allTiers = lte
      ? [...def.tiers].sort((a, b) => a.threshold - b.threshold)
      : def.tiers;
    const nextTierIdx = tierIndex + 1;
    const next = allTiers[nextTierIdx] ?? null;
    return {
      badgeId: def.id,
      tierIndex,
      title: current?.title ?? null,
      nextThreshold: next?.threshold ?? null,
      progress: value === Infinity ? 0 : value,
    };
  });
}
