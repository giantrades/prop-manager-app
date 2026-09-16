// useWakeLock — mantém a tela ligada (Screen Wake Lock API) para o streaming de
// posições continuar vivo no celular enquanto você acompanha. Reativa ao voltar
// para a aba. Indisponível (iOS antigo/desktop sem suporte) => no-op honesto.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [active, setActive] = useState(false);
  const sentinelRef = useRef(null);

  const acquire = useCallback(async () => {
    if (!supported) return false;
    try {
      const s = await navigator.wakeLock.request('screen');
      sentinelRef.current = s;
      s.addEventListener?.('release', () => setActive(false));
      setActive(true);
      return true;
    } catch {
      setActive(false);
      return false;
    }
  }, [supported]);

  const release = useCallback(async () => {
    try { await sentinelRef.current?.release?.(); } catch { /* noop */ }
    sentinelRef.current = null;
    setActive(false);
  }, []);

  // Ao voltar para a aba visível, reativa (o SO solta o lock ao esconder).
  useEffect(() => {
    if (!active) return undefined;
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [active, acquire]);

  useEffect(() => () => { try { sentinelRef.current?.release?.(); } catch { /* noop */ } }, []);

  return { supported, active, toggle: () => (active ? release() : acquire()) };
}
