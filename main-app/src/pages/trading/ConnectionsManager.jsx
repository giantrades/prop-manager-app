// Conexões de plataforma — cards por conexão (glass) com status e contagem de contas,
// + painel para ASSOCIAR/Criar contas do app a partir das contas da ponte (Quantower).
// A associação usa `Account.platformAccountId` (mesmo campo do adapter). Nada de saldo aqui.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform, useFinance, bridgePrefs } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { listFirms, getDemoIds, isDemoDisabled, listConnectionFirms, setConnectionFirm, ingestQuantowerTrades } from '@apps/lib/db';
import { Landmark, Plus, Link2, Unlink, Wand2, RefreshCw, EyeOff, RotateCcw } from 'lucide-react';

// Cache local (device) das contas/conexões da ponte — mostra offline com "última leitura".
const BRIDGE_CACHE_KEY = 'qt:bridgeAccountsCache';
// Ocultos (não aparecem mais): conexões e contas da ponte, por id.
const HIDDEN_CONNS_KEY = 'bridge:hiddenConnections';
const HIDDEN_ACCTS_KEY = 'bridge:hiddenAccounts';

function readBridgeCache() {
  try {
    const raw = localStorage.getItem(BRIDGE_CACHE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.accounts) ? v : null;
  } catch {
    return null;
  }
}
function writeBridgeCache(accounts) {
  try {
    localStorage.setItem(BRIDGE_CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), accounts }));
  } catch {
    /* noop */
  }
}

const KIND_OPTIONS = [
  { v: 'prop', label: 'Prop' },
  { v: 'bank', label: 'Banco' },
  { v: 'wallet', label: 'Cripto/Carteira' },
  { v: 'investment', label: 'Investimento' },
  { v: 'cash', label: 'Dinheiro' },
];

// Demo (VITE_DEMO_MODE=1): estrutura de conexões p/ ver a UI sem o Quantower aberto.
// Só aparece ENQUANTO o usuário não tiver conta própria (aí o modo demo se desliga).
const DEMO_CAPABLE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === '1';
const DEMO_CONNECTIONS = [
  { id: 'conn-e8', name: 'E8-Live' },
  { id: 'conn-ftmo', name: 'FTMO-Live' },
];
const DEMO_BRIDGE = [
  { platformAccountId: 'qt_demo_1', name: 'E8 100k', currency: 'USD', balance: 102340, connectionId: 'conn-e8', connectionName: 'E8-Live' },
  { platformAccountId: 'qt_demo_2', name: 'FTMO 50k', currency: 'USD', balance: 51220, connectionId: 'conn-ftmo', connectionName: 'FTMO-Live' },
  { platformAccountId: 'qt_demo_3', name: 'FTMO 50k B', currency: 'USD', balance: 49800, connectionId: 'conn-ftmo', connectionName: 'FTMO-Live' },
];

