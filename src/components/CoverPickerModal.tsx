import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { PRESET_IMAGES, type ImageCategory, type PresetImage } from '@/constants/presetImages';
import { PRESET_GIFS } from '@/constants/presetGifs';
import { getPopularCoverIds, getUserCoverHistory, trackCoverPick } from '@/lib/db';

// ─── Constants ────────────────────────────────────────────────────────────────

const PICKER_TABS = ['Posters', 'GIFs', 'Photos'] as const;
type PickerTab = typeof PICKER_TABS[number];
type PickerCategory = 'All' | 'Popular' | ImageCategory;
const PICKER_CATEGORIES: PickerCategory[] = ['All', 'Popular', 'Elegant', 'Rowdy', 'Cute', 'Retro', 'Clubby'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleOnce<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function matchesQuery(img: PresetImage, terms: string[]): boolean {
  const haystack = [img.id, ...img.tags, ...img.categories].join(' ').toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

function weightedShuffle(images: PresetImage[], categoryScores: Record<string, number>): PresetImage[] {
  const maxScore = Math.max(0, ...Object.values(categoryScores));
  if (maxScore === 0) return shuffleOnce(images);
  return [...images]
    .map((img) => {
      const pref = Math.max(0, ...img.categories.map((c) => categoryScores[c] ?? 0)) / maxScore;
      return { img, sort: pref + Math.random() * 1.5 };
    })
    .sort((a, b) => b.sort - a.sort)
    .map(({ img }) => img);
}

function toCategoryScores(history: { imageId: string; count: number }[]): Record<string, number> {
  const totalPicks = history.reduce((sum, h) => sum + h.count, 0);
  if (totalPicks < 3) return {};
  const imgMap = new Map(PRESET_IMAGES.map((img) => [img.id, img]));
  const scores: Record<string, number> = {};
  for (const { imageId, count } of history) {
    const img = imgMap.get(imageId);
    if (!img) continue;
    for (const cat of img.categories) scores[cat] = (scores[cat] ?? 0) + count;
  }
  return scores;
}

// ─── GIF thumbnail ────────────────────────────────────────────────────────────

function GifThumb({ source, selected, onPress }: { source: number; selected: boolean; onPress: () => void }) {
  const player = useVideoPlayer(source, (pl) => { pl.loop = true; pl.muted = true; pl.play(); });
  return (
    <TouchableOpacity style={[p.gridItem, selected && p.gridItemSelected]} onPress={onPress} activeOpacity={0.8}>
      <VideoView player={player} style={p.gridImg} contentFit="cover" nativeControls={false} />
      {selected && (
        <View style={p.gridCheckBadge}>
          <Text style={p.gridCheckText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CoverPickerModal({
  visible,
  current,
  userId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: number;
  userId?: string;
  onSelect: (source: number, isVideo: boolean) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PickerTab>('Posters');
  const [category, setCategory] = useState<PickerCategory>('All');
  const [query, setQuery] = useState('');
  const [popularIds, setPopularIds] = useState<string[]>([]);
  const [categoryScores, setCategoryScores] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!visible) return;
    getPopularCoverIds().then(setPopularIds);
    if (userId) getUserCoverHistory(userId).then((h) => setCategoryScores(toCategoryScores(h)));
  }, [visible]);

  const sorted = useMemo(() => weightedShuffle(PRESET_IMAGES, categoryScores), [categoryScores]);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleImages = useMemo(() => {
    if (terms.length > 0) return sorted.filter((img) => matchesQuery(img, terms));
    if (category === 'Popular') {
      const idSet = new Set(popularIds);
      const ranked = popularIds.map((id) => sorted.find((img) => img.id === id)).filter((img): img is PresetImage => img != null);
      return [...ranked, ...sorted.filter((img) => !idSet.has(img.id))];
    }
    if (category === 'All') return sorted;
    return sorted.filter((img) => img.categories.includes(category as ImageCategory));
  }, [sorted, terms.join('|'), category, popularIds]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[p.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={p.header}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={p.closeBtn}>
            <Text style={p.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={p.title}>Choose a cover</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Search */}
        <View style={p.searchBar}>
          <Text style={p.searchIcon}>🔍</Text>
          <TextInput
            style={p.searchInput}
            placeholder="Search for images"
            placeholderTextColor="#b0aca0"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={p.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[p.pillsScroll, terms.length > 0 && { opacity: 0.4 }]}
          contentContainerStyle={p.pillsContent}
          pointerEvents={terms.length > 0 ? 'none' : 'auto'}
        >
          {PICKER_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setCategory(cat)}
              activeOpacity={0.7}
              style={[p.pill, category === cat && p.pillSelected]}
            >
              <Text style={[p.pillText, category === cat && p.pillTextSelected]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tabs */}
        <View style={p.tabRow}>
          <View style={p.tabs}>
            {PICKER_TABS.map((t) => (
              <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.7} style={p.tabBtn}>
                <Text style={[p.tabText, tab === t && p.tabTextActive]}>{t}</Text>
                {tab === t && <View style={p.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={p.uploadBtn} activeOpacity={0.7}>
            <Text style={p.uploadText}>↑ Upload</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
        {tab === 'Posters' && (
          <FlatList
            data={visibleImages}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={p.grid}
            columnWrapperStyle={p.gridRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[p.gridItem, current === item.source && p.gridItemSelected]}
                onPress={() => { trackCoverPick(item.id, userId); onSelect(item.source, false); onClose(); }}
                activeOpacity={0.8}
              >
                <Image source={item.source} style={p.gridImg} contentFit="cover" />
                {current === item.source && (
                  <View style={p.gridCheckBadge}>
                    <Text style={p.gridCheckText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
        )}

        {/* GIFs */}
        {tab === 'GIFs' && (
          <FlatList
            data={category === 'All' ? PRESET_GIFS : PRESET_GIFS.filter((g) => g.categories.includes(category as ImageCategory))}
            numColumns={3}
            keyExtractor={(item) => item.id}
            contentContainerStyle={p.grid}
            columnWrapperStyle={p.gridRow}
            renderItem={({ item }) => (
              <GifThumb
                source={item.source}
                selected={current === item.source}
                onPress={() => { onSelect(item.source, true); onClose(); }}
              />
            )}
          />
        )}

        {/* Photos */}
        {tab === 'Photos' && (
          <View style={p.photoShell}>
            <View style={p.photoIcon}>
              <Text style={p.photoIconText}>📷</Text>
            </View>
            <Text style={p.photoTitle}>Use your camera roll</Text>
            <Text style={p.photoSub}>Upload any photo from your library as the event cover.</Text>
            <TouchableOpacity style={p.photoBtn} activeOpacity={0.8}>
              <Text style={p.photoBtnText}>Allow access to photos</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const p = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 15, color: Colors.text },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.creamLight, borderRadius: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: Colors.text, padding: 0 },
  searchClear: { fontSize: 12, color: Colors.muted, paddingHorizontal: 2 },

  pillsScroll: { flexGrow: 0, flexShrink: 0, marginBottom: 10 },
  pillsContent: { gap: 8, paddingHorizontal: 16 },
  pill: { borderRadius: 20, backgroundColor: Colors.creamLight, paddingHorizontal: 14, paddingVertical: 7 },
  pillSelected: { backgroundColor: Colors.green },
  pillText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.text },
  pillTextSelected: { color: Colors.cream },

  tabRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.border, marginBottom: 2,
  },
  tabs: { flexDirection: 'row', gap: 20 },
  tabBtn: { paddingVertical: 12, position: 'relative' },
  tabText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.muted },
  tabTextActive: { fontFamily: Fonts.sansSemiBold, color: Colors.text },
  tabUnderline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, backgroundColor: Colors.text, borderRadius: 1 },
  uploadBtn: { borderWidth: 1, borderColor: Colors.green, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  uploadText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.green },

  grid: { padding: 2 },
  gridRow: { gap: 2 },
  gridItem: { flex: 1, aspectRatio: 1, borderRadius: 4, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  gridItemSelected: { borderColor: Colors.green },
  gridImg: { width: '100%', height: '100%' },
  gridCheckBadge: {
    position: 'absolute', bottom: 6, right: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.green, alignItems: 'center', justifyContent: 'center',
  },
  gridCheckText: { fontSize: 12, color: Colors.cream },

  photoShell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  photoIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.creamLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  photoIconText: { fontSize: 32 },
  photoTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, color: Colors.text, textAlign: 'center' },
  photoSub: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 19 },
  photoBtn: { marginTop: 8, backgroundColor: Colors.green, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 24 },
  photoBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.cream },
});
