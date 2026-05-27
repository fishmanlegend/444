import React, { createContext, useContext, useEffect, useState } from 'react';
import { type Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { getProfile, upsertProfile, claimTempPlayersByPhone } from '@/lib/db';
import { type Profile } from '@/lib/database.types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithPhone: (phone: string) => Promise<{ error: string | null }>;
  verifyOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  signInWithPhone: async () => ({ error: null }),
  verifyOtp: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (s) {
        const p = await getProfile(s.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
      // Only clear the initial loading gate once — subsequent events
      // (TOKEN_REFRESHED, SIGNED_IN after OTP, etc.) must not retrigger it.
      if (event === 'INITIAL_SESSION') { clearTimeout(timeout); setLoading(false); }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function loadProfile(userId: string) {
    const p = await getProfile(userId);
    setProfile(p);
  }

  async function signInWithPhone(phone: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithOtp({
      phone: `+1${phone}`,
    });
    return { error: error?.message ?? null };
  }

  async function verifyOtp(phone: string, token: string): Promise<{ error: string | null }> {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+1${phone}`,
      token,
      type: 'sms',
    });

    if (error) return { error: error.message };

    // Ensure profile row exists (trigger may race on first login)
    if (data.user) {
      await upsertProfile({ id: data.user.id, phone });
      await Promise.all([
        loadProfile(data.user.id),
        claimTempPlayersByPhone(phone, data.user.id),
      ]);
    }

    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (session) await loadProfile(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signInWithPhone, verifyOtp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
