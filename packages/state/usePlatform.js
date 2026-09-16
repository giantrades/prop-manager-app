// usePlatform() — status da ponte Quantower + auto-sync (app-db v3) + STREAM (SSE).
// HTTP via bridge; SSE (`/stream`) empurra posições/ordens ~1.5s enquanto conectado.
// Prefs em localStorage. Ingestão de verdade vive em `main-app/src/BridgeAutoSync.jsx`.
//
// API: { statuses, livePositions, isRunning, startSync, stopSync, lastSync, liveCount,
//        refreshStatuses, streaming }.

import { useState, useEffect, useCallback, useRef } from 'react';
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

function makeAdapter() {
  const { bridgeUrl, bridgeToken } = bridgePrefs();
  return new QuantowerAdapter({ bridgeUrl, bridgeToken });
}

export function usePlatform() {
  const [statuses, setStatuses] = useState([]);
  const [livePositions, setLivePositions] = useState([]);
  const [isRunning, setIsRunning] = useState(() => bridgePrefs().auto);
  const [lastSync, setLastSync] = useState(() => localStorage.getItem(LAST_SYNC_KEY));
  const [liveCount, setLiveCount] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const adapterRef = useRef(null);
  const streamRef = useRef(null);
  if (!adapterRef.current) adapterRef.current = makeAdapter();

  const refreshStatuses = useCallback(async () => {
    const a = adapterRef.current;
    try {
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

  // SSE: só em página segura quando a URL também é https (evita mixed content).
  const openStream = useCallback(() => {
    const base = adapterRef.current.getBridgeBase();
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (typeof EventSource === 'undefined' || !base) return;
    if (secure && !base.startsWith('https://')) return;
    try { streamRef.current?.close(); } catch { /* noop */ }
    const { bridgeToken } = bridgePrefs();
    const url = `${base.replace(/\/$/, '')}/stream?token=${encodeURIComponent(bridgeToken)}`;
    let es;
    try { es = new EventSource(url); } catch { return; }
    es.onopen = () => setStreaming(true);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (Array.isArray(d.positions)) {
          setLivePositions(d.positions);
          setLiveCount(d.positions.length);
        }
        window.dispatchEvent(new CustomEvent('qt:stream', { detail: d }));
      } catch { /* payload inválido */ }
    };
    es.onerror = () => setStreaming(false); // EventSource reconecta sozinho
    streamRef.current = es;
  }, []);

  const closeStream = useCallback(() => {
    try { streamRef.current?.close(); } catch { /* noop */ }
    streamRef.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => {
    refreshStatuses();
    const t = setInterval(refreshStatuses, 60000);
    return () => clearInterval(t);
  }, [refreshStatuses]);

  const online = statuses.some((s) => s.online);
  useEffect(() => {
    if (online) openStream();
    else closeStream();
    return () => { /* mantém aberto entre renders; fecha no unmount abaixo */ };
  }, [online, openStream, closeStream]);

  useEffect(() => () => closeStream(), [closeStream]);

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

  return {
    statuses, livePositions, isRunning, startSync, stopSync, lastSync, liveCount,
    refreshStatuses, streaming,
  };
}
