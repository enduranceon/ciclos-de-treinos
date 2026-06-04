import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(undefined); // undefined = loading; null = no profile

  // Carrega o profile (role + dados) do usuário logado.
  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, avatar_url, birth_date, sex, height_cm, weight_kg')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('[AuthContext] loadProfile error:', error);
      setProfile(null);
      return;
    }
    setProfile(data || null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user?.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadProfile(s?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email, password, metadata = {}) {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (session?.user?.id) await loadProfile(session.user.id);
  }

  return (
    <AuthContext.Provider value={{ session, profile, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
