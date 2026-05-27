export type RoundFormat = 'stroke' | 'skins' | 'stableford' | 'match' | 'best_ball' | 'other' | 'nassau' | 'wolf' | 'nines' | 'snake' | 'banker';
export type RoundStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';
export type RsvpStatus  = 'in' | 'maybe' | 'out' | 'pending';

export interface Profile {
  id: string;
  phone: string;
  name: string | null;
  handle: string | null;
  initials: string | null;
  avatar_color: string;
  avatar_text_color: string;
  location: string | null;
  bio: string | null;
  avatar_url: string | null;
  instagram_handle: string | null;
  venmo_handle: string | null;
  snapchat_handle: string | null;
  // ── Badge stats ────────────────────────────────────────────────────────────
  rounds_played: number;
  rounds_hosted: number;
  pals_count: number;
  streak_weeks: number;
  last_round_week: string | null;      // ISO date, for streak calc
  skins_won: number;
  biggest_skins_pot: number;
  early_bird_rounds: number;           // tee time before 8am
  clubs_joined: number;
  introductions: number;               // plus_one badge
  connectors: number;
  rivalries: number;
  regular_group_rounds: number;        // rounds with the same group
  guest_rounds: number;
  large_rounds_hosted: number;         // rounds with 8+ players
  unique_groups_hosted: number;
  courses_played: number;
  cities_played: number;
  reunions: number;                    // played same course 3+ times
  eagles_made: number;
  birdies_made: number;
  glue_rounds: number;                 // rounds where you invited the most people
  scorecards_kept: number;
  photos_shared: number;
  best_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Round {
  id: string;
  host_id: string;
  club_id: string | null;
  title: string | null;
  course_name: string | null;
  format: RoundFormat;
  scheduled_at: string | null;
  spots: number;
  cost_cents: number;
  skins_bet_cents: number;
  cover_image_id: string | null;
  cover_is_video: boolean;
  note: string | null;
  poll_guests: boolean;
  total_holes: number;
  starting_hole: number;
  status: RoundStatus;
  completed_at: string | null;
  created_at: string;
  format_config?: Record<string, unknown>;
}

export interface Hole {
  round_id: string;
  hole_number: number;
  par: number;
  yardage: number | null;
}

export interface TempPlayer {
  id: string;
  round_id: string;
  name: string;
  phone: string | null;
  created_by: string;
  created_at: string;
  anonymized_at?: string | null;
}

export interface TempScore {
  round_id: string;
  temp_player_id: string;
  hole_number: number;
  strokes: number | null;
  putts?: number | null;
  recorded_at: string;
}

export interface RoundPlayer {
  id: string;
  round_id: string;
  player_id: string | null;        // null for temp players
  temp_player_id: string | null;   // non-null for temp players
  course_handicap?: number | null;
  rsvp: RsvpStatus;
  is_host: boolean;
  joined_at: string;
  // joined via select
  profile?: Profile;
  temp_player?: TempPlayer;
}

export interface Score {
  round_id: string;
  player_id: string;
  hole_number: number;
  strokes: number | null;
  putts?: number | null;
  recorded_at: string;
}

export interface SkinsResult {
  round_id: string;
  hole_number: number;
  winner_id: string | null;
  pot_value: number;
}

export interface Pal {
  user_a_id: string;
  user_b_id: string;
  rounds_together: number;
  invites_together: number;
  created_at: string;
  // joined via select
  profile?: Profile;
}

export interface RoundComment {
  id: string;
  round_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Profile;
}

export interface GuestRsvp {
  id: string;
  round_id: string;
  name: string;
  phone: string | null;
  rsvp: 'in' | 'maybe' | 'out';
  created_at: string;
}

export interface MatchTeam {
  round_id: string;
  player_id: string;
  team: 'a' | 'b';
}

export interface MatchHole {
  round_id: string;
  hole_number: number;
  result: 'a' | 'b' | 'halve' | null;
}

export type InvitePolicy = 'owner_only' | 'officers' | 'any_member';

export interface Club {
  id: string;
  name: string;
  created_by: string;
  banner_image_id: string | null;
  banner_is_video: boolean;
  only_host_can_create_rounds: boolean;
  invite_policy: InvitePolicy;
  created_at: string;
  // joined
  members?: ClubMember[];
  nextRound?: Round | null;
}

export interface ClubInvite {
  id: string;
  club_id: string;
  created_by: string;
  code: string;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface ClubPost {
  id: string;
  club_id: string;
  author_id: string;
  body: string;
  created_at: string;
  // joined
  profile?: Profile;
}

export interface ClubMember {
  id: string;
  club_id: string;
  user_id: string;
  added_by: string | null;
  joined_at: string;
  status: 'pending' | 'member';
  role: 'owner' | 'officer' | 'member';
  // joined
  profile?: Profile;
}

// ── New game mode types ────────────────────────────────────────────────────────

export interface NassauBet {
  id: string;
  round_id: string;
  type: 'front' | 'back' | 'total' | 'press';
  start_hole: number;
  end_hole: number;
  parent_bet_id: string | null;
}

export interface NassauHole {
  round_id: string;
  bet_id: string;
  hole_number: number;
  result: 'a' | 'b' | 'halve' | null;
}

export interface WolfHole {
  round_id: string;
  hole_number: number;
  wolf_player_id: string;
  partner_player_id: string | null;
  is_blind: boolean;
  result: 'wolf' | 'pack' | null;
}

export interface BankerHole {
  round_id: string;
  hole_number: number;
  banker_player_id: string;
}

export interface BankerResult {
  round_id: string;
  hole_number: number;
  player_id: string;
  result: 'win' | 'loss' | 'halve';
}

export interface PollVote {
  round_id: string;
  voter_id: string;
  option_index: number;
  voted_at: string;
}

// ── Supabase Database shape ────────────────────────────────────────────────────

type R = Record<string, unknown>;

type DbRel = {
  foreignKeyName: string; columns: string[]; isOneToOne: boolean;
  referencedRelation: string; referencedColumns: string[];
};

export type Database = {
  public: {
    Tables: {
      profiles:           { Row: Profile      & R; Insert: (Partial<Profile> & { id: string; phone: string }) & R; Update: Partial<Profile>    & R; Relationships: DbRel[] };
      rounds:             { Row: Round        & R; Insert: Omit<Round, 'id' | 'created_at' | 'format_config'> & { format_config?: Record<string, unknown> } & R; Update: Partial<Round> & R; Relationships: DbRel[] };
      holes:              { Row: Hole         & R; Insert: Hole                                               & R; Update: Partial<Hole>        & R; Relationships: DbRel[] };
      round_players:      { Row: RoundPlayer  & R; Insert: (Omit<RoundPlayer, 'id' | 'joined_at' | 'profile' | 'temp_player' | 'player_id' | 'temp_player_id'> & { player_id?: string | null; temp_player_id?: string | null }) & R; Update: Partial<RoundPlayer> & R; Relationships: DbRel[] };
      temp_players:       { Row: TempPlayer   & R; Insert: Omit<TempPlayer, 'id' | 'created_at' | 'anonymized_at'> & R;       Update: Partial<TempPlayer>   & R; Relationships: DbRel[] };
      temp_scores:        { Row: TempScore    & R; Insert: TempScore                                                            & R; Update: Partial<TempScore>    & R; Relationships: DbRel[] };
      scores:             { Row: Score        & R; Insert: Score                                              & R; Update: Partial<Score>       & R; Relationships: DbRel[] };
      skins_results:      { Row: SkinsResult  & R; Insert: SkinsResult                                        & R; Update: Partial<SkinsResult> & R; Relationships: DbRel[] };
      pals:               { Row: Pal          & R; Insert: Omit<Pal, 'created_at' | 'profile'>                & R; Update: Partial<Pal>         & R; Relationships: DbRel[] };
      clubs:              { Row: Club         & R; Insert: Omit<Club, 'id' | 'created_at' | 'members' | 'nextRound'>       & R; Update: Partial<Club>        & R; Relationships: DbRel[] };
      club_members:       { Row: ClubMember   & R; Insert: Omit<ClubMember, 'id' | 'joined_at' | 'profile'>               & R; Update: Partial<ClubMember>  & R; Relationships: DbRel[] };
      club_invites:       { Row: ClubInvite   & R; Insert: Omit<ClubInvite, 'id' | 'created_at' | 'used_by' | 'used_at' | 'code'> & R; Update: Partial<ClubInvite> & R; Relationships: DbRel[] };
      club_posts:         { Row: ClubPost     & R; Insert: Omit<ClubPost, 'id' | 'created_at' | 'profile'>                & R; Update: Partial<ClubPost>    & R; Relationships: DbRel[] };
      match_teams:        { Row: MatchTeam    & R; Insert: MatchTeam                                          & R; Update: Partial<MatchTeam>   & R; Relationships: DbRel[] };
      match_holes:        { Row: MatchHole    & R; Insert: MatchHole                                          & R; Update: Partial<MatchHole>   & R; Relationships: DbRel[] };
      guest_rsvps:        { Row: GuestRsvp    & R; Insert: Omit<GuestRsvp, 'id' | 'created_at'>               & R; Update: Partial<GuestRsvp>   & R; Relationships: DbRel[] };
      round_comments:     { Row: RoundComment & R; Insert: Omit<RoundComment, 'id' | 'created_at' | 'profile'> & R; Update: Partial<RoundComment> & R; Relationships: DbRel[] };
      cover_image_stats:  { Row: { image_id: string; pick_count: number; updated_at: string } & R; Insert: { image_id: string; pick_count?: number } & R; Update: { pick_count?: number } & R; Relationships: DbRel[] };
      user_cover_picks:   { Row: { user_id: string; image_id: string; pick_count: number }    & R; Insert: { user_id: string; image_id: string; pick_count?: number } & R; Update: { pick_count?: number } & R; Relationships: DbRel[] };
      poll_votes:         { Row: PollVote     & R; Insert: Omit<PollVote, 'voted_at'> & R;    Update: Partial<PollVote>    & R; Relationships: DbRel[] };
      nassau_bets:        { Row: NassauBet    & R; Insert: Omit<NassauBet, 'id'> & R;         Update: Partial<NassauBet>   & R; Relationships: DbRel[] };
      nassau_holes:       { Row: NassauHole   & R; Insert: NassauHole           & R;           Update: Partial<NassauHole>  & R; Relationships: DbRel[] };
      wolf_holes:         { Row: WolfHole     & R; Insert: WolfHole             & R;           Update: Partial<WolfHole>    & R; Relationships: DbRel[] };
      banker_holes:       { Row: BankerHole   & R; Insert: BankerHole           & R;           Update: Partial<BankerHole>  & R; Relationships: DbRel[] };
      banker_results:     { Row: BankerResult & R; Insert: BankerResult         & R;           Update: Partial<BankerResult>& R; Relationships: DbRel[] };
    };
    Views:          { [_ in never]: never };
    Functions:      { [_ in never]: never };
    Enums:          { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
