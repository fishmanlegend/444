import { useRouter } from 'expo-router';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import React, { useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { locationStore } from '@/lib/locationStore';

const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '';

export default function LocationSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');

  function select(value: string) {
    if (!value.trim()) return;
    locationStore.set(value.trim());
    router.back();
  }

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>Location</Text>
          <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <GooglePlacesAutocomplete
        placeholder="Course name, address, or anything"
        textInputProps={{
          autoFocus: true,
          returnKeyType: 'done',
          onChangeText: setDraft,
          onSubmitEditing: () => select(draft),
          placeholderTextColor: Colors.muted,
        }}
        fetchDetails={false}
        enablePoweredByContainer={false}
        minLength={2}
        debounce={300}
        onPress={(data) => {
          select(data.structured_formatting?.main_text ?? data.description);
        }}
        onFail={(e) => { if (__DEV__) console.log('Places error:', e); }}
        query={{ key: GOOGLE_PLACES_KEY, language: 'en' }}
        styles={{
          container: { flex: 1 },
          textInputContainer: s.inputContainer,
          textInput: s.input,
          listView: s.list,
          row: s.row,
          description: s.rowText,
          separator: s.rowSep,
          poweredContainer: { display: 'none' },
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.card },
  safe: { backgroundColor: Colors.card },

  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  title: { fontFamily: Fonts.sansMedium, fontSize: 15, color: Colors.text },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.creamLight,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.muted },

  inputContainer: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  input: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.creamLight,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 44,
  },

  list: { backgroundColor: Colors.card },
  row: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: Colors.card },
  rowText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.text },
  rowSep: { height: 0.5, backgroundColor: Colors.border, marginHorizontal: 16 },
});
