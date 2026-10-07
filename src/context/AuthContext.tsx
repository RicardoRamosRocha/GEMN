import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

type AuthResult = {
  error?: string;
  session?: Session | null;
  user?: User | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (params: {
    email: string;
    password: string;
    nomeCompleto: string;
    telefone: string;
  }) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getFriendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('failed to fetch')
  ) {
    return 'Não foi possível conectar ao GEMN. Verifique sua internet e tente novamente.';
  }

  if (message.includes('already registered') || message.includes('user already exists')) {
    return 'Este e-mail já está cadastrado. Tente entrar ou use outro e-mail.';
  }

  if (message.includes('invalid login credentials') || message.includes('invalid password')) {
    return 'E-mail ou senha inválidos.';
  }

  if (message.includes('email') && (message.includes('invalid') || message.includes('valid'))) {
    return 'Informe um e-mail válido.';
  }

  if (message.includes('password') && (message.includes('short') || message.includes('6 characters'))) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }

  return 'Não foi possível concluir essa ação. Tente novamente.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setSession(null);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return { error: getFriendlyAuthError(error) };
      return { session: data.session, user: data.user };
    },
    async signUp({ email, password, nomeCompleto, telefone }) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            nome_completo: nomeCompleto.trim(),
            telefone: telefone.trim(),
          },
        },
      });

      if (error) return { error: getFriendlyAuthError(error) };
      return { session: data.session, user: data.user };
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      return error ? { error: getFriendlyAuthError(error) } : {};
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
