import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { getRecoveryParams } from './authRecovery';

type AuthResult = {
  error?: string;
  session?: Session | null;
  user?: User | null;
};

type PasswordRecoveryState = 'idle' | 'ready' | 'invalid';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  finishPasswordRecovery: () => Promise<AuthResult>;
  dismissPasswordRecovery: () => void;
  passwordRecoveryState: PasswordRecoveryState;
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

function getPasswordRecoveryRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return 'gemn://reset-password';
}

function clearWebRecoveryUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.history.replaceState({}, document.title, window.location.pathname);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecoveryState, setPasswordRecoveryState] = useState<PasswordRecoveryState>('idle');

  useEffect(() => {
    let mounted = true;

    async function handleNativeRecoveryUrl(url: string) {
      const params = getRecoveryParams(url);
      if (Platform.OS === 'web' || !params.isRecovery) return;

      const result = params.code
        ? await supabase.auth.exchangeCodeForSession(params.code)
        : params.accessToken && params.refreshToken
          ? await supabase.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken })
          : { data: { session: null }, error: new Error('Link de recuperação inválido.') };

      if (mounted && !result.error && result.data.session) {
        setPasswordRecoveryState('ready');
      }
    }

    async function handleWebRecoveryUrl(url: string, currentSession: Session | null) {
      const params = getRecoveryParams(url);
      if (Platform.OS !== 'web' || !params.isRecovery) return currentSession;

      let recoveredSession = currentSession;

      if (!recoveredSession && params.accessToken && params.refreshToken) {
        const result = await supabase.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });
        recoveredSession = result.data.session;
      }

      if (!recoveredSession && params.code) {
        const result = await supabase.auth.exchangeCodeForSession(params.code);
        recoveredSession = result.data.session;
      }

      // Auth JS saves the callback session before notifying PASSWORD_RECOVERY
      // on the next event-loop turn. Read storage once more before rejecting
      // a callback that is still being finalized.
      if (!recoveredSession) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = await supabase.auth.getSession();
        recoveredSession = result.data.session;
      }

      if (mounted && recoveredSession) {
        setSession(recoveredSession);
        setPasswordRecoveryState('ready');
        clearWebRecoveryUrl();
      } else if (mounted) {
        setPasswordRecoveryState('invalid');
        clearWebRecoveryUrl();
      }

      return recoveredSession;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY' && nextSession) {
        setPasswordRecoveryState('ready');
        clearWebRecoveryUrl();
      }
    });

    const initialUrlPromise = Platform.OS === 'web' ? Promise.resolve(null) : Linking.getInitialURL();
    initialUrlPromise.then((url) => {
      if (url) void handleNativeRecoveryUrl(url);
    });

    const linkingSubscription = Platform.OS === 'web'
      ? null
      : Linking.addEventListener('url', ({ url }) => { void handleNativeRecoveryUrl(url); });

    void (async () => {
      const result = await supabase.auth.getSession();
      if (!mounted) return;

      const currentSession = result.error ? null : result.data.session;
      const finalSession = Platform.OS === 'web' && typeof window !== 'undefined'
        ? await handleWebRecoveryUrl(window.location.href, currentSession)
        : currentSession;

      if (!mounted) return;
      setSession(finalSession);
      setLoading(false);
    })();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      linkingSubscription?.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    passwordRecoveryState,
    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return { error: getFriendlyAuthError(error) };
      return { session: data.session, user: data.user };
    },
    async requestPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getPasswordRecoveryRedirect(),
      });
      return error ? { error: getFriendlyAuthError(error) } : {};
    },
    async updatePassword(password) {
      if (passwordRecoveryState !== 'ready') {
        return { error: 'Este link de recuperação é inválido ou expirou.' };
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        return { error: 'Este link de recuperação é inválido ou expirou.' };
      }
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) return { error: getFriendlyAuthError(error) };
      return { user: data.user, session: sessionData.session };
    },
    async finishPasswordRecovery() {
      const { error } = await supabase.auth.signOut();
      if (error) return { error: getFriendlyAuthError(error) };
      setPasswordRecoveryState('idle');
      return {};
    },
    dismissPasswordRecovery() {
      setPasswordRecoveryState('idle');
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
  }), [loading, passwordRecoveryState, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
