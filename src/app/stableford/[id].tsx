import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { getRoundWithPlayers, getHoles, getScores, getTempScores, upsertScore, upsertTempScore } from '@/lib/db';
import { EditPlayersSheet } from '@/components/EditPlayersSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; initials: string; color: string; isTempPlayer: boolean };

const DEFAULT_PARS_18 = [4, 4, 3, 4, 5, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 5, 4, 4];

const CIRCLE_SIZE = 34;
const CIRCLE_GAP  = 6;
const CIRCLE_STEP = CIRCLE_SIZE + CIRCLE_GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stablefordPts(score: number | null, par: number): number | null {
  if (score == null || score < 1) return null;
  const diff = score - par;
  if (diff >= 2) return 0;
  if (diff === 1) return 1;
  if (diff === 0) return 2;
  if (diff === -1) return 3;
  if (diff === -2) return 4;
  return 5;
}

function ptsColors(pts: number | null): { bg: string; fg: string } {
  if (pts === null) return { bg: 'transparent', fg: Colors.muted };
  if (pts >= 4) return { bg: '#1a6b1a', fg: '#fff' };
  if (pts === 3) return { bg: '#4a9e4a', fg: '#fff' };
  if (pts === 2) return { bg: Colors.creamLight, fg: Colors.text };
  if (pts === 1) return { bg: '#e8c040', fg: '#6b4800' };
  return { bg: '#c84030', fg: '#fff' };
}

// scores[holeIdx][playerIdx]
function calcTotals(scores: (number | null)[][], players: Player[], pars: number[]) {
  return players.map((_, pi) => {
    let pts = 0, gross = 0, played = 0;
    for (let h = 0; h < pars.length; h++) {
      const sc = scores[h]?.[pi] ?? null;
      const p = stablefordPts(sc, pars[h]);
      if (p !== null) { pts += p; gross += sc!; played++; }
    }
    return { pts, gross, played };
  });
}

// ─── Shared components ────────────────────────────────────────────────────────

function Pip({ player }: { player: Player }) {
  return (
    <View style={[g.pip, { backgroundColor: player.color }]}>
      <Text style={g.pipText}>{player.initials}</Text>
    </View>
  );
}

