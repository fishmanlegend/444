import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { useAuth } from '@/context/auth';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import { Wordmark } from '@/components/Wordmark';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function PhoneScreen() {
  const router = useRouter();
  const { signInWithPhone } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length === 10;

  const handleChange = (text: string) => { setErrorMsg(null); setPhone(formatPhone(text)); };

  const handleSend = async () => {
    if (!isValid || loading) return;
    setLoading(true);
    const { error } = await signInWithPhone(digits);
    setLoading(false);
    if (error) { setErrorMsg(error); return; }
    router.push({ pathname: '/auth/verify', params: { phone: digits } });
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Wordmark + tagline */}
        <View style={s.top}>
          <Wordmark size={72} />
          <Text style={s.tagline}>golf with your people</Text>
        </View>

        {/* Phone input */}
        <View style={s.inputSection}>
          <Text style={s.label}>Your phone number</Text>
          <View style={s.inputRow}>
            <View style={s.countryCode}>
              <Text style={s.countryCodeText}>🇺🇸 +1</Text>
            </View>
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={handleChange}
              placeholder="(555) 555-5555"
              placeholderTextColor="rgba(216,214,175,0.3)"
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={handleSend}
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[s.btn, (!isValid || loading) && s.btnDisabled]}
            activeOpacity={isValid ? 0.8 : 1}
            onPress={handleSend}
          >
            {loading
              ? <ActivityIndicator color={Colors.green} />
              : <Text style={s.btnText}>Send code →</Text>
            }
          </TouchableOpacity>

          {errorMsg && <Text style={s.error}>{errorMsg}</Text>}

          <Text style={s.disclaimer}>
            We'll send you a one-time code. No password ever.
          </Text>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          By continuing you agree to our Terms & Privacy Policy.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingBottom: 16,
  },

  top: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingBottom: 40,
  },
  tagline: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    color: 'rgba(216,214,175,0.55)',
    letterSpacing: 0.3,
  },

  inputSection: { gap: 12 },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: 'rgba(216,214,175,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(216,214,175,0.15)',
    paddingHorizontal: 14,
    height: 54,
    gap: 10,
  },
  countryCode: {
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(216,214,175,0.15)',
  },
  countryCodeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    color: Colors.cream,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 18,
    color: Colors.cream,
    letterSpacing: 0.5,
  },

  btn: {
    backgroundColor: Colors.cream,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: Colors.green,
  },

  disclaimer: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: 'rgba(216,214,175,0.35)',
    textAlign: 'center',
    marginTop: 4,
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: '#ff6b6b',
    textAlign: 'center',
  },

  footer: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: 'rgba(216,214,175,0.25)',
    textAlign: 'center',
    marginTop: 16,
  },
});
