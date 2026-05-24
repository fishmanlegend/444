import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TopBar } from '@/components/TopBar';
import { Colors, Fonts } from '@/constants/theme';
import { pollStore } from '@/lib/pollStore';

function nextSaturdays(n: number): string[] {
  const result: string[] = [];
  const d = new Date();
  const daysUntil = d.getDay() === 6 ? 7 : (6 - d.getDay());
  d.setDate(d.getDate() + daysUntil);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    result.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    d.setDate(d.getDate() + 7);
  }
  return result;
}

export default function PollSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const existing = pollStore.getOptions();
  const [options, setOptions] = useState<string[]>(
    existing.length >= 2 ? existing : nextSaturdays(3)
  );

  function update(i: number, val: string) {
    const next = [...options];
    next[i] = val;
    setOptions(next);
  }

  function remove(i: number) {
    setOptions(options.filter((_, j) => j !== i));
  }

  function handleDone() {
    const filled = options.filter((o) => o.trim().length > 0);
    pollStore.set(filled.length >= 2 ? filled : nextSaturdays(3), true);
    router.back();
  }

  function handleCancel() {
    router.back();
  }

  const canDone = options.filter((o) => o.trim()).length >= 2;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: Colors.green }}>
        <TopBar
          left={
            <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
              <Text style={s.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
          }
          right={
            <TouchableOpacity onPress={handleDone} activeOpacity={0.7} disabled={!canDone}>
              <Text style={[s.doneBtn, !canDone && s.doneBtnDim]}>Done</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Poll your pals ⛳</Text>
          <Text style={s.sub}>
            Add options — guests pick what works. Lock in and tee off when you're ready.
          </Text>
        </View>

        {/* Options */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Date options</Text>
          <Text style={s.sectionHint}>Need at least 2 · tap to edit · free text</Text>

          <View style={s.optionList}>
            {options.map((opt, i) => (
              <View key={i} style={s.optionRow}>
                <View style={s.optionNumber}>
                  <Text style={s.optionNumberText}>{i + 1}</Text>
                </View>
                <TextInput
                  style={s.optionInput}
                  value={opt}
                  onChangeText={(v) => update(i, v)}
                  placeholder="e.g. Sat Jun 7, morning"
                  placeholderTextColor={Colors.muted}
                  returnKeyType="done"
                  selectTextOnFocus
                />
                {options.length > 2 && (
                  <TouchableOpacity
                    onPress={() => remove(i)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={s.removeBtn}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          {options.length < 6 && (
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => setOptions([...options, ''])}
              activeOpacity={0.7}
            >
              <Text style={s.addBtnText}>+ Add another option</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },

  cancelBtn: { fontFamily: Fonts.sans, fontSize: 14, color: 'rgba(216,214,175,0.6)' },
  doneBtn: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.cream },
  doneBtnDim: { opacity: 0.4 },

  scroll: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  title: {
    fontFamily: Fonts.serifMedium,
    fontSize: 26,
    color: Colors.text,
    marginBottom: 8,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Colors.muted,
    lineHeight: 20,
  },

  section: { paddingHorizontal: 20 },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  sectionHint: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 16,
  },

  optionList: { gap: 10 },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  optionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.creamLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionNumberText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: Colors.muted,
  },
  optionInput: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 0,
  },
  removeBtn: { fontSize: 13, color: Colors.muted },

  addBtn: {
    marginTop: 10,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnText: { fontFamily: Fonts.sansMedium, fontSize: 14, color: Colors.green },
});
