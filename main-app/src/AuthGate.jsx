// STAGE 7 — AuthGate. Portão de autenticação via Supabase Auth. Se não houver sessão,
// mostra o LoginScreen; se houver, renderiza o app (o sync no FinanceProvider passa a
// funcionar, pois `getUserId()` retorna o usuário).

import React, { useCallback, useEffect, useState } from 'react';
import LoginScreen from '@apps/ui/LoginScreen';
import { supabase } from '@apps/supabase/client';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined); // undefined = ainda checando
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (mounted) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao entrar.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMagicLink = useCallback(async (email) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar link.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  }, []);

  if (user === undefined) {
    return <div className="auth-loading" role="status">Carregando…</div>;
  }
  if (!user) {
    return (
      <LoginScreen
        user={null}
        onLogin={handleLogin}
        onMagicLink={handleMagicLink}
        loading={loading}
        error={error}
      />
    );
  }
  // Logout vive em Configurações (não mais flutuando em todas as páginas).
  return children;
}

const AUTH_CSS = `
.auth-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: var(--muted, #a1a7b3); }
`;
if (typeof document !== 'undefined' && !document.getElementById('auth-gate-styles')) {
  const style = document.createElement('style');
  style.id = 'auth-gate-styles';
  style.textContent = AUTH_CSS;
  document.head.appendChild(style);
}
