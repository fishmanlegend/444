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
  image?: number;
  imageScale?: number;
  name: string;
  flavorText: string;
  statNote?: string;   // clarifies what the underlying stat measures
  tiers: BadgeTier[];
  describe: (threshold: number) => string;
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
  largeRounds: number;           // rounds played (any role) with 8+ players
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
    image: require('../assets/badges/badge_rounds_played.png'),
    name: 'Rounds Played',
    flavorText: 'Show up. Play golf. Repeat until it\'s a lifestyle.',
    describe: (n) => `Played ${n} round${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,   title: 'First Tee' },
      { threshold: 5,   title: 'Green Gremlin' },
      { threshold: 10,  title: 'Bogey Man' },
      { threshold: 25,  title: 'Swamp Shanker' },
      { threshold: 50,  title: 'Divot Demon' },
      { threshold: 100, title: 'Green Goblin' },
      { threshold: 200, title: 'Iron Giant' },
      { threshold: 350, title: 'Sir Shanksalot' },
      { threshold: 500, title: 'Fairwayman' },
    ],
  },
  {
    id: 'rounds_hosted',
    emoji: '🎤',
    image: require('../assets/badges/badge_rounds_hosted.png'),
    name: 'Rounds Hosted',
    flavorText: 'You send the invites. Legend.',
    describe: (n) => `Hosted ${n}x`,
    tiers: [
      { threshold: 1,   title: 'Instigator' },
      { threshold: 3,   title: 'Tee Booker' },
      { threshold: 5,   title: 'Herd Leader' },
      { threshold: 15,  title: 'Shot Caller' },
      { threshold: 25,  title: 'Ringmaster' },
      { threshold: 50,  title: 'Orchestrator' },
      { threshold: 100, title: 'AirBnB Superhost' },
      { threshold: 200, title: 'Alex Trebek' },
    ],
  },
  {
    id: 'pals_made',
    emoji: '🤝',
    image: require('../assets/badges/badge_pals_made.png'),
    name: 'Pals Made',
    flavorText: 'Golf is just an excuse to meet people and touch grass.',
    describe: (n) => `Golfed w/ ${n} pal${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,   title: 'Friendly' },
      { threshold: 5,   title: 'Social' },
      { threshold: 10,  title: 'Yapper' },
      { threshold: 25,  title: 'Connector' },
      { threshold: 50,  title: 'Networker' },
      { threshold: 100, title: 'Popular' },
      { threshold: 200, title: 'Drama Queen' },
      { threshold: 500, title: 'Zuck' },
    ],
  },
  {
    id: 'streak',
    emoji: '🔥',
    image: require('../assets/badges/badge_streak.png'),
    name: 'Streak',
    flavorText: 'Every week, no excuses. Not a problem — a calling.',
    describe: (n) => `${n} wk${n === 1 ? '' : 's'} in a row`,
    tiers: [
      { threshold: 2,  title: 'Streaky' },
      { threshold: 3,  title: 'Committed' },
      { threshold: 4,  title: 'Hardcore' },
      { threshold: 6,  title: 'Sicko' },
      { threshold: 8,  title: 'Turf Brain' },
      { threshold: 12, title: 'Seek Help' },
      { threshold: 24, title: 'Cart Zombie' },
      { threshold: 52, title: '1-Yr Old' },
    ],
  },
  {
    id: 'courses_played',
    emoji: '🗺️',
    name: 'Courses Played',
    flavorText: 'New course, same score. Collect them anyway.',
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
    flavorText: 'Up before the sun to hit a ball around. Unhinged.',
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
    image: require('../assets/badges/badge_skins_won.png'),
    name: 'Skins Won',
    flavorText: 'Quietly robbing your friends one hole at a time.',
    describe: (n) => `Won ${n} skin${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,   title: 'Lucky' },
      { threshold: 3,   title: 'Hot Hand' },
      { threshold: 5,   title: 'Big Winner' },
      { threshold: 10,  title: 'Millionaire' },
      { threshold: 20,  title: 'Robber Baron' },
      { threshold: 50,  title: 'Trust Fund' },
      { threshold: 100, title: 'Hedge Fund' },
      { threshold: 200, title: 'Billionaire' },
      { threshold: 500, title: 'Monopoly Man' },
    ],
  },
  {
    id: 'scoring',
    emoji: '📊',
    name: 'Scoring',
    flavorText: 'The numbers don\'t lie. Improvement is optional.',
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
    flavorText: 'Someone had a bad day so you could have a great one.',
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
    image: require('../assets/badges/badge_plus_one.png'),
    name: 'Plus One',
    flavorText: 'You brought people to Country Club. They blame you.',
    statNote: 'Tracks people you\'ve invited to Country Club',
    describe: (n) => `Invited ${n} pal${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,   title: 'Wingman' },
      { threshold: 3,   title: 'Scout' },
      { threshold: 5,   title: 'Influencer' },
      { threshold: 10,  title: 'Evangelist' },
      { threshold: 25,  title: 'MLM Mommy' },
      { threshold: 50,  title: 'VP Growth' },
      { threshold: 100, title: 'Cult Leader' },
    ],
  },
  {
    id: 'connector',
    emoji: '🔗',
    name: 'The Connector',
    flavorText: 'You didn\'t just invite — you created a host. Golf pyramid scheme.',
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
    image: require('../assets/badges/badge_rivalry.png'),
    name: 'Rivalry',
    flavorText: 'There\'s always that one guy. For you, there are several.',
    statNote: 'A rival = someone you\'ve played 3+ rounds against',
    describe: (n) => `${n} rival${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Personal' },
      { threshold: 2,  title: 'Aaron Burr' },
      { threshold: 3,  title: 'Beefing' },
      { threshold: 5,  title: 'Nemeses' },
      { threshold: 10, title: 'Heated Rivalry' },
      { threshold: 20, title: 'Hater Arc' },
      { threshold: 50, title: 'Blood Feud' },
      { threshold: 75, title: 'Anime Villain' },
      { threshold: 100, title: 'The Final Boss' },
    ],
  },
  {
    id: 'the_regular',
    emoji: '📅',
    name: 'The Regular',
    flavorText: 'Same crew, same jokes. This is peak golf life.',
    statNote: 'Same crew = 3+ of the same players across rounds',
    describe: (n) => `${n} round${n === 1 ? '' : 's'} w/ same crew`,
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
    image: require('../assets/badges/badge_guest_of_honor.png'),
    name: 'New Crews',
    flavorText: 'You fit into any group instantly. Always invited back.',
    statNote: 'A new crew = a group with none of your usual pals',
    describe: (n) => `${n} new crew${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,   title: 'Fresh Face' },
      { threshold: 3,   title: 'Guest of Honor' },
      { threshold: 5,   title: 'Walk-On' },
      { threshold: 10,  title: 'Well Known' },
      { threshold: 25,  title: 'Socialite' },
      { threshold: 50,  title: 'Be Our Guest' },
      { threshold: 100, title: 'Belle O\' Ball' },
    ],
  },

  // ── Hosting ────────────────────────────────────────────────────────────────
  {
    id: 'rounds_hosted_large',
    emoji: '🎉',
    image: require('../assets/badges/badge_rounds_hosted_large.png'),
    name: 'Big Rounds Attended',
    flavorText: 'Eight+ people on a course might be your fault. Just own it.',
    statNote: 'A big round = 8+ players',
    describe: (n) => `${n} big round${n === 1 ? '' : 's'}`,
    tiers: [
      { threshold: 1,  title: 'Partygoer' },
      { threshold: 3,  title: 'Socialite' },
      { threshold: 10, title: 'Butterfly' },
      { threshold: 15, title: 'Carried Away' },
      { threshold: 25, title: 'Tom & Daisy' },
      { threshold: 50, title: 'Ibiza' },
    ],
  },
  {
    id: 'host_with_most',
    emoji: '🏠',
    name: 'Host with the Most',
    flavorText: 'Open door policy. Every group gets a tee time.',
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
    flavorText: 'Six months later, same people, same excuses. Nothing changed.',
    statNote: 'A reunion = 6+ months since your last shared round',
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
    flavorText: 'Travel far. Spend too much. Shoot the same score.',
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
    flavorText: 'You found your people. Either way, you\'re in.',
    describe: (n) => `Member of ${n} club${n === 1 ? '' : 's'}`,
    tiers: [{ threshold: 1, title: 'Member' }],
  },

  // ── On-course performance ──────────────────────────────────────────────────
  {
    id: 'eagle_eye',
    emoji: '🦅',
    name: 'Eagle Eye',
    flavorText: 'Two under par. You did that on purpose.',
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
    flavorText: 'You make birdies look routine. Partners are furious.',
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
    flavorText: 'Without you, these people never would have met.',
    statNote: 'Rounds where you bridged two disconnected friend groups',
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
    flavorText: 'You keep score like your life depends on it.',
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
    flavorText: 'If there\'s no photo, it didn\'t happen. You get it.',
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
  'rounds_hosted_large',
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
//   -- rivalries: pair-level subquery (rounds_together >= 3)
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
    case 'rounds_hosted_large': return stats.largeRounds;
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
