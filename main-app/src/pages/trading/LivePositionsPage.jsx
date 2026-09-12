// Positions & Orders — posições abertas e ordens pendentes vindas da ponte
// (Quantower/cTrader). Posições: editar SL/TP (`modifyPosition`) e fechar
// (`closePosition`). Ordens: listar + cancelar (`cancelOrder`) e colocar nova
// (`placeOrder`). Nada de storage próprio: a fonte é a plataforma.
import { fmtMoney } from '@apps/ui/currency';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform, bridgePrefs } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import ModuleTabs from '../../ModuleTabs';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { Activity, RefreshCw, X } from 'lucide-react';


export default function LivePositionsPage() {
  const { livePositions, statuses, lastSync, refreshStatuses } = usePlatform();
  const { toast } = useToast();
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ accountId: '', symbol: '', side: 'buy', type: 'limit', qty: '', price: '' });
  const adapterRef = useRef(null);
  if (!adapterRef.current) {
    const { bridgeUrl, bridgeToken } = bridgePrefs();
    adapterRef.current = new QuantowerAdapter({ bridgeUrl, bridgeToken });
  }
  const adapter = adapterRef.current;

  const online = statuses.some((s) => s.online);
  const totals = useMemo(() => {
    const pnl = livePositions.reduce((s, p) => s + (p.netPnl ?? 0), 0);
    const long = livePositions.filter((p) => p.side === 'Long').length;
    const short = livePositions.filter((p) => p.side === 'Short').length;
    return { pnl, long, short };
  }, [livePositions]);

  const loadOrders = useCallback(async () => {
    if (!online) return;
    try {
      const [o, a] = await Promise.all([adapter.getOrders(), adapter.getAccounts()]);
      setOrders(o);
      setAccounts(a);
    } catch {
      /* bridge offline — mantém o último estado */
    }
  }, [online, adapter]);

  useEffect(() => {
    loadOrders();
    if (!online) return undefined;
    const t = setInterval(loadOrders, 60000);
    return () => clearInterval(t);
  }, [loadOrders, online]);

  const setEdit = (id, k, v) => setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [k]: v } }));
  const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

  const saveSl = async (p) => {
    const e = edits[p.platformPositionId] ?? {};
    const sl = 'sl' in e ? num(e.sl) : p.sl;
    const tp = 'tp' in e ? num(e.tp) : p.tp;
    setBusy(p.platformPositionId);
    try {
      await adapter.modifyPosition({ platformPositionId: p.platformPositionId, sl, tp });
      toast(`SL/TP atualizados — ${p.symbol}`);
      setEdits((prev) => { const n = { ...prev }; delete n[p.platformPositionId]; return n; });
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao atualizar ${p.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const close = async (p) => {
    setBusy(p.platformPositionId);
    try {
      await adapter.closePosition(p);
      toast(`Posição fechada — ${p.symbol}`);
      setConfirmId(null);
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao fechar ${p.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const cancelOrder = async (o) => {
    setBusy(o.platformOrderId);
    try {
      await adapter.cancelOrder({ platformOrderId: o.platformOrderId });
      toast(`Ordem cancelada — ${o.symbol}`);
      loadOrders();
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao cancelar ${o.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const placeOrder = async () => {
    const qty = num(form.qty);
    const price = num(form.price);
    if (!form.accountId || !form.symbol.trim() || !qty || !price) {
      toast('Preencha conta, símbolo, quantidade e preço.', { type: 'warn' });
      return;
    }
    setBusy('new-order');
    try {
      await adapter.placeOrder({ accountId: form.accountId, symbol: form.symbol.trim().toUpperCase(), side: form.side, qty, type: form.type, price });
      toast(`Ordem ${form.type} enviada — ${form.symbol.toUpperCase()}`);
      setForm((f) => ({ ...f, symbol: '', qty: '', price: '' }));
      loadOrders();
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao enviar ordem: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const refresh = () => { refreshStatuses(); loadOrders(); };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Positions &amp; Orders</h1>
        <button className="cmd-refresh" onClick={refresh}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>
      <ModuleTabs module="trading" />

      <div className="lp-status" role="status">
        <span className={`lp-dot ${online ? 'on' : 'off'}`} />
        <span>{online ? 'Plataforma conectada' : 'Plataforma offline — abra o bridge'}</span>
        <span className="lp-muted">{livePositions.length} posição(ões) · {orders.length} ordem(ns){lastSync ? ` · último sync ${new Date(lastSync).toLocaleTimeString('pt-BR')}` : ''}</span>
      </div>

      {online && livePositions.length > 0 && (
        <div className="dash-cards">
          <div className={`card ${totals.pnl >= 0 ? 'accent1' : 'accent2'}`}>
            <h3>PnL aberto</h3>
            <div className="stat">{fmtMoney(totals.pnl)}</div>
            <div className="muted">líquido das posições</div>
          </div>
          <div className="card accent3"><h3>Long</h3><div className="stat">{totals.long}</div><div className="muted">posições</div></div>
          <div className="card accent4"><h3>Short</h3><div className="stat">{totals.short}</div><div className="muted">posições</div></div>
          <div className="card accent5"><h3>Ordens</h3><div className="stat">{orders.length}</div><div className="muted">pendentes</div></div>
        </div>
      )}

      {!online ? (
        <div className="lp-empty" role="status"><Activity size={18} /> Sem conexão. Configure o bridge em Sistema → Quantower.</div>
      ) : (
        <>
          <h2 className="lp-section">Posições</h2>
          {livePositions.length === 0 ? (
            <div className="lp-empty" role="status">Nenhuma posição aberta agora.</div>
          ) : (
            <div className="lp-list">
              <div className="lp-row lp-head" aria-hidden="true">
                <span>Símbolo</span><span>Lado</span><span>Qtd</span><span>Abertura</span><span>Atual</span><span>PnL</span><span>SL</span><span>TP</span><span>Ações</span>
              </div>
              {livePositions.map((p) => {
                const e = edits[p.platformPositionId] ?? {};
                const slVal = 'sl' in e ? e.sl : (p.sl ?? '');
                const tpVal = 'tp' in e ? e.tp : (p.tp ?? '');
                const dirty = 'sl' in e || 'tp' in e;
                const confirming = confirmId === p.platformPositionId;
                return (
                  <div key={p.platformPositionId} className="lp-row">
                    <span className="lp-sym">{p.symbol}<span className="lp-acct">{p.accountName || p.connectionName || ''}</span></span>
                    <span className={`lp-side ${p.side === 'Long' ? 'dash-pos' : 'dash-neg'}`}>{p.side}</span>
                    <span className="lp-num">{p.quantity}</span>
                    <span className="lp-num">{fmtMoney(p.openPrice)}</span>
                    <span className="lp-num">{fmtMoney(p.currentPrice)}</span>
                    <span className={`lp-num ${(p.netPnl ?? 0) >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(p.netPnl)}</span>
                    <input className="lp-input" type="number" step="0.00001" value={slVal} placeholder="SL" onChange={(ev) => setEdit(p.platformPositionId, 'sl', ev.target.value)} aria-label={`Stop loss ${p.symbol}`} />
                    <input className="lp-input" type="number" step="0.00001" value={tpVal} placeholder="TP" onChange={(ev) => setEdit(p.platformPositionId, 'tp', ev.target.value)} aria-label={`Take profit ${p.symbol}`} />
                    <span className="lp-actions">
                      <button className="ac3-btn ac3-btn-sm" disabled={!dirty || busy === p.platformPositionId} onClick={() => saveSl(p)}>Salvar</button>
                      {confirming ? (
                        <>
                          <button className="ac3-btn ac3-btn-sm ac3-btn-danger" disabled={busy === p.platformPositionId} onClick={() => close(p)}>Confirmar</button>
                          <button className="ac3-btn ac3-btn-sm" onClick={() => setConfirmId(null)} aria-label="Cancelar"><X size={13} /></button>
                        </>
                      ) : (
                        <button className="ac3-btn ac3-btn-sm ac3-btn-danger" onClick={() => setConfirmId(p.platformPositionId)}>Fechar</button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <h2 className="lp-section">Ordens</h2>

          <div className="lp-neworder">
            <select className="lp-input" value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))} aria-label="Conta da ordem">
              <option value="">Conta…</option>
              {accounts.map((a) => <option key={a.platformAccountId} value={a.platformAccountId}>{a.name}</option>)}
            </select>
            <input className="lp-input" placeholder="Símbolo" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} aria-label="Símbolo da ordem" />
            <select className="lp-input" value={form.side} onChange={(e) => setForm((f) => ({ ...f, side: e.target.value }))} aria-label="Lado da ordem">
              <option value="buy">Compra</option>
              <option value="sell">Venda</option>
            </select>
            <select className="lp-input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} aria-label="Tipo da ordem">
              <option value="limit">Limit</option>
              <option value="stop">Stop</option>
            </select>
            <input className="lp-input" type="number" step="0.01" placeholder="Qtd" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} aria-label="Quantidade da ordem" />
            <input className="lp-input" type="number" step="0.00001" placeholder="Preço" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} aria-label="Preço da ordem" />
            <button className="ac3-btn ac3-btn-sm" disabled={busy === 'new-order'} onClick={placeOrder}>Enviar</button>
          </div>

          {orders.length === 0 ? (
            <div className="lp-empty" role="status">Nenhuma ordem pendente.</div>
          ) : (
            <div className="lp-list">
              <div className="lp-row lp-ordrow lp-head" aria-hidden="true">
                <span>Símbolo</span><span>Lado</span><span>Tipo</span><span>Qtd</span><span>Preço</span><span>Status</span><span>Conta</span><span>Ações</span>
              </div>
              {orders.map((o) => (
                <div key={o.platformOrderId} className="lp-row lp-ordrow">
                  <span className="lp-sym">{o.symbol}</span>
                  <span className={`lp-side ${o.side === 'Long' ? 'dash-pos' : 'dash-neg'}`}>{o.side}</span>
                  <span className="lp-num">{o.type || '—'}</span>
                  <span className="lp-num">{o.remainingQuantity ?? o.quantity}</span>
                  <span className="lp-num">{fmtMoney(o.price)}</span>
                  <span className="lp-num">{o.status || '—'}</span>
                  <span className="lp-acct">{o.accountName || ''}</span>
                  <span className="lp-actions">
                    <button className="ac3-btn ac3-btn-sm ac3-btn-danger" disabled={busy === o.platformOrderId} onClick={() => cancelOrder(o)}>Cancelar</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const LP_CSS = `
.lp-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text); padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
.lp-muted { color: var(--muted, #a1a7b3); margin-left: auto; }
.lp-dot { width: 9px; height: 9px; border-radius: 50%; }
.lp-dot.on { background: var(--green, #2ecc71); box-shadow: 0 0 8px rgba(46,204,113,0.6); }
.lp-dot.off { background: var(--red, #e74c3c); }
.lp-section { font-size: 13px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); margin: 18px 0 8px; }
.lp-empty { display: flex; align-items: center; gap: 8px; padding: 28px; justify-content: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }
.lp-list { display: flex; flex-direction: column; gap: 6px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.lp-row { display: grid; grid-template-columns: 1.4fr 0.7fr 0.6fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr auto; gap: 8px; align-items: center; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; }
.lp-ordrow { grid-template-columns: 1.3fr 0.7fr 0.7fr 0.7fr 0.9fr 0.9fr 1.1fr auto; }
.lp-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); border-bottom: 1px solid rgba(255,255,255,0.08); }
.lp-sym { font-weight: 700; display: flex; flex-direction: column; }
.lp-acct { font-size: 10px; color: var(--muted, #a1a7b3); font-weight: 400; }
.lp-side { font-weight: 700; }
.lp-num { font-variant-numeric: tabular-nums; }
.lp-input { width: 100%; min-width: 64px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text, #e7eaf0); font-size: 12px; padding: 7px 8px; min-height: 38px; font-family: inherit; }
.lp-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.lp-actions { display: flex; gap: 6px; justify-content: flex-end; }
.lp-neworder { display: grid; grid-template-columns: 1.3fr 1.1fr 0.8fr 0.8fr 0.7fr 0.9fr auto; gap: 8px; align-items: center; margin-bottom: 10px; }
@media (max-width: 900px) {
  .lp-row { grid-template-columns: 1fr 1fr 1fr; }
  .lp-head { display: none; }
  .lp-sym { grid-column: 1 / -1; }
  .lp-actions { grid-column: 1 / -1; }
  .lp-neworder { grid-template-columns: 1fr 1fr; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('lp-styles')) {
  const style = document.createElement('style');
  style.id = 'lp-styles';
  style.textContent = LP_CSS;
  document.head.appendChild(style);
}