export default function ConnectionsManager() {
  const { statuses, refreshStatuses } = usePlatform();
  const finance = useFinance();
  const { toast } = useToast();
  const [bridgeAccounts, setBridgeAccounts] = useState([]);
  const [appAccounts, setAppAccounts] = useState([]);
  const [firms, setFirms] = useState([]);
  const [connFirmById, setConnFirmById] = useState({});
  const [demoAccountIds, setDemoAccountIds] = useState(new Set());
  const [demoDisabled, setDemoDisabled] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [hiddenConns, setHiddenConns] = useState([]);
  const [hiddenAccts, setHiddenAccts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newKind, setNewKind] = useState('prop');
  const adapterRef = useRef(null);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  if (!adapterRef.current) {
    const { bridgeUrl, bridgeToken } = bridgePrefs();
    adapterRef.current = new QuantowerAdapter({ bridgeUrl, bridgeToken });
  }

  const load = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    setBusy(true);
    try {
      const [accts, app, firmList, ids, disabled, connFirms, hConns, hAccts] = await Promise.all([
        adapterRef.current.getAccounts().catch(() => []),
        f.ds.accounts.list(),
        listFirms(f.ds),
        getDemoIds(f.ds),
        isDemoDisabled(f.ds),
        listConnectionFirms(f.ds),
        f.ds.meta.getKey(HIDDEN_CONNS_KEY),
        f.ds.meta.getKey(HIDDEN_ACCTS_KEY),
      ]);
      // Ao vivo? cacheia. Senão, mostra a última leitura (bridge offline).
      if (Array.isArray(accts) && accts.length > 0) {
        setBridgeAccounts(accts);
        writeBridgeCache(accts);
        setCachedAt(null);
      } else {
        const cached = readBridgeCache();
        setBridgeAccounts(cached?.accounts ?? []);
        setCachedAt(cached?.at ?? null);
      }
      setAppAccounts(app ?? []);
      setFirms(firmList ?? []);
      setDemoAccountIds(new Set(ids?.accounts ?? []));
      setDemoDisabled(disabled);
      setConnFirmById(connFirms ?? {});
      setHiddenConns(Array.isArray(hConns?.value) ? hConns.value : []);
      setHiddenAccts(Array.isArray(hAccts?.value) ? hAccts.value : []);

      // [balance] Ao vivo: grava o saldo da PLATAFORMA nas contas associadas e usa como
      // capital nominal (prop) quando ainda não houver. Só escreve o que mudou.
      if (Array.isArray(accts) && accts.length > 0 && (app ?? []).length > 0) {
        const balByPid = new Map(accts.map((b) => [b.platformAccountId, Number(b.balance) || 0]));
        for (const a of app) {
          if (!a.platformAccountId) continue;
          const bal = balByPid.get(a.platformAccountId);
          if (bal == null) continue;
          const needBal = Number(a.platformBalance ?? NaN) !== bal;
          let propNeed = null;
          if (a.kind === 'prop') {
            propNeed = await f.ds.propExtensions.byAccountId(a.id).catch(() => null);
          }
          const needNominal = a.kind === 'prop' && propNeed && !(Number(propNeed.nominalSize) > 0) && bal > 0;
          if (!needBal && !needNominal) continue;
          await f.ds.accounts.put(
            { ...a, platformBalance: bal, platformBalanceAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            { source: 'local' },
          );
          if (needNominal) {
            await f.ds.propExtensions.put({ ...propNeed, nominalSize: bal, updatedAt: new Date().toISOString() }, { source: 'local' });
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (finance) load();
  }, [finance, load]);

  const quantower = statuses.find((s) => s.platformId === 'quantower');
  // Demo automático só em build com VITE_DEMO_MODE; o botão "Ver exemplo" funciona em
  // qualquer build (inclusive produção), pois é uma ação explícita e rotulada.
  const userAccounts = appAccounts.filter((a) => !demoAccountIds.has(a.id));
  const autoDemo = DEMO_CAPABLE && !demoDisabled && userAccounts.length === 0 && bridgeAccounts.length === 0;
  const showDemo = autoDemo;
  const online = !!quantower?.online || showDemo;
  // Aplica os ocultos: conexões e contas da ponte que o usuário removeu da lista.
  const connections = (quantower?.connections?.length ? quantower.connections : (showDemo ? DEMO_CONNECTIONS : []))
    .filter((c) => !hiddenConns.includes(c.id));
  const effectiveBridge = (bridgeAccounts.length ? bridgeAccounts : (showDemo ? DEMO_BRIDGE : []))
    .filter((a) => !hiddenAccts.includes(a.platformAccountId) && !hiddenConns.includes(a.connectionId));

  const firmById = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);
  const byConn = useMemo(() => {
    const m = new Map();
    for (const c of connections) m.set(c.id, { id: c.id, name: c.name, bridge: [], mapped: [] });
    for (const a of effectiveBridge) {
      if (!m.has(a.connectionId)) m.set(a.connectionId, { id: a.connectionId || '—', name: a.connectionName || a.connectionId || 'Sem conexão', bridge: [], mapped: [] });
      m.get(a.connectionId).bridge.push(a);
    }
    for (const [, entry] of m) {
      const ids = new Set(entry.bridge.map((b) => b.platformAccountId));
      entry.mapped = appAccounts.filter((a) => a.platformAccountId && ids.has(a.platformAccountId));
      // Firm explícita da conexão tem prioridade; senão, a mais comum entre as contas.
      const counts = new Map();
      for (const a of entry.mapped) if (a.firmId) counts.set(a.firmId, (counts.get(a.firmId) ?? 0) + 1);
      const topFirmId = connFirmById[entry.id] || [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      const firm = topFirmId ? firmById.get(topFirmId) : null;
      entry.firmId = firm ? firm.id : '';
      entry.firm = firm ?? null;
      entry.color = firm?.color || '#7c5cff';
    }
    return [...m.values()];
  }, [connections, effectiveBridge, appAccounts, firmById, connFirmById]);

  const appByPlatformId = useMemo(() => {
    const m = new Map();
    for (const a of appAccounts) if (a.platformAccountId) m.set(a.platformAccountId, a);
    return m;
  }, [appAccounts]);

  const associate = useCallback(async (bridgeAcc, appAccountId) => {
    const f = financeRef.current;
    if (!f || !appAccountId) return;
    const app = appAccounts.find((a) => a.id === appAccountId);
    if (!app) return;
    await f.ds.accounts.put({
      ...app,
      platformAccountId: bridgeAcc.platformAccountId,
      platformName: 'quantower',
      platformBalance: Number(bridgeAcc.balance) || 0,
      platformBalanceAt: new Date().toISOString(),
      firmId: connFirmById[bridgeAcc.connectionId] || app.firmId,
      institution: app.institution || bridgeAcc.connectionName || undefined,
      updatedAt: new Date().toISOString(),
    }, { source: 'local' });
    toast(`Conta associada: ${bridgeAcc.name}`);
    load();
  }, [appAccounts, connFirmById, load, toast]);

  const unassociate = useCallback(async (appAccount) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.accounts.put({ ...appAccount, platformAccountId: undefined, updatedAt: new Date().toISOString() }, { source: 'local' });
    toast(`Associação removida: ${appAccount.name}`);
    load();
  }, [load, toast]);

  const createFor = useCallback(async (bridgeAcc) => {
    const f = financeRef.current;
    if (!f) return;
    const id = `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await f.ds.accounts.put({
      id,
      kind: newKind,
      name: bridgeAcc.name || `Conta ${bridgeAcc.platformAccountId}`,
      currency: bridgeAcc.currency || 'USD',
      institution: bridgeAcc.connectionName || undefined,
      firmId: connFirmById[bridgeAcc.connectionId] || undefined,
      hidden: false,
      defaultWeight: 1,
      platformAccountId: bridgeAcc.platformAccountId,
      platformName: 'quantower',
      platformBalance: Number(bridgeAcc.balance) || 0,
      platformBalanceAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: f.ds.deviceId,
      version: 0,
    }, { source: 'local' });
    // Prop: usa o BALANCE da ponte como capital nominal (senão a conta fica com 0).
    const nominal = Number(bridgeAcc.balance);
    if (newKind === 'prop' && nominal > 0) {
      try {
        await f.ds.propExtensions.put({
          accountId: id,
          nominalSize: nominal,
          challengeCost: 0,
          phase: 'funded',
          target: nominal,
          maxDD: Number((nominal * 0.1).toFixed(2)),
          trailingDD: Number((nominal * 0.1).toFixed(2)),
          dailyDD: Number((nominal * 0.05).toFixed(2)),
          consistencyPct: 0,
          minDays: 0,
          payoutRules: { minProfit: 0, minDaysSincePayout: 0, feePct: 0, method: 'Rise' },
          profitSplit: 0.8,
          payoutFrequency: 'monthly',
          updatedAt: new Date().toISOString(),
          deviceId: f.ds.deviceId,
          version: 0,
        }, { source: 'local' });
      } catch { /* noop */ }
    }
    toast(`Conta criada: ${bridgeAcc.name}`);
    load();
  }, [connFirmById, load, newKind, toast]);

  // Ocultar/exibir: conexões e contas da ponte que não quer mais ver.
  const hideConnection = useCallback(async (connId) => {
    const f = financeRef.current;
    if (!f) return;
    const next = [...new Set([...hiddenConns, connId])];
    await f.ds.meta.setKey(HIDDEN_CONNS_KEY, next);
    setHiddenConns(next);
    toast('Conexão ocultada.');
  }, [hiddenConns, toast]);

  const hideBridgeAccount = useCallback(async (platformAccountId) => {
    const f = financeRef.current;
    if (!f) return;
    const next = [...new Set([...hiddenAccts, platformAccountId])];
    await f.ds.meta.setKey(HIDDEN_ACCTS_KEY, next);
    setHiddenAccts(next);
    toast('Conta da ponte ocultada.');
  }, [hiddenAccts, toast]);

  // Sincroniza os trades da ponte direto daqui (mesmo ingest do Quantower).
  const syncTrades = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    setBusy(true);
    try {
      const list = await adapterRef.current.getAllTrades();
      const res = await ingestQuantowerTrades(f.ds, f.chain, list);
      toast(`Trades sincronizados — criados ${res.created}, atualizados ${res.updated}, ignorados ${res.skipped}.`);
      load();
    } catch (e) {
      toast(`Falha ao sincronizar trades: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [load, toast]);

  // Religa trades que entraram SEM conta (não associados) usando o platformAccountId.
  const relinkTrades = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    setBusy(true);
    try {
      const trades = await f.ds.trades.list();
      const orphan = trades.filter((t) => !t.accountId && t.platformAccountId);
      let n = 0;
      for (const t of orphan) {
        const acc = appByPlatformId.get(t.platformAccountId);
        if (!acc) continue;
        await f.ds.trades.put({ ...t, accountId: acc.id, updatedAt: new Date().toISOString() }, { source: 'local' });
        n += 1;
      }
      toast(n > 0 ? `${n} trade(s) religados à conta.` : 'Nenhum trade sem conta para religar.', { type: n > 0 ? 'ok' : 'warn' });
      load();
    } catch (e) {
      toast(`Falha ao religar: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [appByPlatformId, load, toast]);

  const unhideAll = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.meta.setKey(HIDDEN_CONNS_KEY, []);
    await f.ds.meta.setKey(HIDDEN_ACCTS_KEY, []);
    setHiddenConns([]);
    setHiddenAccts([]);
    toast('Itens ocultos reexibidos.');
  }, [toast]);

  // Define a firm da conexão e propaga para TODAS as contas vinculadas a ela.
  const setFirmForConnection = useCallback(async (connId, firmId) => {
    const f = financeRef.current;
    if (!f) return;
    setBusy(true);
    try {
      await setConnectionFirm(f.ds, connId, firmId || null);
      const entry = byConn.find((c) => c.id === connId);
      const pids = new Set((entry?.bridge ?? []).map((b) => b.platformAccountId));
      for (const a of appAccounts) {
        if (a.platformAccountId && pids.has(a.platformAccountId) && a.firmId !== (firmId || undefined)) {
          await f.ds.accounts.put({ ...a, firmId: firmId || undefined, updatedAt: new Date().toISOString() }, { source: 'local' });
        }
      }
      toast(firmId ? 'Firm da conexão aplicada às contas.' : 'Firm da conexão removida.');
      load();
    } finally {
      setBusy(false);
    }
  }, [byConn, appAccounts, load, toast]);

  const autoByName = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    let n = 0;
    for (const b of effectiveBridge) {
      if (appByPlatformId.has(b.platformAccountId)) continue;
      const match = appAccounts.find((a) => !a.platformAccountId && a.name.trim().toLowerCase() === (b.name || '').trim().toLowerCase());
      if (!match) continue;
      await f.ds.accounts.put({ ...match, platformAccountId: b.platformAccountId, platformName: 'quantower', firmId: connFirmById[b.connectionId] || match.firmId, updatedAt: new Date().toISOString() }, { source: 'local' });
      n += 1;
    }
    toast(n > 0 ? `${n} conta(s) associadas por nome.` : 'Nada para auto-associar por nome.', { type: n > 0 ? 'ok' : 'warn' });
    load();
  }, [effectiveBridge, appAccounts, appByPlatformId, connFirmById, load, toast]);

  const createAllMissing = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    let n = 0;
    for (const b of effectiveBridge) {
      if (appByPlatformId.has(b.platformAccountId)) continue;
      await createFor(b);
      n += 1;
    }
    if (n === 0) toast('Nenhuma conta faltando.', { type: 'warn' });
  }, [effectiveBridge, appByPlatformId, createFor, toast]);

  return (
    <div className="st-card">
      <div className="st-title"><Link2 size={15} /> Conexões de plataforma</div>
      <div className="cx-head">
        <p className="st-hint">Contas da ponte (Quantower/cTrader). Associe cada conta ao cadastro do app ou crie automaticamente.</p>
      </div>

      {!online && (
        <div className="cx-offline" role="status">
          <span className="cx-dot off" /> Bridge offline
          {effectiveBridge.length > 0 && cachedAt ? ` — mostrando a última leitura (${new Date(cachedAt).toLocaleString('pt-BR')})` : ' — abra o Quantower e a ponte'}.
          <button className="cmd-refresh" onClick={() => { refreshStatuses(); load(); }}><RefreshCw size={13} /> Atualizar</button>
        </div>
      )}

      <div className="cx-actions">
        <button className="cmd-refresh" onClick={relinkTrades} disabled={busy}><Link2 size={13} /> Religar trades sem conta</button>
        {(hiddenConns.length > 0 || hiddenAccts.length > 0) && (
          <button className="cmd-refresh" onClick={unhideAll}><RotateCcw size={13} /> Reexibir ocultos ({hiddenConns.length + hiddenAccts.length})</button>
        )}
      </div>

      {showDemo && (
        <div className="cx-offline" role="status">
          <span className="cx-dot on" /> Exemplo (demo) — some quando você cadastrar sua primeira conta.
        </div>
      )}

      {connections.length === 0 && online && (
        <div className="cx-offline" role="status">Nenhuma conexão retornada pela ponte.</div>
      )}

      {connections.length > 0 && (
        <div className="cx-grid">
          {byConn.map((c) => {
            const open = openId === c.id;
            return (
              <div key={c.id} className={`cx-card${open ? ' open' : ''}`} style={{ borderColor: open ? c.color : undefined, borderTopColor: c.color }}>
                <button type="button" className="cx-card-head" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open}>
                  <span className="cx-ico" style={{ color: c.color, borderColor: c.color, background: `${c.color}22` }}>
                    {c.firm?.icon ? <span style={{ fontSize: 15 }}>{c.firm.icon}</span> : <Landmark size={16} />}
                  </span>
                  <span className="cx-card-body">
                    <span className="cx-name">{c.name}{c.firm && <span className="cx-firm" style={{ color: c.color }}>{c.firm.icon ? `${c.firm.icon} ` : '● '}{c.firm.name}</span>}</span>
                    <span className="cx-sub">
                      <span className={`cx-dot ${online ? 'on' : 'off'}`} /> {online ? 'conectada' : 'offline'} · {c.mapped.length}/{c.bridge.length} contas associadas
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="cx-panel">
                    <div className="cx-firm-row">
                      <span className="cx-firm-label">Firm da conexão</span>
                      <select
                        className="cx-select"
                        value={c.firmId || ''}
                        onChange={(e) => setFirmForConnection(c.id, e.target.value)}
                        disabled={busy}
                        aria-label={`Firm da conexão ${c.name}`}
                      >
                        <option value="">— sem firm —</option>
                        {firms.map((f) => <option key={f.id} value={f.id}>{f.icon ? `${f.icon} ` : ''}{f.name}</option>)}
                      </select>
                      <button className="cx-btn" onClick={() => hideConnection(c.id)} title="Ocultar esta conexão" aria-label="Ocultar conexão"><EyeOff size={13} /></button>
                    </div>
                    {c.bridge.length === 0 ? (
                      <div className="st-hint">Sem contas nesta conexão.</div>
                    ) : c.bridge.map((b) => {
                      const mapped = appByPlatformId.get(b.platformAccountId);
                      return (
                        <div key={b.platformAccountId} className="cx-row">
                          <div className="cx-row-info">
                            <span className="cx-row-name">{b.name || b.platformAccountId}</span>
                            <span className="cx-row-sub">{b.currency} {b.balance != null ? `· ${b.balance}` : ''}</span>
                          </div>
                          {mapped ? (
                            <>
                              <span className="cx-mapped" title="Conta do app associada">{mapped.name}</span>
                              <button className="cx-btn" onClick={() => unassociate(mapped)} title="Desassociar"><Unlink size={13} /></button>
                            </>
                          ) : (
                            <>
                              <select className="cx-select" value="" onChange={(e) => { if (e.target.value) associate(b, e.target.value); }} aria-label={`Associar ${b.name}`}>
                                <option value="">Associar a…</option>
                                {appAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}{a.platformAccountId ? ' (já vinculada)' : ''}</option>))}
                              </select>
                              <button className="cx-btn cx-btn-primary" onClick={() => createFor(b)} title="Criar conta no app"><Plus size={13} /></button>
                            </>
                          )}
                          <button className="cx-btn" onClick={() => hideBridgeAccount(b.platformAccountId)} title="Ocultar esta conta da ponte" aria-label={`Ocultar ${b.name}`}><EyeOff size={13} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {online && effectiveBridge.length > 0 && (
        <div className="cx-actions">
          <label className="cx-kind">
            <span>Criar como</span>
            <select className="cx-select" value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Tipo da conta a criar">
              {KIND_OPTIONS.map((k) => (<option key={k.v} value={k.v}>{k.label}</option>))}
            </select>
          </label>
          <button className="cmd-refresh" onClick={autoByName} disabled={busy}><Wand2 size={13} /> Auto-associar por nome</button>
          <button className="cmd-refresh" onClick={createAllMissing} disabled={busy}><Plus size={13} /> Criar contas faltantes</button>
          <button className="cmd-refresh" onClick={syncTrades} disabled={busy}><RefreshCw size={13} /> Sincronizar trades</button>
          <button className="cmd-refresh" onClick={() => { refreshStatuses(); load(); }} disabled={busy}><RefreshCw size={13} /> Atualizar</button>
        </div>
      )}
    </div>
  );
}

const CX_CSS = `
.cx-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: space-between; }
.cx-head .st-hint { margin: 0; }
.cx-warn { color: var(--yellow, #f1c40f); }
.cx-offline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--muted, #a1a7b3); }
.cx-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cx-card { background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%); border: 1px solid #1a2232; border-top-width: 3px; border-radius: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); backdrop-filter: blur(10px); overflow: hidden; }
.cx-firm { font-size: 11px; font-weight: 700; margin-left: 8px; }
.cx-card.open { border-color: rgba(124,92,255,0.4); }
.cx-card-head { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px; background: transparent; border: none; color: var(--text, #e7eaf0); cursor: pointer; text-align: left; }
.cx-ico { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 10px; border: 1px solid rgba(124,92,255,0.4); color: var(--brand, #7c5cff); background: rgba(124,92,255,0.12); flex-shrink: 0; }
.cx-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cx-name { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cx-sub { font-size: 11px; color: var(--muted, #a1a7b3); display: inline-flex; align-items: center; gap: 6px; }
.cx-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.cx-dot.on { background: var(--green, #2ecc71); box-shadow: 0 0 6px rgba(46,204,113,0.6); }
.cx-dot.off { background: var(--red, #e74c3c); }
.cx-panel { border-top: 1px solid rgba(255,255,255,0.06); padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.cx-firm-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0 8px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 4px; }
.cx-firm-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.cx-row { display: grid; grid-template-columns: 1fr auto auto auto; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.cx-row:last-child { border-bottom: none; }
.cx-row-info { min-width: 0; display: flex; flex-direction: column; }
.cx-row-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cx-row-sub { font-size: 10px; color: var(--muted, #a1a7b3); }
.cx-mapped { font-size: 11px; color: var(--green, #2ecc71); font-weight: 700; white-space: nowrap; }
.cx-select { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); border-radius: 8px; padding: 6px 8px; font-size: 12px; min-height: 36px; max-width: 160px; }
.cx-btn { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }
.cx-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; }
.cx-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.cx-kind { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted, #a1a7b3); }
@media (max-width: 800px) { .cx-grid { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('cx-styles')) {
  const style = document.createElement('style');
  style.id = 'cx-styles';
  style.textContent = CX_CSS;
  document.head.appendChild(style);
}
