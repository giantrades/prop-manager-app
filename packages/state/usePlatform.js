// usePlatform() — status da ponte Quantower + auto-sync (app-db v3) + STREAM (SSE).
// HTTP via bridge; SSE (`/stream`) empurra posições/ordens ~1.5s enquanto conectado.
// Prefs em localStorage. Ingestão de verdade vive em `main-app/src/BridgeAutoSync.jsx`.
//
// API: { statuses, livePositions, isRunning, startSync, stopSync, lastSync, liveCount,
//        refreshStatuses, streaming }.

import { useState, useEffect, useCallback, useRef } from 'react';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { useFinance } from './FinanceContext';

const AUTO_KEY = 'qt:autoSync';
const URL_KEY = 'qt:bridgeUrl';
const TOKEN_KEY = 'qt:bridgeToken';
const LAST_SYNC_KEY = 'qt:lastSync';
// Última leitura de posições (fallback offline/remoto): local + meta sincronizado.
const SNAP_KEY = 'qt:lastPositions';
const SNAP_META_KEY = 'lastPositions';
const SNAP_META_THROTTLE_MS = 5 * 60 * 1000;

function readLocalSnap() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.positions) ? v : null;
  } catch {
    return null;
  }
}

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
  // Timestamp da última leitura de posições (stream ou polling) — a UI mostra a idade.
  const [positionsAt, setPositionsAt] = useState(null);
  const [lastSnapshot, setLastSnapshot] = useState(() => readLocalSnap());
  const adapterRef = useRef(null);
  const streamRef = useRef(null);
  const finance = useFinance();
  const financeRef = useRef(finance);
  financeRef.current = finance;
  const snapMetaAtRef = useRef(0);
  if (!adapterRef.current) adapterRef.current = makeAdapter();

  // Persiste a última leitura boa: localStorage (device) + meta (sincroniza p/ o celular).
  const persistSnapshot = useCallback((positions) => {
    if (!Array.isArray(positions) || positions.length === 0) return;
    const snap = { at: new Date().toISOString(), positions };
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(snap)); } catch { /* noop */ }
    setLastSnapshot(snap);
    const now = Date.now();
    const f = financeRef.current;
    if (f?.ds && now - snapMetaAtRef.current > SNAP_META_THROTTLE_MS) {
      snapMetaAtRef.current = now;
      try { f.ds.meta.setKey(SNAP_META_KEY, snap).catch(() => {}); } catch { /* noop */ }
    }
  }, []);

  // Sem snapshot local (ex.: celular novo), hidrata do meta sincronizado.
  useEffect(() => {
    if (lastSnapshot) return undefined;
    let alive = true;
    (async () => {
      const f = financeRef.current;
      if (!f?.ds) return;
      try {
        const rec = await f.ds.meta.getKey(SNAP_META_KEY);
        const v = rec?.value;
        if (alive && v && Array.isArray(v.positions)) setLastSnapshot(v);
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [finance, lastSnapshot]);

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
      setPositionsAt(Date.now());
      persistSnapshot(positions);
    } catch {
      setStatuses([{ platformId: 'quantower', online: false, connections: [], positionsCount: 0 }]);
    }
    setLastSync(localStorage.getItem(LAST_SYNC_KEY));
  }, [persistSnapshot]);

  // SSE: em página https exige URL https — EXCETO loopback (127.0.0.1/localhost), que o
  // navegador trata como contexto seguro. Antes o stream era descartado no PC (app em
  // https + bridge em http://127.0.0.1) e as posições só atualizavam no polling de 60s.
  const openStream = useCallback(() => {
    const base = adapterRef.current.getBridgeBase();
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    if (typeof EventSource === 'undefined' || !base) return;
    const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(base);
    if (secure && !base.startsWith('https://') && !isLoopback) return;
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
          setPositionsAt(Date.now());
          persistSnapshot(d.positions);
        }
        window.dispatchEvent(new CustomEvent('qt:stream', { detail: d }));
      } catch { /* payload inválido */ }
    };
    es.onerror = () => setStreaming(false); // EventSource reconecta sozinho
    streamRef.current = es;
  }, [persistSnapshot]);

  const closeStream = useCallback(() => {
    try { streamRef.current?.close(); } catch { /* noop */ }
    streamRef.current = null;
    setStreaming(false);
  }, []);

  // Ref do streaming para o polling rápido não reiniciar o interval a cada mudança.
  const streamingRef = useRef(false);
  streamingRef.current = streaming;

  useEffect(() => {
    refreshStatuses();
    const t = setInterval(refreshStatuses, 60000);
    return () => clearInterval(t);
  }, [refreshStatuses]);

  // Polling RÁPIDO das posições enquanto o stream não estiver ativo (e a aba visível):
  // sem isso, uma página https + bridge http ficava só no ciclo de 60s ("demora demais").
  useEffect(() => {
    const FALLBACK_MS = 4000;
    const t = setInterval(() => {
      if (streamingRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      adapterRef.current?.getPositions()
        .then((positions) => {
          setLivePositions(positions);
          setLiveCount(positions.length);
          setPositionsAt(Date.now());
          persistSnapshot(positions);
        })
        .catch(() => { /* bridge fora: o status já cobre */ });
    }, FALLBACK_MS);
    return () => clearInterval(t);
  }, [persistSnapshot]);

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
    refreshStatuses, streaming, lastSnapshot, positionsAt,
  };
}
