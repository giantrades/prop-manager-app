// Conexões de plataforma — cards por conexão (glass) com status e contagem de contas,
// + painel para ASSOCIAR/Criar contas do app a partir das contas da ponte (Quantower).
// A associação usa `Account.platformAccountId` (mesmo campo do adapter). Nada de saldo aqui.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform, useFinance, bridgePrefs } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { listFirms } from '@apps/lib/db';
import { Landmark, Plus, Link2, Unlink, Wand2, RefreshCw } from 'lucide-react';

const KIND_OPTIONS = [
  { v: 'prop', label: 'Prop' },
  { v: 'bank', label: 'Banco' },
  { v: 'wallet', label: 'Cripto/Carteira' },
  { v: 'investment', label: 'Investimento' },
  { v: 'cash', label: 'Dinheiro' },
];

// Demo (VITE_DEMO_MODE=1): estrutura de conexões p/ ver a UI sem o Quantower aberto.
const DEMO = typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === '1';
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
      const [accts, app, firmList] = await Promise.all([
        adapterRef.current.getAccounts().catch(() => []),
        f.ds.accounts.list(),
        listFirms(f.ds),
      ]);
      setBridgeAccounts(accts ?? []);
      setAppAccounts(app ?? []);
      setFirms(firmList ?? []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (finance) load();
  }, [finance, load]);

  const quantower = statuses.find((s) => s.platformId === 'quantower');
  const online = !!quantower?.online || DEMO;
  const connections = (quantower?.connections?.length ? quantower.connections : (DEMO ? DEMO_CONNECTIONS : []));
  const effectiveBridge = bridgeAccounts.length ? bridgeAccounts : (DEMO ? DEMO_BRIDGE : []);

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
      // Cor da firm: a mais comum entre as contas associadas (fallback: brand).
      const counts = new Map();
      for (const a of entry.mapped) if (a.firmId) counts.set(a.firmId, (counts.get(a.firmId) ?? 0) + 1);
      const topFirmId = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      const firm = topFirmId ? firmById.get(topFirmId) : null;
      entry.firm = firm ?? null;
      entry.color = firm?.color || '#7c5cff';
    }
    return [...m.values()];
  }, [connections, effectiveBridge, appAccounts, firmById]);

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
      institution: app.institution || bridgeAcc.connectionName || undefined,
      updatedAt: new Date().toISOString(),
    }, { source: 'local' });
    toast(`Conta associada: ${bridgeAcc.name}`);
    load();
  }, [appAccounts, load, toast]);

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
      hidden: false,
      defaultWeight: 1,
      platformAccountId: bridgeAcc.platformAccountId,
      platformName: 'quantower',
      updatedAt: new Date().toISOString(),
      deviceId: f.ds.deviceId,
      version: 0,
    }, { source: 'local' });
    toast(`Conta criada: ${bridgeAcc.name}`);
    load();
  }, [load, newKind, toast]);

  const autoByName = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    let n = 0;
    for (const b of effectiveBridge) {
      if (appByPlatformId.has(b.platformAccountId)) continue;
      const match = appAccounts.find((a) => !a.platformAccountId && a.name.trim().toLowerCase() === (b.name || '').trim().toLowerCase());
      if (!match) continue;
      await f.ds.accounts.put({ ...match, platformAccountId: b.platformAccountId, platformName: 'quantower', updatedAt: new Date().toISOString() }, { source: 'local' });
      n += 1;
    }
    toast(n > 0 ? `${n} conta(s) associadas por nome.` : 'Nada para auto-associar por nome.', { type: n > 0 ? 'ok' : 'warn' });
    load();
  }, [effectiveBridge, appAccounts, appByPlatformId, load, toast]);

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
      <p className="st-hint">Contas da ponte (Quantower/cTrader). Associe cada conta ao cadastro do app ou crie automaticamente.</p>

      {!online && (
        <div className="cx-offline" role="status">
          <span className="cx-dot off" /> Bridge offline — abra o Quantower e a ponte para ver as conexões.
          <button className="cmd-refresh" onClick={() => { refreshStatuses(); load(); }}><RefreshCw size={13} /> Atualizar</button>
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
                  <span className="cx-ico" style={{ color: c.color, borderColor: c.color, background: `${c.color}22` }}><Landmark size={16} /></span>
                  <span className="cx-card-body">
                    <span className="cx-name">{c.name}{c.firm && <span className="cx-firm" style={{ color: c.color }}>● {c.firm.name}</span>}</span>
                    <span className="cx-sub">
                      <span className={`cx-dot ${online ? 'on' : 'off'}`} /> {online ? 'conectada' : 'offline'} · {c.mapped.length}/{c.bridge.length} contas associadas
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="cx-panel">
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
          <button className="cmd-refresh" onClick={() => { refreshStatuses(); load(); }} disabled={busy}><RefreshCw size={13} /> Atualizar</button>
        </div>
      )}
    </div>
  );
}

const CX_CSS = `
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
.cx-row { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
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
