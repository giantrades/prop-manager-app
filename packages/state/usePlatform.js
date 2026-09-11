// usePlatform() — status da ponte Quantower + controle do auto-sync (app-db v3).
// Lê/escreve SÓ via bridge HTTP + localStorage (prefs). Nada de storage legado.
// O auto-sync de verdade vive em `main-app/src/BridgeAutoSync.jsx`, que ingere no
// DataService/DataChainEngine; aqui só o interruptor (`qt:autoSync`) + status p/ Navbar.
//
// API compatível com a Navbar: { statuses, livePositions, isRunning, startSync,
// stopSync, lastSync, liveCount, refreshStatuses }.

import { useState, useEffect, useCallback } from 'react';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';

const AUTO_KEY = 'qt:autoSync';
const URL_KEY = 'qt:bridgeUrl';
const TOKEN_KEY = 'qt:bridgeToken';
const LAST_SYNC_KEY = 'qt:lastSync';

export function bridgePrefs() {
  return {
    bridgeUrl:
      localStorage.getItem(URL_KEY) || import.meta.env.VITE_BRIDGE_URL || 'http://127.0.0.1:8787',
    bridgeToken: localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_BRIDGE_TOKEN || '',
    auto: localStorage.getItem(AUTO_KEY) !== '0',
  };
}

export function usePlatform() {
  const [statuses, setStatuses] = useState([]);
  const [livePositions, setLivePositions] = useState([]);
  const [isRunning, setIsRunning] = useState(() => bridgePrefs().auto);
  const [lastSync, setLastSync] = useState(() => localStorage.getItem(LAST_SYNC_KEY));
  const [liveCount, setLiveCount] = useState(0);

  const refreshStatuses = useCallback(async () => {
    const { bridgeUrl, bridgeToken } = bridgePrefs();
    try {
      const a = new QuantowerAdapter({ bridgeUrl, bridgeToken });
      const [s, positions] = await Promise.all([
        a.getStatus().catch(() => null),
        a.getPositions().catch(() => []),
      ]);
      if (!s) throw new Error('bridge offline');
      setStatuses([
        {
          platformId: 'quantower',
          online: true,
          connections: [],
          positionsCount: positions.length,
          ...(s || {}),
        },
      ]);
      setLivePositions(positions);
      setLiveCount(positions.length);
    } catch {
      setStatuses([{ platformId: 'quantower', online: false, connections: [], positionsCount: 0 }]);
    }
    setLastSync(localStorage.getItem(LAST_SYNC_KEY));
  }, []);

  useEffect(() => {
    refreshStatuses();
    const t = setInterval(refreshStatuses, 60000);
    return () => clearInterval(t);
  }, [refreshStatuses]);

  const startSync = useCallback(() => {
    localStorage.setItem(AUTO_KEY, '1');
    setIsRunning(true);
    window.dispatchEvent(new CustomEvent('qt:autosync'));
    refreshStatuses();
  }, [refreshStatuses]);

  const stopSync = useCallback(() => {
    localStorage.setItem(AUTO_KEY, '0');
    setIsRunning(false);
  }, []);

  return { statuses, livePositions, isRunning, startSync, stopSync, lastSync, liveCount, refreshStatuses };
}
