// STAGE 11 — QuantowerPage. Conecta ao bridge v2, baixa trades e ingere no app-db v3
// (DataService/DataChainEngine). Fim do Risk com dado manual atrasado.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import LivePositions from '@apps/ui/LivePositions';
import { useFinance, usePlatform } from '@apps/state';
import { QuantowerAdapter, EXPECTED_BRIDGE_VERSION, normalizeBridgeUrl } from '@apps/utils/adapters/quantowerAdapter.js';
import {
  ingestQuantowerTrades,
} from '@apps/lib/db';

export default function QuantowerPage() {
  const finance = useFinance();
  // Fonte única do liga/desliga do auto-sync (mesmo botão do menu Platforms na navbar).
  const { isRunning, startSync, stopSync } = usePlatform();
  const [bridgeUrl, setBridgeUrl] = useState(() => localStorage.getItem('qt:bridgeUrl') || import.meta.env.VITE_BRIDGE_URL || 'http://127.0.0.1:8787');
  const [bridgeToken, setBridgeToken] = useState(() => localStorage.getItem('qt:bridgeToken') || import.meta.env.VITE_BRIDGE_TOKEN || '');
  const [status, setStatus] = useState(null);
  const [trades, setTrades] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [livePositions, setLivePositions] = useState([]);
  const [lastRun, setLastRun] = useState(null);
  const [autoSync, setAutoSync] = useState(() => {
    try {
      return {
        enabled: localStorage.getItem('qt:autoSync') !== '0',
        status: JSON.parse(localStorage.getItem('qt:autoSyncStatus') || 'null'),
      };
    } catch {
      return { enabled: true, status: null };
    }
  });

  // Auto-sync (BridgeAutoSync): ligado/desligado + resultado da última tentativa.
  useEffect(() => {
    const read = () => {
      try {
        setAutoSync({
          enabled: localStorage.getItem('qt:autoSync') !== '0',
          status: JSON.parse(localStorage.getItem('qt:autoSyncStatus') || 'null'),
        });
      } catch { /* noop */ }
    };
    window.addEventListener('qt:autosync:status', read);
    const t = setInterval(read, 15000);
    return () => { window.removeEventListener('qt:autosync:status', read); clearInterval(t); };
  }, []);

  // Sync Center — resumo do último run de ingestão (escrito pelo ingest).
  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const rec = await finance.ds.meta.getKey('qt:lastRun');
        if (alive) setLastRun(rec?.value ?? null);
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance, result]);

  const savePrefs = useCallback(() => {
    // Normaliza (página HTTPS: sem esquema vira https; http não-loopback vira https)
    // e reflete na UI, para o usuário ver a URL realmente usada pelo adapter.
    const norm = normalizeBridgeUrl(bridgeUrl);
    if (norm !== bridgeUrl) setBridgeUrl(norm);
    localStorage.setItem('qt:bridgeUrl', norm);
    localStorage.setItem('qt:bridgeToken', bridgeToken);
    // Token compartilhado (sync, só o usuário vê): evita recolar em cada aparelho.
    try {
      if (bridgeToken) finance?.ds?.meta.setKey('bridgeTokenShared', bridgeToken);
    } catch { /* noop */ }
  }, [bridgeUrl, bridgeToken, finance]);

  // Preenche o token no aparelho novo a partir do meta (a URL é por aparelho).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (localStorage.getItem('qt:bridgeToken')) return;
        const rec = await finance?.ds?.meta.getKey('bridgeTokenShared');
        const t = rec?.value;
        if (alive && typeof t === 'string' && t) {
          setBridgeToken(t);
          localStorage.setItem('qt:bridgeToken', t);
        }
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [finance]);

  const adapter = useCallback(() => new QuantowerAdapter({ bridgeUrl, bridgeToken }), [bridgeUrl, bridgeToken]);

  const handleCheck = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      savePrefs();
      const a = adapter();
      const s = await a.getStatus();
      setStatus(s);
      const positions = await a.getPositions().catch(() => []);
      setLivePositions(positions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bridge offline.');
    } finally {
      setBusy(false);
    }
  }, [adapter, savePrefs]);

  const handleClosePosition = useCallback(async (position) => {
    setBusy(true);
    try {
      await adapter().closePosition(position);
      const positions = await adapter().getPositions().catch(() => []);
      setLivePositions(positions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao fechar posição.');
    } finally {
      setBusy(false);
    }
  }, [adapter]);



  const handleSync = useCallback(async () => {
    if (!finance) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      savePrefs();
      const a = adapter();
      const list = await a.getAllTrades();
      setTrades(list.slice(0, 8));
      const res = await ingestQuantowerTrades(finance.ds, finance.chain, list);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao sincronizar.');
    } finally {
      setBusy(false);
    }
  }, [adapter, finance, savePrefs]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Quantower Sync</h1>
        <button className="cmd-refresh" onClick={() => window.dispatchEvent(new Event('qt:autosync'))}>Sincronizar agora</button>
      </div>
      <div className="qt-sync" aria-label="Auto-sync">
        <div className="qt-sync-title">
          <span>Auto-sync (a cada 2 min) — {isRunning ? 'ligado' : 'DESLIGADO'}</span>
          <button className={isRunning ? 'cmd-refresh' : 'cmd-refresh qt-on'} onClick={() => (isRunning ? stopSync() : startSync())}>
            {isRunning ? 'Desligar' : 'Ligar auto-sync'}
          </button>
        </div>
        {autoSync.status ? (
          <div className="qt-sync-grid">
            <span className="qt-sync-k">Última tentativa</span><span className="qt-sync-v">{new Date(autoSync.status.at).toLocaleString('pt-BR')}</span>
            {autoSync.status.ok ? (
              <>
                <span className="qt-sync-k">Trades recebidos</span><span className="qt-sync-v">{autoSync.status.fetched ?? 0}</span>
                <span className="qt-sync-k">Criados</span><span className="qt-sync-v">{autoSync.status.created ?? 0}</span>
                <span className="qt-sync-k">Atualizados</span><span className="qt-sync-v">{autoSync.status.updated ?? 0}</span>
                <span className="qt-sync-k">Ignorados</span><span className="qt-sync-v">{autoSync.status.skipped ?? 0}</span>
              </>
            ) : (
              <>
                <span className="qt-sync-k">Erro</span><span className="qt-sync-v">{autoSync.status.code || 'erro'}</span>
                <span className="qt-sync-k">Detalhe</span><span className="qt-sync-v">{autoSync.status.error}</span>
                {autoSync.status.url && <><span className="qt-sync-k">URL</span><span className="qt-sync-v">{autoSync.status.url}</span></>}
              </>
            )}
          </div>
        ) : (
          <div className="qt-hint">Ainda não rodou. Clique <b>Ligar auto-sync</b> (ou <b>Platforms → Start</b> na navbar) e depois <b>Sincronizar agora</b> para forçar um ciclo.</div>
        )}
      </div>
      {lastRun && (
        <details className="qt-adv">
          <summary>Sync Center — último run</summary>
          <div className="qt-sync" aria-label="Sync Center">
            <div className="qt-sync-grid">
              <span className="qt-sync-k">Quando</span><span className="qt-sync-v">{new Date(lastRun.at).toLocaleString('pt-BR')}</span>
              <span className="qt-sync-k">Criados</span><span className="qt-sync-v">{lastRun.created ?? 0}</span>
              <span className="qt-sync-k">Atualizados</span><span className="qt-sync-v">{lastRun.updated ?? 0}</span>
              <span className="qt-sync-k">Ignorados</span><span className="qt-sync-v">{lastRun.skipped ?? 0}</span>
            </div>
          </div>
        </details>
      )}
      <ModuleTabs module="system" />

      <div className="qt-card">
        <div className="qt-grid">
          <label className="qt-field"><span className="qt-label">Bridge URL</span>
            <input className="qt-input" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="http://127.0.0.1:8787" />
          </label>
          <label className="qt-field"><span className="qt-label">Token</span>
            <input className="qt-input" type="password" value={bridgeToken} onChange={(e) => setBridgeToken(e.target.value)} placeholder="X-Bridge-Token" />
          </label>
        </div>
        <div className="qt-actions">
          <button className="qt-btn" onClick={handleCheck} disabled={busy}>{busy ? 'Testando…' : 'Testar conexão'}</button>
          <button className="qt-btn qt-btn-primary" onClick={handleSync} disabled={busy || !finance}>Sincronizar trades</button>
        </div>
        
        {status && (status.online ? (
          <div className="qt-status" role="status">
            Bridge OK · v{status.version || status.bridgeVersion || '?'}
            {status.build ? ` · build ${status.build}` : ''}
            {status.connections?.length ? ` · ${status.connections.length} conexão(ões)` : ''}
            {status.positionsCount != null ? ` · ${status.positionsCount} posição(ões)` : ''}
          </div>
        ) : (
          <div className="qt-error" role="alert">
            {status.code === 'auth_failed'
              ? 'Token de bridge inválido ou ausente — confira o Token (Sistema → Quantower).'
              : status.code === 'bridge_stale_version'
                ? `Bridge desatualizada (v${status.version} < v${EXPECTED_BRIDGE_VERSION}) — recompile o QuantowerBridge.cs.`
                : (status.error || 'Bridge offline — verifique se a estratégia QuantowerBridge está em Run no Quantower.')}
            <div className="qt-err-code">código: {status.code || 'bridge_offline'} · url: {bridgeUrl}</div>
          </div>
        ))}
        {error && <div className="qt-error" role="alert">{error}</div>}
      </div>

      <div className="qt-card">
        <div className="qt-list-title">Posições abertas (ao vivo)</div>
        {livePositions.length === 0 ? (
          <div className="qt-hint">Nenhuma posição aberta — verifique a conexão para carregar.</div>
        ) : (
          <LivePositions positions={livePositions} onClosePosition={handleClosePosition} />
        )}
      </div>

      {result && (
        <div className="qt-result" role="status">
          <div>Criados: <b>{result.created}</b></div>
          <div>Atualizados: <b>{result.updated}</b></div>
          <div>Pulados: <b>{result.skipped}</b></div>
        </div>
      )}

      {trades.length > 0 && (
        <div className="qt-list">
          <div className="qt-list-title">Amostra (8 primeiros)</div>
          {trades.map((t) => (
            <div key={t.platformTradeId} className="qt-item">
              <span className="qt-symbol">{t.symbol}</span>
              <span className="qt-side">{t.side}</span>
              <span>net {t.netPnl}</span>
              <span className="qt-acct">{t.accountName || t.platformAccountId}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

const QT_CSS = `
.qt-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.qt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.qt-field { display: flex; flex-direction: column; gap: 4px; }
.qt-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.qt-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.qt-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.qt-btn { padding: 10px 18px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 42px; font-weight: 600; }
.qt-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; }
.qt-status { padding: 10px 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); font-size: 13px; }
.qt-error { padding: 10px 12px; border-radius: 10px; background: rgba(231,76,60,0.12); border: 1px solid rgba(231,76,60,0.3); color: var(--red, #e74c3c); font-size: 13px; }
.qt-err-code { margin-top: 4px; font-size: 10px; color: var(--muted, #a1a7b3); font-family: monospace; }
.qt-result { display: flex; gap: 18px; font-size: 13px; padding: 12px; border-radius: 10px; background: rgba(124,92,255,0.08); border: 1px solid rgba(124,92,255,0.2); }
.qt-list { display: flex; flex-direction: column; gap: 8px; }
.qt-list-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.qt-item { display: flex; gap: 14px; align-items: center; font-size: 13px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); }
.qt-symbol { font-weight: 800; }
.qt-side { text-transform: capitalize; color: var(--muted, #a1a7b3); }
.qt-acct { margin-left: auto; font-size: 12px; color: var(--muted, #a1a7b3); }
.qt-hint { font-size: 12px; color: var(--muted, #a1a7b3); }

.qt-preview { font-size: 13px; padding: 10px 12px; border-radius: 10px; background: rgba(124,92,255,0.08); border: 1px solid rgba(124,92,255,0.2); }
@media (max-width: 719px) { .qt-grid { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('qt-styles')) {
  const style = document.createElement('style');
  style.id = 'qt-styles';
  style.textContent = QT_CSS;
  document.head.appendChild(style);
}
