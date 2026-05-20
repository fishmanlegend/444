import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth';
import { Colors, Fonts } from '@/constants/theme';

const CODE_LENGTH = 6;

export default function VerifyScreen() {
  const router = useRouter();
  const { verifyOtp, signInWithPhone } = useAuth();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputs = useRef<Array<TextInput | null>>([]);

  const formatted = phone
    ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    : '';

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    if (digit && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    // Auto-submit when all digits filled
    if (digit && index === CODE_LENGTH - 1) {
      const full = [...next].join('');
      if (full.length === CODE_LENGTH) handleVerify(full);
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      const next = [...code];
      next[index - 1] = '';
      setCode(next);
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (fullCode?: string) => {
    const token = fullCode ?? code.join('');
    if (token.length < CODE_LENGTH || loading) return;
    setLoading(true);
    setErrorMsg(null);
    const { error } = await verifyOtp(phone ?? '', token);
    setLoading(false);
    if (error) { setErrorMsg(error); return; }
    router.replace('/');
  };

  const handleResend = async () => {
    if (!phone) return;
    await signInWithPhone(phone);
  };

  const isComplete = code.every((d) => d !== '');

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.top}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <Text style={s.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={s.heading}>We texted you</Text>
          <Text style={s.sub}>Enter the 6-digit code sent to {formatted}</Text>
        </View>

        {/* OTP boxes */}
        <View style={s.codeRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              style={[s.box, digit ? s.boxFilled : null]}
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              onKeyPress={(e) => handleKeyPress(e, i)}
              keyboardType="number-pad"
              maxLength={2}
              textAlign="center"
              autoFocus={i === 0}
              caretHidden
              selectTextOnFocus
            />
          ))}
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, (!isComplete || loading) && s.btnDisabled]}
            activeOpacity={isComplete ? 0.8 : 1}
            onPress={() => handleVerify()}
          >
            {loading
              ? <ActivityIndicator color={Colors.green} />
              : <Text style={s.btnText}>Verify →</Text>
            }
          </TouchableOpacity>

          {errorMsg && <Text style={s.error}>{errorMsg}</Text>}

          <TouchableOpacity activeOpacity={0.7} onPress={handleResend}>
            <Text style={s.resend}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.green },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 40,
  },

  top: { gap: 12 },
  back: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.5)',
    marginBottom: 8,
  },
  heading: {
    fontFamily: Fonts.serifMedium,
    fontSize: 36,
    color: Colors.cream,
    lineHeight: 42,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: 'rgba(216,214,175,0.55)',
    lineHeight: 20,
  },

  // OTP boxes
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  box: {
    width: 46,
    height: 58,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(216,214,175,0.15)',
    fontFamily: Fonts.serifMedium,
    fontSize: 28,
    color: Colors.cream,
  },
  boxFilled: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(216,214,175,0.4)',
  },

  actions: { gap: 12 },
  btn: {
    backgroundColor: Colors.cream,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.35 },
  btnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    color: Colors.green,
  },
  resend: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: 'rgba(216,214,175,0.4)',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  error: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: '#ff6b6b',
    textAlign: 'center',
  },
});