function HoleCircle({ holeNum, hasScore, isViewing, onPress }: {
  holeNum: number; hasScore: boolean; isViewing: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[
        g.circle,
        { backgroundColor: hasScore ? Colors.green : 'transparent' },
        { borderColor: hasScore ? Colors.green : Colors.border },
        isViewing && g.circleViewing,
      ]}>
        <Text style={[g.circleText, { color: hasScore ? Colors.cream : Colors.muted }]}>
          {holeNum}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function PtsBadge({ pts }: { pts: number | null }) {
  const { bg, fg } = ptsColors(pts);
  return (
    <View style={[g.ptsBadge, { backgroundColor: bg }]}>
      <Text style={[g.ptsBadgeText, { color: fg }]}>
        {pts === null ? '—' : `${pts}pt${pts !== 1 ? 's' : ''}`}
      </Text>
    </View>
  );
}

// ─── Hole card ────────────────────────────────────────────────────────────────

function HoleCard({ holeIdx, scores, players, pars, myPlayerIdx, trackOthers, onScoreChange, onToggleTrackOthers }: {
  holeIdx: number;
  scores: (number | null)[];
  players: Player[];
  pars: number[];
  myPlayerIdx: number;
  trackOthers: boolean;
  onScoreChange: (playerIdx: number, score: number | null) => void;
  onToggleTrackOthers: () => void;
}) {
  const par = pars[holeIdx] ?? 4;
  const hasOthers = players.length > 1;
  return (
    <View style={g.holeCard}>
      <View style={g.parBanner}>
        <Text style={g.parBannerPar}>Par {par}</Text>
        <Text style={g.parBannerNine}>{holeIdx < 9 ? 'Front Nine' : 'Back Nine'}</Text>
        <Text style={g.parBannerLabel}>Stableford</Text>
      </View>

      {players.map((player, pi) => {
        const score = scores[pi] ?? null;
        const pts = stablefordPts(score, par);
        const canEdit = pi === myPlayerIdx || trackOthers;
        return (
          <View key={player.id} style={g.scoreRow}>
            <Pip player={player} />
            <Text style={g.scorePlayerName}>{player.name}</Text>
            {canEdit ? (
              <View style={g.stepper}>
                <TouchableOpacity
                  style={g.stepBtn}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (score == null) return;
                    onScoreChange(pi, score <= 1 ? null : score - 1);
                  }}
                >
                  <Text style={g.stepBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[g.stepValue, score == null && g.stepValueDim]}>
                  {score ?? '—'}
                </Text>
                <TouchableOpacity
                  style={g.stepBtn}
                  activeOpacity={0.7}
                  onPress={() => onScoreChange(pi, (score ?? 0) + 1)}
                >
                  <Text style={g.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[g.stepValue, score == null && g.stepValueDim]}>{score ?? '—'}</Text>
            )}
            <PtsBadge pts={pts} />
          </View>
        );
      })}

      {hasOthers && (
        <TouchableOpacity onPress={onToggleTrackOthers} activeOpacity={0.7} style={g.trackToggle}>
          <Text style={g.trackToggleText}>
            {trackOthers ? 'Done tracking others ▾' : 'Track for others ▴'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Standings card ───────────────────────────────────────────────────────────

function StandingsCard({ scores, players, pars }: {
  scores: (number | null)[][];
  players: Player[];
  pars: number[];
}) {
  const totals = calcTotals(scores, players, pars);
  const sorted = players
    .map((p, i) => ({ p, ...totals[i] }))
    .sort((a, b) => b.pts - a.pts);

  return (
    <View style={g.scoreboardCard}>
      <Text style={g.scoreboardTitle}>Standings</Text>
      {sorted.map((row) => {
        const target = row.played > 0 ? 2 * row.played : 0;
        const vs = row.pts - target;
        return (
          <View key={row.p.id} style={g.scoreboardRow}>
            <Pip player={row.p} />
            <Text style={g.scoreboardName}>{row.p.name}</Text>
            <Text style={g.scoreboardPts}>
              {row.played > 0 ? `${row.pts} pts` : '—'}
            </Text>
            {row.played > 0 && (
              <Text style={[g.scoreboardVs, vs >= 0 ? g.vsPos : g.vsNeg]}>
                {vs >= 0 ? `+${vs}` : `${vs}`}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Playing phase ────────────────────────────────────────────────────────────

function PlayingPhase({
  scores, players, pars, myPlayerIdx, trackOthers, onToggleTrackOthers,
  viewingHole, totalHoles, onScoreChange, onNavigate, onEndRound, onBack,
}: {
  scores: (number | null)[][];
  players: Player[];
  pars: number[];
  myPlayerIdx: number;
  trackOthers: boolean;
  onToggleTrackOthers: () => void;
  viewingHole: number;
  totalHoles: number;
  onScoreChange: (holeIdx: number, playerIdx: number, score: number | null) => void;
  onNavigate: (holeIdx: number) => void;
  onEndRound: () => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const stripRef = useRef<ScrollView>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const x = Math.max(0, viewingHole * CIRCLE_STEP - 120);
    stripRef.current?.scrollTo({ x, animated: !isFirstRender.current });
    isFirstRender.current = false;
  }, [viewingHole]);

  const isLastHole = viewingHole === totalHoles - 1;

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={g.topBarBackHit}>
            <Text style={g.topBarBack}>← Back</Text>
          </TouchableOpacity>
          <Text style={g.topBarSub}>Hole {viewingHole + 1} of {totalHoles}</Text>
          <Text style={g.topBarTitle}>Stableford</Text>
          <TouchableOpacity onPress={onEndRound} activeOpacity={0.7} style={g.topBarEndHit}>
            <Text style={g.topBarEnd}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[g.playContent, { paddingBottom: insets.bottom + 72 }]}
      >
        <View style={g.stripWrap}>
          <ScrollView
            ref={stripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={g.stripContent}
          >
            {Array.from({ length: totalHoles }, (_, i) => (
              <HoleCircle
                key={i}
                holeNum={i + 1}
                hasScore={scores[i]?.some((s) => s != null) ?? false}
                isViewing={i === viewingHole}
                onPress={() => onNavigate(i)}
              />
            ))}
          </ScrollView>
        </View>

        <HoleCard
          holeIdx={viewingHole}
          scores={scores[viewingHole]}
          players={players}
          pars={pars}
          myPlayerIdx={myPlayerIdx}
          trackOthers={trackOthers}
          onToggleTrackOthers={onToggleTrackOthers}
          onScoreChange={(pi, score) => onScoreChange(viewingHole, pi, score)}
        />

        <StandingsCard scores={scores} players={players} pars={pars} />
      </ScrollView>

      <View style={[g.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={[g.navBtn, viewingHole === 0 && g.navBtnDisabled]}
          activeOpacity={viewingHole === 0 ? 1 : 0.7}
          onPress={() => viewingHole > 0 && onNavigate(viewingHole - 1)}
        >
          <Text style={[g.navBtnText, viewingHole === 0 && g.navBtnTextDisabled]}>← Prev</Text>
        </TouchableOpacity>

        <Text style={g.navCenter}>{viewingHole + 1} / {totalHoles}</Text>

        <TouchableOpacity
          style={[g.navBtn, isLastHole && g.navBtnFinish]}
          activeOpacity={0.7}
          onPress={() => {
            if (!isLastHole) onNavigate(viewingHole + 1);
            else onEndRound();
          }}
        >
          <Text style={[g.navBtnText, isLastHole && g.navBtnTextFinish]}>
            {isLastHole ? 'Finish 🏁' : 'Next →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Results phase ────────────────────────────────────────────────────────────

function ResultsPhase({
  scores, players, pars, totalHoles, onDone,
}: {
  scores: (number | null)[][];
  players: Player[];
  pars: number[];
  totalHoles: number;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const totals = calcTotals(scores, players, pars);
  const sorted = players
    .map((p, i) => ({ p, ...totals[i] }))
    .sort((a, b) => b.pts - a.pts);

  return (
    <View style={g.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <View style={g.topBar}>
          <Text style={g.topBarTitle}>Final Results</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={g.settleSubhead}>Stableford · {totalHoles} holes</Text>

        <View style={g.fieldCard}>
          {sorted.map((row, rank) => {
            const target = row.played > 0 ? 2 * row.played : 0;
            const vs = row.pts - target;
            const avg = row.played > 0 ? (row.pts / row.played).toFixed(1) : '—';
            return (
              <View
                key={row.p.id}
                style={[g.resultRow, rank < sorted.length - 1 && g.resultRowBorder]}
              >
                <Text style={g.rankNum}>#{rank + 1}</Text>
                <Pip player={row.p} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={g.resultName}>{row.p.name}</Text>
                  <Text style={g.resultDetail}>
                    {row.played > 0
                      ? `${row.played} holes · gross ${row.gross} · ${avg} pts/hole`
                      : 'No holes played'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={g.resultPts}>{row.played > 0 ? `${row.pts} pts` : '—'}</Text>
                  {row.played > 0 && (
                    <Text style={[g.resultVs, vs >= 0 ? g.vsPos : g.vsNeg]}>
                      {vs >= 0 ? `+${vs}` : `${vs}`} vs target
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={g.primaryBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={g.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function StablefordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? (__DEV__ ? '46bae3d3-2c18-450e-b267-f36b91a94a31' : null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerIdx, setMyPlayerIdx] = useState(0);
  const [trackOthers, setTrackOthers] = useState(false);
  const [pars, setPars] = useState<number[]>(DEFAULT_PARS_18);
  const [dbPars, setDbPars] = useState<number[]>([]);
  const [totalHoles, setTotalHoles] = useState(18);
  const [holeMode, setHoleMode] = useState<'9' | '18' | '36' | 'custom'>('18');
  const [customText, setCustomText] = useState('');
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<(number | null)[][]>([]);
  const [viewingHole, setViewingHole] = useState(0);
  const [phase, setPhase] = useState<'setup' | 'playing' | 'results'>('setup');
  const [hostId, setHostId] = useState('');
  const [showEditSheet, setShowEditSheet] = useState(false);

  function buildPlayerList(rawPlayers: any[]): Player[] {
    return rawPlayers
      .filter((p) => p.rsvp === 'in' || p.temp_player_id != null)
      .map((p) => {
        if (p.temp_player_id) {
          const tp = p.temp_player;
          const name = tp?.name ?? 'Guest';
          const initials = name.split(/\s+/).map((w: string) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || '?';
          return { id: tp?.id ?? p.temp_player_id, name, initials, color: '#7a7060', isTempPlayer: true };
        }
        return {
          id: p.player_id,
          name: p.profile?.name ?? 'Player',
          initials: p.profile?.initials ?? '?',
          color: p.profile?.avatar_color ?? Colors.green,
          isTempPlayer: false,
        };
      });
  }

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    Promise.all([getRoundWithPlayers(id), getHoles(id)]).then(([round, holes]) => {
      if (round) {
        const mapped = buildPlayerList(round.players as any[]);
        setPlayers(mapped);
        const idx = mapped.findIndex((p) => p.id === userId);
        setMyPlayerIdx(Math.max(0, idx));
        setHostId(round.host_id);

        const loaded = holes.length > 0
          ? holes.sort((a, b) => a.hole_number - b.hole_number).map((h) => h.par)
          : [];
        setDbPars(loaded);
      }
      setLoading(false);
    });
  }, [id]);

  async function reloadPlayers() {
    if (!id) return;
    const round = await getRoundWithPlayers(id);
    if (round) {
      const mapped = buildPlayerList(round.players as any[]);
      setPlayers(mapped);
      const idx = mapped.findIndex((p) => p.id === userId);
      setMyPlayerIdx(Math.max(0, idx));
    }
  }

  function selectHoleMode(mode: '9' | '18' | '36' | 'custom') {
    setHoleMode(mode);
    if (mode === '9') setTotalHoles(9);
    else if (mode === '18') setTotalHoles(18);
    else if (mode === '36') setTotalHoles(36);
  }

  function handleCustomChange(text: string) {
    setCustomText(text);
    const n = parseInt(text, 10);
    if (!isNaN(n) && n > 0) setTotalHoles(n);
  }

  async function startGame() {
    const holePars = dbPars.length > 0
      ? dbPars.slice(0, totalHoles)
      : totalHoles === 18 ? DEFAULT_PARS_18 : Array(totalHoles).fill(4);
    setPars(holePars);

    const initScores: (number | null)[][] = Array.from({ length: totalHoles }, () => Array(players.length).fill(null));
    if (id) {
      const [dbScores, dbTempScores] = await Promise.all([getScores(id), getTempScores(id)]);
      for (const s of dbScores) {
        const pi = players.findIndex((p) => p.id === s.player_id);
        const hi = s.hole_number - 1;
        if (pi >= 0 && hi >= 0 && hi < totalHoles) initScores[hi][pi] = s.strokes;
      }
      for (const s of dbTempScores) {
        const pi = players.findIndex((p) => p.id === s.temp_player_id);
        const hi = s.hole_number - 1;
        if (pi >= 0 && hi >= 0 && hi < totalHoles) initScores[hi][pi] = s.strokes;
      }
    }
    setScores(initScores);
    setViewingHole(0);
    setPhase('playing');
  }

  function handleScoreChange(holeIdx: number, playerIdx: number, score: number | null) {
    setScores((prev) => {
      const next = prev.map((h) => [...h]);
      next[holeIdx][playerIdx] = score;
      return next;
    });
    const player = players[playerIdx];
    if (!player) return;
    if (player.isTempPlayer) {
      upsertTempScore(id, player.id, holeIdx + 1, score);
    } else {
      upsertScore(id, player.id, holeIdx + 1, score, userId ?? undefined);
    }
  }

  if (loading) {
    return (
      <View style={[g.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={Colors.cream} />
      </View>
    );
  }

  if (phase === 'setup') {
    return (
      <>
      <View style={g.root}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
          <View style={g.topBar}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} activeOpacity={0.7} style={g.topBarBackHit}>
              <Text style={g.topBarBack}>← Back</Text>
            </TouchableOpacity>
            <Text style={g.topBarTitle}>Stableford</Text>
          </View>
        </SafeAreaView>
        <ScrollView contentContainerStyle={[g.settleContent, { paddingBottom: 40 }]}>
          <Text style={g.setupHeading}>Set up the game</Text>

          <View style={g.fieldCard}>
            <Text style={g.fieldLabel}>Holes</Text>
            <View style={su.segRow}>
              {(['9', '18', '36', 'custom'] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[su.seg, holeMode === mode && su.segActive]}
                  onPress={() => selectHoleMode(mode)}
                  activeOpacity={0.8}
                >
                  <Text style={[su.segText, holeMode === mode && su.segTextActive]}>
                    {mode === 'custom' ? 'Custom' : mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {holeMode === 'custom' && (
              <TextInput
                style={su.customInput}
                value={customText}
                onChangeText={handleCustomChange}
                keyboardType="number-pad"
                placeholder="# of holes"
                placeholderTextColor={Colors.muted}
                maxLength={3}
                autoFocus
              />
            )}
          </View>

          <View style={g.fieldCard}>
            <View style={g.cardLabelRow}>
              <Text style={g.fieldLabel}>Players</Text>
              <TouchableOpacity onPress={() => setShowEditSheet(true)} activeOpacity={0.7}>
                <Text style={g.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            {players.map((p) => (
              <View key={p.id} style={g.setupPlayerRow}>
                <Pip player={p} />
                <Text style={g.setupPlayerName}>{p.name}</Text>
                {p.isTempPlayer && <Text style={g.guestBadge}>Guest</Text>}
              </View>
            ))}
          </View>

          <View style={g.setupNote}>
            <Text style={g.setupNoteText}>
              Stableford · {totalHoles} holes · {players.length} players
            </Text>
          </View>

          <TouchableOpacity style={g.primaryBtn} onPress={startGame} activeOpacity={0.85}>
            <Text style={g.primaryBtnText}>Start</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      <EditPlayersSheet
        roundId={id ?? ''}
        hostId={hostId}
        visible={showEditSheet}
        currentUserId={userId}
        onClose={() => setShowEditSheet(false)}
        onDone={reloadPlayers}
      />
      </>
    );
  }

  if (phase === 'results') {
    return (
      <ResultsPhase
        scores={scores}
        players={players}
        pars={pars}
        totalHoles={totalHoles}
        onDone={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
      />
    );
  }

  return (
    <PlayingPhase
      scores={scores}
      players={players}
      pars={pars}
      myPlayerIdx={myPlayerIdx}
      trackOthers={trackOthers}
      onToggleTrackOthers={() => setTrackOthers((v) => !v)}
      viewingHole={viewingHole}
      totalHoles={totalHoles}
      onScoreChange={handleScoreChange}
      onNavigate={setViewingHole}
      onEndRound={() => setPhase('results')}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingVertical: 12, position: 'relative',
  },
  topBarTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.cream },
  topBarSub: {
    position: 'absolute', left: 80,
    fontFamily: Fonts.sans, fontSize: 12, color: 'rgba(216,214,175,0.6)',
  },
  topBarBack: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(216,214,175,0.6)' },
  topBarBackHit: { position: 'absolute', left: 0, paddingHorizontal: 16, paddingVertical: 12 },
  topBarEnd: { fontFamily: Fonts.sansMedium, fontSize: 13, color: 'rgba(216,214,175,0.7)' },
  topBarEndHit: { position: 'absolute', right: 0, paddingHorizontal: 16, paddingVertical: 12 },

  // Hole strip
  stripWrap: { backgroundColor: Colors.bg, paddingVertical: 12 },
  stripContent: { gap: CIRCLE_GAP, paddingHorizontal: 16 },
  circle: {
    width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  circleViewing: { borderWidth: 2.5 },
  circleText: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },

  // Layout areas
  playContent:   { backgroundColor: Colors.bg, gap: 12 },
  settleContent: { backgroundColor: Colors.bg, padding: Spacing.lg, gap: 12 },
  settleSubhead: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, marginBottom: 4 },

  // Setup phase
  setupHeading: { fontFamily: Fonts.serifMedium, fontSize: 24, color: Colors.text, marginBottom: 20, marginTop: 4 },
  fieldLabel: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.green },
  setupPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  setupPlayerName: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, flex: 1 },
  guestBadge: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.muted },
  setupNote: { paddingVertical: 10, alignItems: 'center' },
  setupNoteText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  // Pip
  pip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pipText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, color: '#fff' },

  // Hole card
  holeCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    overflow: 'hidden', marginHorizontal: 16,
  },
  parBanner: {
    backgroundColor: Colors.creamLight, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  parBannerPar:   { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.text },
  parBannerNine:  { flex: 1, fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  parBannerLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: 10, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  scoreRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 0.5, borderTopColor: Colors.border, gap: 10,
  },
  scorePlayerName: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },

  // Stepper
  stepper:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn:      { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center' },
  stepBtnText:  { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.green, lineHeight: 19 },
  stepValue:    { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, minWidth: 24, textAlign: 'center' },
  stepValueDim: { color: Colors.muted },

  trackToggle: { paddingVertical: 11, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: Colors.border },
  trackToggleText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },

  // Points badge
  ptsBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 46, alignItems: 'center' },
  ptsBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 11 },

  // Standings card
  scoreboardCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: 14, gap: 10, marginHorizontal: 16,
  },
  scoreboardTitle: {
    fontFamily: Fonts.sansSemiBold, fontSize: 11, color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  scoreboardRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreboardName: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  scoreboardPts:  { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.text },
  scoreboardVs:   { fontFamily: Fonts.sans, fontSize: 11, marginLeft: 6 },
  vsPos: { color: '#2a7a2a' },
  vsNeg: { color: '#b04030' },

  // Bottom nav
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.bg, borderTopWidth: 0.5, borderTopColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12,
  },
  navBtn:             { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Colors.creamLight, minWidth: 90, alignItems: 'center' },
  navBtnDisabled:     { opacity: 0.35 },
  navBtnFinish:       { backgroundColor: Colors.green },
  navBtnText:         { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  navBtnTextDisabled: { color: Colors.muted },
  navBtnTextFinish:   { color: Colors.cream },
  navCenter:          { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.muted },

  // Results
  fieldCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.border,
    padding: 16, gap: 12,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  resultRowBorder: {
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
    paddingBottom: 12, marginBottom: 4,
  },
  rankNum:      { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.muted, width: 24, textAlign: 'center' },
  resultName:   { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  resultDetail: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.muted },
  resultPts:    { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },
  resultVs:     { fontFamily: Fonts.sans, fontSize: 11 },

  primaryBtn:     { backgroundColor: Colors.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.cream },
});

const su = StyleSheet.create({
  segRow:      { flexDirection: 'row', gap: 8 },
  seg:         { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.creamLight, alignItems: 'center' },
  segActive:   { backgroundColor: Colors.green },
  segText:     { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.text },
  segTextActive: { color: Colors.cream },
  customInput: {
    fontFamily: Fonts.sansSemiBold, fontSize: 20, color: Colors.text,
    backgroundColor: Colors.creamLight, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, textAlign: 'center',
  },
});
