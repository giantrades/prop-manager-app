// UX foundation — usePwa. Instalar (beforeinstallprompt + iOS), banner offline,
// update disponível (service worker). Sem lógica financeira.

import { useCallback, useEffect, useState } from 'react';

// Guarda de módulo: recarrega UMA vez quando o novo SW assume (evita loop).
let swReloading = false;

export function usePwa() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    setIsIOS(/iphone|ipad|ipod/i.test(ua));
    setInstalled(
      (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) ||
        (typeof navigator !== 'undefined' && navigator.standalone === true),
    );
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    let regRef = null;
    if ('serviceWorker' in navigator) {
      // Auto-update: quando o novo SW assume o controle, recarrega sozinho (uma vez).
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (swReloading) return;
        swReloading = true;
        window.location.reload();
      });
      let checkTimer = null;
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        regRef = reg;
        // Procura versão nova logo na abertura (não espera o ciclo do browser).
        reg.update().catch(() => {});
        // Procura de novo ao voltar para a aba e a cada 30 min (PWA fica muito aberto).
        const check = () => reg.update().catch(() => {});
        const onVisible = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', onVisible);
        checkTimer = setInterval(check, 30 * 60 * 1000);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
        void checkTimer;
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      void regRef;
    };
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      deferred.prompt();
      try {
        await deferred.userChoice;
      } finally {
        setDeferred(null);
      }
      return 'prompted';
    }
    return 'manual';
  }, [deferred]);

  const applyUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    canInstall: !!deferred,
    install,
    isIOS,
    installed,
    online,
    updateReady,
    applyUpdate,
  };
}
