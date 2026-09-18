// Positions & Orders — posições abertas e ordens pendentes vindas da ponte
// (Quantower/cTrader). Posições: editar SL/TP (`modifyPosition`) e fechar
// (`closePosition`). Ordens: listar + cancelar (`cancelOrder`) e colocar nova
// (`placeOrder`). Nada de storage próprio: a fonte é a plataforma.
import { fmtMoney } from '@apps/ui/currency';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform, bridgePrefs, useFinance } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { listFirms, listConnectionFirms } from '@apps/lib/db';
import ModuleTabs from '../../ModuleTabs';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { submitOrQueue, flushQueue, readQueue } from '@apps/utils/orderQueue.js';
import { useWakeLock } from '../../useWakeLock';
import { Activity, RefreshCw, X, Clock, Zap, ZapOff } from 'lucide-react';

/** Selo da firm (logo > ícone > nome colorido) para as linhas de posição/ordem. */
function FirmChip({ firm }) {
  if (!firm) return null;
  if (firm.logo) return <span className="lp-firm" title={firm.name}><img src={firm.logo} alt={firm.name} /></span>;
  if (firm.icon) return <span className="lp-firm" title={firm.name}>{firm.icon}</span>;
  return <span className="lp-firm" title={firm.name} style={{ color: firm.color }}>{firm.name}</span>;
}

