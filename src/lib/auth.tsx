import type { Session } from '@supabase/supabase-js';
import { router, usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/**
 * Ações que exigem conta (publicar, salvar, denunciar, reivindicar) levam para o login
 * e voltam para onde a pessoa estava (RF-02).
 */
export function useRequireAuth() {
  const { session } = useAuth();
  const pathname = usePathname();
  return useCallback(
    (motivo?: string) => {
      if (session) return true;
      router.push({ pathname: '/entrar', params: { motivo: motivo ?? '', voltar: pathname } });
      return false;
    },
    [session, pathname],
  );
}