/** "há X min" a partir de um ISO (module-level: hoisted, sem risco de TDZ). */
function agoText(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'agora';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export default function LivePositionsPage() {
  const { livePositions, statuses, lastSync, refreshStatuses, streaming, lastSnapshot, positionsAt } = usePlatform();
  // Tick de 1s só para o rótulo "atualizado há Xs" (mostra a idade real da leitura).
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const { toast } = useToast();
  const wake = useWakeLock();
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ accountId: '', symbol: '', side: 'buy', type: 'limit', qty: '', price: '', sl: '', tp: '' });
  const [pending, setPending] = useState(() => readQueue().length);
  const [editOrderId, setEditOrderId] = useState(null);
  const [orderEdit, setOrderEdit] = useState({ qty: '', price: '', sl: '', tp: '' });
  const [partialId, setPartialId] = useState(null);
  const [partialQty, setPartialQty] = useState('');
  const [appAccounts, setAppAccounts] = useState([]);
  const [firms, setFirms] = useState([]);
  const [connFirms, setConnFirms] = useState({});
  const finance = useFinance();
  const adapterRef = useRef(null);
  if (!adapterRef.current) {
    const { bridgeUrl, bridgeToken } = bridgePrefs();
    adapterRef.current = new QuantowerAdapter({ bridgeUrl, bridgeToken });
  }
  const adapter = adapterRef.current;

  const online = statuses.some((s) => s.online);
  const quantower = statuses.find((s) => s.platformId === 'quantower');
  // Ao vivo quando conectado; senão a ÚLTIMA leitura (fallback offline/remoto).
  // Online = SEMPRE a leitura ao vivo (mesmo com 0 posições). O snapshot só entra quando
  // o bridge está FORA — senão uma posição fechada "voltava" como fantasma pela última leitura.
  const positions = online ? livePositions : (lastSnapshot?.positions ?? []);
  const isStale = !online && positions.length > 0;
  const staleAgo = lastSnapshot?.at ? agoText(lastSnapshot.at) : null;
  const totals = useMemo(() => {
    const pnl = positions.reduce((s, p) => s + (p.netPnl ?? 0), 0);
    const long = positions.filter((p) => p.side === 'Long').length;
    const short = positions.filter((p) => p.side === 'Short').length;
    return { pnl, long, short };
  }, [positions]);

  // Contas/firms do app: para mostrar conta + firm em cada posição/ordem.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!finance?.ds) return;
      try {
        const [accs, fs, cf] = await Promise.all([
          finance.ds.accounts.list(), listFirms(finance.ds), listConnectionFirms(finance.ds),
        ]);
        if (!alive) return;
        setAppAccounts(accs ?? []);
        setFirms(fs ?? []);
        setConnFirms(cf ?? {});
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [finance]);

  const appByPlatform = useMemo(() => {
    const m = new Map();
    for (const a of appAccounts) if (a.platformAccountId) m.set(a.platformAccountId, a);
    return m;
  }, [appAccounts]);
  const firmById = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);
  const firmOf = useCallback((p) => {
    const app = p.platformAccountId ? appByPlatform.get(p.platformAccountId) : null;
    const firmId = app?.firmId || (p.connectionId ? connFirms[p.connectionId] : undefined);
    return firmId ? firmById.get(firmId) : null;
  }, [appByPlatform, connFirms, firmById]);
  const accountNameOf = useCallback((p) => (
    p.accountName || (p.platformAccountId ? appByPlatform.get(p.platformAccountId)?.name : '') || p.connectionName || '—'
  ), [appByPlatform]);
  // Preço integral (sem abreviar) — forex com até 5 casas, resto 2.
  const fmtPrice = (v) => (v == null || Number.isNaN(Number(v)))
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  // Var % = variação do PREÇO a favor da posição. Antes era PnL/(qtd×abertura), que
  // ignora o contract size — em MGC (10×) o percentual saía 10× maior.
  const varPct = (p) => {
    const open = Number(p.openPrice);
    const cur = Number(p.currentPrice);
    if (!(open > 0) || !Number.isFinite(cur) || cur === 0) return null;
    const dir = p.side === 'Short' ? -1 : 1;
    return ((cur - open) / open) * 100 * dir;
  };

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

  // SSE: ordens chegam empurradas pelo bridge (posições já vêm via usePlatform).
  useEffect(() => {
    const onStream = (e) => {
      const d = e.detail;
      if (Array.isArray(d?.orders)) setOrders(d.orders);
    };
    window.addEventListener('qt:stream', onStream);
    return () => window.removeEventListener('qt:stream', onStream);
  }, []);

  // #6 — reexecuta a fila quando a ponte volta (online / evento de rede).
  const flush = useCallback(async () => {
    const res = await flushQueue(adapter);
    setPending(res.remaining);
    if (res.sent > 0) {
      toast(`${res.sent} operação(ões) da fila enviada(s).`);
      loadOrders();
      refreshStatuses();
    }
  }, [adapter, loadOrders, refreshStatuses, toast]);

  useEffect(() => {
    if (!online) return undefined;
    flush();
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const setEdit = (id, k, v) => setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [k]: v } }));
  const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

  const saveSl = async (p) => {
    const e = edits[p.platformPositionId] ?? {};
    const sl = 'sl' in e ? num(e.sl) : p.sl;
    const tp = 'tp' in e ? num(e.tp) : p.tp;
    setBusy(p.platformPositionId);
    try {
      const res = await submitOrQueue(adapter, { kind: 'modify', payload: { platformPositionId: p.platformPositionId, sl, tp } });
      if (res.queued) {
        setPending(readQueue().length);
        toast(`Bridge offline — SL/TP de ${p.symbol} na fila.`, { type: 'warn' });
      } else {
        toast(`SL/TP atualizados — ${p.symbol}`);
        setEdits((prev) => { const n = { ...prev }; delete n[p.platformPositionId]; return n; });
        refreshStatuses();
      }
    } catch (err) {
      toast(`Falha ao atualizar ${p.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const close = async (p) => {
    setBusy(p.platformPositionId);
    try {
      const res = await submitOrQueue(adapter, { kind: 'close', payload: { platformPositionId: p.platformPositionId } });
      if (res.queued) {
        setPending(readQueue().length);
        setConfirmId(null);
        toast(`Bridge offline — fechar ${p.symbol} na fila.`, { type: 'warn' });
      } else {
        toast(`Posição fechada — ${p.symbol}`);
        setConfirmId(null);
        refreshStatuses();
      }
    } catch (err) {
      toast(`Falha ao fechar ${p.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  // Fechar PARCIAL: manda ordem a mercado oposta com qty menor (contas netting).
  const startPartial = (p) => {
    setPartialId(p.platformPositionId);
    setPartialQty(String(Math.max(1, Math.floor((p.quantity ?? 0) / 2))));
  };

  const confirmPartial = async (p) => {
    const qty = num(partialQty);
    if (!qty) { toast('Informe a quantidade a fechar.', { type: 'warn' }); return; }
    if (qty > (p.quantity ?? 0)) { toast(`Quantidade maior que a posição (${p.quantity}).`, { type: 'warn' }); return; }
    setBusy(p.platformPositionId);
    try {
      const res = await submitOrQueue(adapter, {
        kind: 'open',
        payload: {
          accountId: p.platformAccountId, symbol: p.symbol,
          side: p.side === 'Long' ? 'sell' : 'buy', qty, sl: null, tp: null,
          note: 'fechamento parcial',
        },
      });
      if (res.queued) {
        setPending(readQueue().length);
        toast('Bridge offline — fechamento parcial na fila.', { type: 'warn' });
      } else {
        toast(`Fechamento parcial enviado — ${qty} de ${p.quantity} ${p.symbol}`);
      }
      setPartialId(null);
      refreshStatuses();
    } catch (err) {
      toast(`Falha no fechamento parcial: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const cancelOrder = async (o) => {
    setBusy(o.platformOrderId);
    try {
      const res = await submitOrQueue(adapter, { kind: 'cancel', payload: { platformOrderId: o.platformOrderId } });
      if (res.queued) {
        setPending(readQueue().length);
        toast(`Bridge offline — cancelar ${o.symbol} na fila.`, { type: 'warn' });
      } else {
        toast(`Ordem cancelada — ${o.symbol}`);
        loadOrders();
        refreshStatuses();
      }
    } catch (err) {
      toast(`Falha ao cancelar ${o.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const placeOrder = async () => {
    const qty = num(form.qty);
    const price = num(form.price);
    const isMarket = form.type === 'market';
    if (!form.accountId || !form.symbol.trim() || !qty || (!isMarket && !price)) {
      toast(isMarket ? 'Preencha conta, símbolo e quantidade.' : 'Preencha conta, símbolo, quantidade e preço.', { type: 'warn' });
      return;
    }
    setBusy('new-order');
    try {
      const res = await submitOrQueue(adapter, isMarket
        ? {
            kind: 'open', // abrir a mercado (bridge /positions/open)
            payload: { accountId: form.accountId, symbol: form.symbol.trim().toUpperCase(), side: form.side, qty, sl: num(form.sl), tp: num(form.tp), note: 'mercado' },
          }
        : {
            kind: 'place',
            payload: {
              accountId: form.accountId, symbol: form.symbol.trim().toUpperCase(), side: form.side, qty, type: form.type, price,
              sl: num(form.sl), tp: num(form.tp),
            },
          });
      const label = isMarket ? 'a mercado' : form.type;
      if (res.queued) {
        setPending(readQueue().length);
        toast(`Bridge offline — ordem ${form.symbol.toUpperCase()} na fila.`, { type: 'warn' });
        setForm((f) => ({ ...f, symbol: '', qty: '', price: '', sl: '', tp: '' }));
      } else {
        toast(`Ordem ${label} enviada — ${form.symbol.toUpperCase()}`);
        setForm((f) => ({ ...f, symbol: '', qty: '', price: '', sl: '', tp: '' }));
        loadOrders();
        refreshStatuses();
      }
    } catch (err) {
      toast(`Falha ao enviar ordem: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  // Editar ordem = SUBSTITUIR (o bridge não tem rota de modify de ordem): cancelar + recolocar.
  const startEditOrder = (o) => {
    setEditOrderId(o.platformOrderId);
    setOrderEdit({
      qty: String(o.remainingQuantity ?? o.quantity ?? ''),
      price: String(o.price ?? ''),
      sl: '',
      tp: '',
    });
  };

  const saveOrderEdit = async (o) => {
    const qty = num(orderEdit.qty);
    const price = num(orderEdit.price);
    if (!qty || !price) {
      toast('Preencha quantidade e preço.', { type: 'warn' });
      return;
    }
    setBusy(o.platformOrderId);
    try {
      const type = (o.type || '').toLowerCase().includes('stop') ? 'stop' : 'limit';
      const cancel = await submitOrQueue(adapter, { kind: 'cancel', payload: { platformOrderId: o.platformOrderId } });
      const place = await submitOrQueue(adapter, {
        kind: 'place',
        payload: {
          accountId: o.platformAccountId, symbol: o.symbol, side: o.side === 'Long' ? 'buy' : 'sell',
          qty, type, price, sl: num(orderEdit.sl), tp: num(orderEdit.tp),
        },
      });
      if (cancel.queued || place.queued) {
        setPending(readQueue().length);
        toast('Bridge offline — edição (cancelar+recolocar) na fila.', { type: 'warn' });
      } else {
        toast(`Ordem substituída — ${o.symbol}`);
      }
      setEditOrderId(null);
      loadOrders();
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao editar ${o.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const refresh = () => { refreshStatuses(); loadOrders(); };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Positions &amp; Orders</h1>
        <div className="cmd-actions">
          {wake.supported && (
            <button className="cmd-refresh" onClick={wake.toggle} aria-pressed={wake.active} title="Mantém a tela ligada para o streaming continuar (útil no celular)">
              {wake.active ? <Zap size={14} /> : <ZapOff size={14} />} {wake.active ? 'Tela ligada' : 'Manter tela ligada'}
            </button>
          )}
          <button className="cmd-refresh" onClick={refresh}>
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>
      <ModuleTabs module="trading" />

      <div className="lp-status" role="status">
        <span className={`lp-dot ${online ? 'on' : 'off'}`} />
        <span>{online ? 'Plataforma conectada' : 'Plataforma offline — abra o bridge'}</span>
        <span className="lp-muted">{positions.length} posição(ões) · {orders.length} ordem(ns){positionsAt ? ` · leitura ${new Date(positionsAt).toLocaleTimeString('pt-BR')}` : ''}{lastSync ? ` · sync trades ${new Date(lastSync).toLocaleTimeString('pt-BR')}` : ''}</span>
        {online && positionsAt && (
          <span className="lp-ago" title="Idade da última leitura de posições">
            {Date.now() - positionsAt < 3000 ? 'agora' : `há ${Math.max(1, Math.round((Date.now() - positionsAt) / 1000))}s`}
          </span>
        )}
        <span className={`lp-live ${streaming ? 'on' : ''}`} title={streaming ? 'Streaming ao vivo (SSE ~1,5s)' : 'Polling rápido (4s) — stream indisponível'}>{streaming ? 'LIVE' : 'polling'}</span>
      </div>

      {pending > 0 && (
        <div className="lp-queue" role="status" aria-live="polite">
          <Clock size={14} />
          <span>{pending} operação(ões) na fila (bridge offline).</span>
          <button className="ac3-btn ac3-btn-sm" disabled={!online} onClick={flush}>Enviar agora</button>
        </div>
      )}

      {isStale && (
        <div className="lp-stale" role="status">
          <Clock size={14} />
          <span>Sem bridge — mostrando a <b>última leitura</b>{staleAgo ? ` (${staleAgo})` : ''}. <b>Não é ao vivo.</b></span>
        </div>
      )}

      {online && (
        <div className="lp-health" aria-label="Saúde da plataforma">
          <div className="lp-h"><span className="lp-h-k">Plataforma</span><span className="lp-h-v">{quantower?.name || quantower?.platformId || 'Quantower'}</span></div>
          <div className="lp-h"><span className="lp-h-k">Conexões</span><span className="lp-h-v">{quantower?.connections?.length ?? 0}</span></div>
          <div className="lp-h"><span className="lp-h-k">Posições</span><span className="lp-h-v">{livePositions.length}</span></div>
          <div className="lp-h"><span className="lp-h-k">Ordens</span><span className="lp-h-v">{orders.length}</span></div>
          <div className="lp-h"><span className="lp-h-k">Última leitura</span><span className="lp-h-v">{positionsAt ? new Date(positionsAt).toLocaleTimeString('pt-BR') : '—'}</span></div>
        </div>
      )}

      {positions.length === 0 && !online ? (
        <div className="lp-empty" role="status"><Activity size={18} /> Sem conexão. Configure o bridge em Sistema → Quantower.</div>
      ) : (
        <>
          <h2 className="lp-section">Posições</h2>
          {positions.length === 0 ? (
            <div className="lp-empty" role="status">Nenhuma posição aberta agora.</div>
          ) : (
            <div className="lp-list">
              <div className="lp-row lp-head" aria-hidden="true">
                <span>Símbolo / Conta</span><span>Lado</span><span>Qtd</span><span>Abertura</span><span>Atual</span><span>PnL</span><span title="Variação do preço a favor da posição">Var %</span><span>SL</span><span>TP</span><span>Ações</span>
              </div>
              {positions.map((p) => {
                const e = edits[p.platformPositionId] ?? {};
                const slVal = 'sl' in e ? e.sl : (p.sl ?? '');
                const tpVal = 'tp' in e ? e.tp : (p.tp ?? '');
                const dirty = 'sl' in e || 'tp' in e;
                const confirming = confirmId === p.platformPositionId;
                const partial = partialId === p.platformPositionId;
                const firm = firmOf(p);
                const vp = varPct(p);
                return (
                  <React.Fragment key={p.platformPositionId}>
                    <div className="lp-row">
                      <span className="lp-sym">{p.symbol}<span className="lp-acct">{firm && <FirmChip firm={firm} />}{accountNameOf(p)}</span></span>
                      <span className={`lp-side ${p.side === 'Long' ? 'dash-pos' : 'dash-neg'}`}>{p.side}</span>
                      <span className="lp-num">{p.quantity}</span>
                      <span className="lp-num">{fmtPrice(p.openPrice)}</span>
                      <span className="lp-num">{fmtPrice(p.currentPrice)}</span>
                      <span className={`lp-num ${(p.netPnl ?? 0) >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(p.netPnl)}</span>
                      <span className={`lp-num ${vp == null ? '' : vp >= 0 ? 'dash-pos' : 'dash-neg'}`}>{vp != null ? `${vp.toFixed(2)}%` : '—'}</span>
                      <input className="lp-input" type="number" step="0.00001" value={slVal} placeholder="SL" onChange={(ev) => setEdit(p.platformPositionId, 'sl', ev.target.value)} aria-label={`Stop loss ${p.symbol}`} />
                      <input className="lp-input" type="number" step="0.00001" value={tpVal} placeholder="TP" onChange={(ev) => setEdit(p.platformPositionId, 'tp', ev.target.value)} aria-label={`Take profit ${p.symbol}`} />
                      <span className="lp-actions">
                        {dirty && <button className="lp-btn lp-btn-primary" disabled={busy === p.platformPositionId} onClick={() => saveSl(p)}>Salvar</button>}
                        <button className={`lp-btn${partial ? ' lp-btn-on' : ''}`} onClick={() => (partial ? setPartialId(null) : startPartial(p))} disabled={busy === p.platformPositionId} aria-expanded={partial}>Parcial</button>
                        {confirming ? (
                          <>
                            <button className="lp-btn lp-btn-danger" disabled={busy === p.platformPositionId} onClick={() => close(p)}>Confirmar</button>
                            <button className="lp-btn lp-btn-ico" onClick={() => setConfirmId(null)} aria-label="Cancelar"><X size={13} /></button>
                          </>
                        ) : (
                          <button className="lp-btn lp-btn-danger" onClick={() => setConfirmId(p.platformPositionId)}>Fechar</button>
                        )}
                      </span>
                    </div>
                    {partial && (
                      <div className="lp-partial" role="group" aria-label={`Fechar parcial ${p.symbol}`}>
                        <span className="lp-partial-hint">Fechar parcialmente (ordem oposta a mercado — contas <b>netting</b>)</span>
                        <input className="lp-input" type="number" step="0.01" placeholder="Qtd" value={partialQty} onChange={(ev) => setPartialQty(ev.target.value)} aria-label="Quantidade a fechar" />
                        <span className="lp-actions">
                          <button className="lp-btn lp-btn-danger" disabled={busy === p.platformPositionId} onClick={() => confirmPartial(p)}>Enviar</button>
                          <button className="lp-btn lp-btn-ico" onClick={() => setPartialId(null)} aria-label="Cancelar"><X size={13} /></button>
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {online && (
            <>
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
              <option value="market">Mercado</option>
            </select>
            <input className="lp-input" type="number" step="0.01" placeholder="Qtd" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} aria-label="Quantidade da ordem" />
            <input className="lp-input" type="number" step="0.00001" placeholder={form.type === 'market' ? 'a mercado' : 'Preço'} value={form.price} disabled={form.type === 'market'} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} aria-label="Preço da ordem" />
            <input className="lp-input" type="number" step="0.00001" placeholder="SL (opc.)" value={form.sl} onChange={(e) => setForm((f) => ({ ...f, sl: e.target.value }))} aria-label="Stop loss da ordem" />
            <input className="lp-input" type="number" step="0.00001" placeholder="TP (opc.)" value={form.tp} onChange={(e) => setForm((f) => ({ ...f, tp: e.target.value }))} aria-label="Take profit da ordem" />
            <button className="ac3-btn ac3-btn-sm" disabled={busy === 'new-order'} onClick={placeOrder}>Enviar</button>
          </div>

          {orders.length === 0 ? (
            <div className="lp-empty" role="status">Nenhuma ordem pendente.</div>
          ) : (
            <div className="lp-list">
              <div className="lp-row lp-ordrow lp-head" aria-hidden="true">
                <span>Símbolo</span><span>Lado</span><span>Tipo</span><span>Qtd</span><span>Preço</span><span>Status</span><span>Conta / Firm</span><span>Ações</span>
              </div>
              {orders.map((o) => (
                <React.Fragment key={o.platformOrderId}>
                  <div className="lp-row lp-ordrow">
                    <span className="lp-sym">{o.symbol}</span>
                    <span className={`lp-side ${o.side === 'Long' ? 'dash-pos' : 'dash-neg'}`}>{o.side}</span>
                    <span className="lp-num">{o.type || '—'}</span>
                    <span className="lp-num">{o.remainingQuantity ?? o.quantity}</span>
                    <span className="lp-num">{fmtPrice(o.price)}</span>
                    <span className="lp-num">{o.status || '—'}</span>
                    <span className="lp-acct">{firmOf(o) && <FirmChip firm={firmOf(o)} />}{accountNameOf(o)}</span>
                    <span className="lp-actions">
                      <button className="lp-btn" onClick={() => startEditOrder(o)}>Editar</button>
                      <button className="lp-btn lp-btn-danger" disabled={busy === o.platformOrderId} onClick={() => cancelOrder(o)}>Cancelar</button>
                    </span>
                  </div>
                  {editOrderId === o.platformOrderId && (
                    <div className="lp-orderedit">
                      <input className="lp-input" type="number" step="0.01" placeholder="Qtd" value={orderEdit.qty} onChange={(e) => setOrderEdit((s) => ({ ...s, qty: e.target.value }))} aria-label="Quantidade" />
                      <input className="lp-input" type="number" step="0.00001" placeholder="Preço" value={orderEdit.price} onChange={(e) => setOrderEdit((s) => ({ ...s, price: e.target.value }))} aria-label="Preço" />
                      <input className="lp-input" type="number" step="0.00001" placeholder="SL (opc.)" value={orderEdit.sl} onChange={(e) => setOrderEdit((s) => ({ ...s, sl: e.target.value }))} aria-label="Stop loss" />
                      <input className="lp-input" type="number" step="0.00001" placeholder="TP (opc.)" value={orderEdit.tp} onChange={(e) => setOrderEdit((s) => ({ ...s, tp: e.target.value }))} aria-label="Take profit" />
                      <span className="lp-actions">
                        <button className="lp-btn lp-btn-primary" disabled={busy === o.platformOrderId} onClick={() => saveOrderEdit(o)}>Salvar</button>
                        <button className="lp-btn lp-btn-ico" onClick={() => setEditOrderId(null)} aria-label="Cancelar edição"><X size={13} /></button>
                      </span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const LP_CSS = `
.lp-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text); padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
.lp-health { display: flex; flex-wrap: wrap; gap: 10px; }
.lp-h { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); min-width: 110px; }
.lp-h-k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.lp-h-v { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.lp-expo { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
.lp-expo-item { display: flex; align-items: center; gap: 8px; }
.lp-expo-bar { width: 160px; height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.lp-expo-fill { display: block; height: 100%; border-radius: 999px; }
.lp-expo-long { background: linear-gradient(90deg, #2ecc71, #7bed9f); }
.lp-expo-short { background: linear-gradient(90deg, #e74c3c, #ff7b6b); }
.lp-heat { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.lp-heat-row { display: grid; grid-template-columns: 1.2fr 1fr auto; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 8px; font-size: 12px; }
.lp-heat-sym { font-weight: 700; }
.lp-heat-net { color: var(--muted, #a1a7b3); }
.lp-heat-pnl { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
.lp-muted { color: var(--muted, #a1a7b3); margin-left: auto; }
.lp-queue { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 10px 14px; border-radius: 12px; background: rgba(225,177,44,0.08); border: 1px solid rgba(225,177,44,0.35); color: var(--text, #e7eaf0); }
.lp-queue span { flex: 1; }
.lp-stale { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 9px 14px; border-radius: 12px; background: rgba(225,177,44,0.08); border: 1px solid rgba(225,177,44,0.35); color: var(--text, #e7eaf0); }
.lp-stale span { flex: 1; }
.lp-dot { width: 9px; height: 9px; border-radius: 50%; }
.lp-dot.on { background: var(--green, #2ecc71); box-shadow: 0 0 8px rgba(46,204,113,0.6); }
.lp-dot.off { background: var(--red, #e74c3c); }
.lp-ago { font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.lp-live { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: var(--muted, #a1a7b3); }
.lp-live.on { background: rgba(46,204,113,0.16); border-color: rgba(46,204,113,0.5); color: #2ecc71; }
.lp-section { font-size: 13px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); margin: 18px 0 8px; }
.lp-empty { display: flex; align-items: center; gap: 8px; padding: 28px; justify-content: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }
.lp-list { display: flex; flex-direction: column; gap: 6px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
/* Larguras explícitas por coluna: o valor fica exatamente sob o título. Números
   alinhados à DIREITA (título e célula juntos); SL/TP com largura fixa (não espalham). */
.lp-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.8fr) 66px 56px 108px 108px 108px 80px 118px 118px minmax(150px, auto);
  gap: 8px; align-items: center; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px;
}
.lp-row > * { min-width: 0; white-space: nowrap; }
.lp-row > span:nth-child(3), .lp-row > span:nth-child(4), .lp-row > span:nth-child(5),
.lp-row > span:nth-child(6), .lp-row > span:nth-child(7),
.lp-row > span:nth-child(8), .lp-row > span:nth-child(9) { text-align: right; }
.lp-row > span:nth-child(10) { text-align: right; }
.lp-row > input.lp-input { justify-self: end; max-width: 118px; text-align: right; }
.lp-ordrow { grid-template-columns: minmax(140px, 1.6fr) 66px 80px 56px 108px 100px minmax(150px, 1.4fr) minmax(150px, auto); }
.lp-ordrow > span:nth-child(4), .lp-ordrow > span:nth-child(5), .lp-ordrow > span:nth-child(6),
.lp-ordrow > span:nth-child(8) { text-align: right; }
.lp-firm { display: inline-flex; align-items: center; margin-right: 5px; font-size: 10px; font-weight: 700; }
.lp-firm img { width: 12px; height: 12px; object-fit: contain; border-radius: 3px; }

.lp-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); border-bottom: 1px solid rgba(255,255,255,0.08); }
.lp-sym { font-weight: 700; display: flex; flex-direction: column; }
.lp-acct { font-size: 10px; color: var(--muted, #a1a7b3); font-weight: 400; }
.lp-side { font-weight: 700; }
.lp-num { font-variant-numeric: tabular-nums; }
.lp-input { width: 100%; min-width: 64px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text, #e7eaf0); font-size: 12px; padding: 7px 8px; min-height: 38px; font-family: inherit; }
.lp-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.lp-actions { display: flex; flex-wrap: nowrap; align-items: center; gap: 5px; justify-content: flex-end; }
/* Botões de linha: compactos, para caber no grid da tabela (antes usavam .ac3-btn, 40px de altura). */
.lp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 30px; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 600; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); cursor: pointer; white-space: nowrap; font-family: inherit; }
.lp-btn:hover:not(:disabled) { filter: brightness(1.14); }
.lp-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.lp-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; box-shadow: 0 4px 12px rgba(124,92,255,0.25); }
.lp-btn-danger { color: #ff6b5b; border-color: rgba(231,76,60,0.4); }
.lp-btn-danger:hover:not(:disabled) { background: rgba(231,76,60,0.14); border-color: rgba(231,76,60,0.6); }
.lp-btn-on { background: rgba(124,92,255,0.16); border-color: rgba(124,92,255,0.45); color: var(--text, #e7eaf0); }
.lp-btn-ico { padding: 4px 7px; min-width: 30px; }
.lp-orderedit { display: grid; grid-template-columns: 0.8fr 1fr 0.8fr 0.8fr auto; gap: 8px; align-items: center; padding: 8px 6px; margin: -2px 0 6px; border-radius: 10px; background: rgba(124,92,255,0.06); border: 1px dashed rgba(124,92,255,0.35); }
.lp-partial { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; margin: -2px 0 6px; border-radius: 10px; background: rgba(231,76,60,0.06); border: 1px dashed rgba(231,76,60,0.35); }
.lp-partial-hint { font-size: 11px; color: var(--muted, #a1a7b3); flex: 1; min-width: 180px; }
.lp-partial .lp-input { max-width: 110px; }
@media (max-width: 900px) { .lp-orderedit { grid-template-columns: 1fr 1fr; } }
.lp-neworder { display: grid; grid-template-columns: 1.3fr 1.1fr 0.8fr 0.8fr 0.7fr 0.9fr 0.8fr 0.8fr auto; gap: 8px; align-items: center; margin-bottom: 10px; }
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
