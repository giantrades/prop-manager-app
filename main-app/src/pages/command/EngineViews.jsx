// STAGE 6 — EngineViews. Páginas que COMPÕEM os motores das fases 2/3/4 em telas
// prontas (Risk / Net Worth / Portfolio / Goals / Wallets / Tax / Forecast / Firm P&L /
// Expenses / Financial Journal). Cada uma chama selectors do engine e renderiza o
// componente de `@apps/ui`. Nenhuma fórmula financeira nova aqui.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Home = composição) + 01-tasks.md.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useFinance, usePeriod } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { fmtMoney } from '@apps/ui/currency';
import { nowIso } from '@apps/lib/db';
import PeriodPicker from '@apps/ui/PeriodPicker';
import {
  firmPnlByFirm,
  computeFirmPnlByAccount,
  firmPnlHistory,
  stockSalesTaxBase,
  computeDcaFromTransactions,
  refreshQuotes,
  normalizeSymbol,
  listCategories,
  getBudgets,
  saveBudget,
  saveCategory,
  getFxUSD,
} from '@apps/lib/db';
import RiskCenter from '@apps/ui/RiskCenter';
import NetWorth from '@apps/ui/NetWorth';
import Portfolio from '@apps/ui/Portfolio';
import Positions from '@apps/ui/Positions';
import Goals from '@apps/ui/Goals';
import Wallets from '@apps/ui/Wallets';
import TaxCockpit from '@apps/ui/TaxCockpit';
import Forecast from '@apps/ui/Forecast';
import FirmPnl from '@apps/ui/FirmPnl';
import Expenses from '@apps/ui/Expenses';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import FinancialJournal from '@apps/ui/FinancialJournal';

export function RiskPage() {
  // A1 — PnL live (posições abertas) somado ao equity, best-effort: bridge off
  // ou timeout => snapshot só com fechados (idêntico ao anterior).
  const { loading, data, finance } = useEngineData(async (f) => {
    let liveByAccount = null;
    try {
      const { QuantowerAdapter } = await import('@apps/utils/adapters/quantowerAdapter.js');
      const bridgeUrl = localStorage.getItem('qt:bridgeUrl') || import.meta.env.VITE_BRIDGE_URL || 'http://127.0.0.1:8787';
      const bridgeToken = localStorage.getItem('qt:bridgeToken') || import.meta.env.VITE_BRIDGE_TOKEN || '';
      const adapter = new QuantowerAdapter({ bridgeUrl, bridgeToken });
      const [positions, accounts] = await Promise.all([
        Promise.race([
          adapter.getPositions().catch(() => []),
          new Promise((res) => setTimeout(() => res([]), 6000)),
        ]),
        f.ds.accounts.list(),
      ]);
      const internalByPlatform = new Map(accounts.map((a) => [a.platformAccountId, a.id]));
      const agg = {};
      for (const p of positions || []) {
        const id = internalByPlatform.get(p.platformAccountId);
        if (!id) continue;
        const cur = agg[id] ?? { pnl: 0, count: 0 };
        cur.pnl += Number(p.netPnl) || 0;
        cur.count += 1;
        agg[id] = cur;
      }
      if (Object.keys(agg).length > 0) liveByAccount = agg;
    } catch {
      /* bridge off => sem live */
    }
    return f.risk.snapshot(liveByAccount ?? undefined);
  });
  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Risk Center</h1></div>
      <ModuleTabs module="trading" />
      <RiskCenter snapshot={data} loading={loading} />
    </div>
  );
}

export function NetWorthPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [nw, snapshots] = await Promise.all([f.wealth.netWorth(), f.wealth.netWorthSeries()]);
    return { nw, snapshots };
  });
  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Net Worth</h1></div>
      <ModuleTabs module="investimentos" />
      <NetWorth netWorth={data?.nw} snapshots={data?.snapshots} loading={loading} />
    </div>
  );
}

// P2/P3/P5 — Portfolio com preço AO VIVO (Brapi/CoinGecko, sem Quantower).
// Ao abrir + a cada 5min: busca cotações, aplica via markPosition (único writer) e
// registra snapshot do valor (1x/12h) para o chart de evolução. Com bridge/API off,
// mostra cache + stale (nunca trava).
const PORTFOLIO_HISTORY_KEY = 'portfolio:history';
const PORTFOLIO_HISTORY_MAX = 120;
const PORTFOLIO_HISTORY_GAP_MS = 12 * 60 * 60 * 1000;
const PRICE_REFRESH_MS = 5 * 60 * 1000;

export function PortfolioPage() {
  // A5 — taxa USD→BRL (manual, com data). Sem taxa, posições USD ficam fora dos totais.

  const { loading, data, finance, reload } = useEngineData(async (f) => {
    const { applyBenchmark, getCdiSeries, getAnnouncedDividends, upcomingDividends, dividendHistory } = await import('@apps/lib/db');
    const [fxRec, allocation, txs, histRec, cdi, announced, positions, accounts] = await Promise.all([
      getFxUSD(f.ds),
      f.wealth.allocation(),
      f.ds.transactions.list(),
      f.ds.meta.getKey(PORTFOLIO_HISTORY_KEY),
      getCdiSeries(f.ds),
      getAnnouncedDividends(f.ds),
      f.ds.positions.list(),
      f.ds.accounts.list(),
    ]);
    const fx = fxRec?.rate > 0 ? fxRec.rate : null;
    const portfolio = await f.wealth.portfolio(fx != null ? { fxUSD: fx } : {});
    const history = Array.isArray(histRec?.value) ? histRec.value : [];
    return {
      portfolio, allocation, dca: computeDcaFromTransactions(txs), history, cdi,
      benchmark: applyBenchmark(history, cdi), announced: upcomingDividends(announced), positions,
      dividends: dividendHistory(txs),
      accounts: accounts.filter((a) => a.kind === 'investment' || a.kind === 'crypto' || a.kind === 'wallet'),
    };
  });
  const financeRef = useRef(finance);
  financeRef.current = finance;
  const refreshingRef = useRef(false);
  const [quotes, setQuotes] = useState({ status: 'idle', at: null, failed: [], fromCache: [], count: 0, noFx: 0 });
  const { toast } = useToast();

  const doRefresh = useCallback(async () => {
    const f = financeRef.current;
    if (!f || refreshingRef.current) return;
    refreshingRef.current = true;
    setQuotes((s) => ({ ...s, status: 'refreshing' }));
    try {
      const [positions, fxRec] = await Promise.all([
        f.ds.positions.list(),
        getFxUSD(f.ds),
      ]);
      const fx = fxRec?.rate > 0 ? fxRec.rate : null;
      const symbols = [...new Set(positions.map((p) => p.symbol).filter(Boolean))];
      if (!symbols.length) {
        setQuotes({ status: 'idle', at: null, failed: [], fromCache: [], count: 0, noFx: 0 });
        return;
      }
      const { quotes: map, failed, fromCache } = await refreshQuotes(symbols);
      let applied = 0;
      let noFx = 0;
      const alertHits = [];
      const { evalAlertsForPrice, getFiredAlerts, markAlertFired } = await import('@apps/lib/db');
      const firedIds = (await getFiredAlerts(f.ds).catch(() => [])).map((x) => x.alertId);
      for (const p of positions) {
        const q = map.get(normalizeSymbol(p.symbol));
        if (!q) continue;
        // A5/A6 — marca na moeda da posição; converte pela taxa quando difere (nunca inventa).
        const posCur = p.currency ?? 'BRL';
        const qCur = q.currency ?? 'BRL';
        let price = q.price;
        if (qCur !== posCur) {
          if (fx == null) {
            noFx += 1;
            continue;
          }
          price = qCur === 'USD' ? q.price * fx : q.price / fx;
        }
        try {
          await f.wealth.markPosition(p.id, price);
          applied += 1;
          // A2 — avalia alertas no preço aplicado (1x até rearme).
          alertHits.push(...evalAlertsForPrice(p, price, firedIds));
        } catch {
          /* preço inválido: pula a posição, nunca quebra o lote */
        }
      }
      for (const hit of alertHits) {
        try {
          await markAlertFired(f.ds, hit);
          f.ds.bus.emit('price:alert', { ...hit, triggeredAt: new Date().toISOString() });
        } catch {
          /* alerta nunca quebra o refresh */
        }
      }
      if (alertHits.length > 0) {
        toast(
          alertHits.length === 1
            ? `Alerta de preço: ${alertHits[0].symbol} ${alertHits[0].dir === 'above' ? '≥' : '≤'} ${alertHits[0].price}`
            : `${alertHits.length} alertas de preço disparados.`,
          { type: 'warn', durationMs: 10000 },
        );
      }
      try {
        const pf = await f.wealth.portfolio();
        const rec = await f.ds.meta.getKey(PORTFOLIO_HISTORY_KEY);
        const hist = Array.isArray(rec?.value) ? rec.value : [];
        const lastAt = hist.length ? new Date(hist[hist.length - 1].at).getTime() : 0;
        if (!hist.length || Date.now() - lastAt >= PORTFOLIO_HISTORY_GAP_MS) {
          hist.push({ at: new Date().toISOString(), value: pf.totalValue, cost: pf.totalCost });
          await f.ds.meta.setKey(PORTFOLIO_HISTORY_KEY, hist.slice(-PORTFOLIO_HISTORY_MAX));
        }
      } catch {
        /* histórico é acessório: nunca quebra o refresh */
      }
      setQuotes({ status: 'idle', at: new Date().toISOString(), failed, fromCache, count: applied, noFx });
    } catch {
      setQuotes((s) => ({ ...s, status: 'idle' }));
    } finally {
      refreshingRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    if (!finance) return;
    financeRef.current = finance;
    doRefresh();
    const id = setInterval(doRefresh, PRICE_REFRESH_MS);
    return () => clearInterval(id);
  }, [finance, doRefresh]);

  const ageMin = quotes.at ? Math.max(0, Math.round((Date.now() - new Date(quotes.at).getTime()) / 60000)) : null;

  // A3 — CDI manual mensal (série para o benchmark).
  const [cdiYm, setCdiYm] = useState('');
  const [cdiPct, setCdiPct] = useState('');
  // Abas internas do Portfolio: Visão Geral | Posições | Proventos | Alertas | Configurar.
  const [ptab, setPtab] = useState('positions');
  const handleSaveCdi = useCallback(async () => {
    const f = financeRef.current;
    if (!f || !/^\d{4}-\d{2}$/.test(cdiYm) || !(Number(cdiPct) >= 0)) return;
    const { saveCdiPoint } = await import('@apps/lib/db');
    await saveCdiPoint(f.ds, cdiYm, Number(cdiPct));
    setCdiYm('');
    setCdiPct('');
  }, [cdiYm, cdiPct]);

  // A2 — alertas de preço: salvar/excluir/rearmar + ids disparados p/ UI.
  const [firedIds, setFiredIds] = useState([]);
  useEffect(() => {
    if (!finance) return;
    let alive = true;
    (async () => {
      try {
        const { getFiredAlerts } = await import('@apps/lib/db');
        const list = await getFiredAlerts(finance.ds);
        if (alive) setFiredIds(list.map((x) => x.alertId));
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance, quotes.at]);

  const handleSaveAlert = useCallback(async (row, alert) => {
    const f = financeRef.current;
    if (!f || !(alert.price > 0)) return;
    const positions = await f.ds.positions.list();
    const pos = positions.find((p) => p.id === row.id);
    if (!pos) return;
    const id = `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await f.ds.positions.put({
      ...pos,
      alerts: [...(pos.alerts ?? []), { id, dir: alert.dir === 'below' ? 'below' : 'above', price: alert.price }],
      updatedAt: new Date().toISOString(),
      version: (pos.version ?? 0) + 1,
    }, { source: 'local' });
  }, []);

  const handleDeleteAlert = useCallback(async (row, alertId) => {
    const f = financeRef.current;
    if (!f) return;
    const positions = await f.ds.positions.list();
    const pos = positions.find((p) => p.id === row.id);
    if (!pos) return;
    const { rearmAlert } = await import('@apps/lib/db');
    await f.ds.positions.put({
      ...pos,
      alerts: (pos.alerts ?? []).filter((a) => a.id !== alertId),
      updatedAt: new Date().toISOString(),
      version: (pos.version ?? 0) + 1,
    }, { source: 'local' });
    await rearmAlert(f.ds, alertId).catch(() => {});
    setFiredIds((prev) => prev.filter((x) => x !== alertId));
  }, []);

  const handleRearmAlert = useCallback(async (alertId) => {
    const f = financeRef.current;
    if (!f) return;
    const { rearmAlert } = await import('@apps/lib/db');
    await rearmAlert(f.ds, alertId).catch(() => {});
    setFiredIds((prev) => prev.filter((x) => x !== alertId));
  }, []);

  // B1 — anunciar / remover / receber provento (receber cria dividend via A1).
  const handleSaveDividendEvent = useCallback(async (ev) => {
    const f = financeRef.current;
    if (!f || !ev?.exDate) return;
    const { saveAnnouncedDividend } = await import('@apps/lib/db');
    const pos = (data?.positions ?? []).find((p) => p.id === ev.positionId);
    await saveAnnouncedDividend(f.ds, {
      id: `div-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      symbol: pos?.symbol ?? '',
      positionId: ev.positionId || undefined,
      exDate: ev.exDate,
      amountPerShare: ev.amountPerShare != null && ev.amountPerShare !== '' ? Number(ev.amountPerShare) : undefined,
      note: ev.note || undefined,
    });
  }, [data]);

  const handleRemoveDividendEvent = useCallback(async (id) => {
    const f = financeRef.current;
    if (!f) return;
    const { removeAnnouncedDividend } = await import('@apps/lib/db');
    await removeAnnouncedDividend(f.ds, id);
  }, []);

  const handleReceiveDividend = useCallback(async (ev) => {
    const f = financeRef.current;
    if (!f) return;
    const positions = await f.ds.positions.list();
    const pos = positions.find((p) => p.id === ev.positionId) ?? positions.find((p) => p.symbol === ev.symbol);
    if (!pos) return;
    const perShare = Number(ev.amountPerShare) || 0;
    const amount = Number((perShare * (pos.qty ?? 0)).toFixed(2));
    if (!(amount > 0)) return;
    await f.money.recordDividend({
      accountId: pos.accountId,
      positionId: pos.id,
      amount,
      currency: 'USD',
      note: `Provento ${pos.symbol} ex ${ev.exDate}`,
    });
    const { removeAnnouncedDividend } = await import('@apps/lib/db');
    await removeAnnouncedDividend(f.ds, ev.id);
  }, []);

  // A1 — registrar provento ligado à posição (entra no yield, sem mexer no custo).
  const handleDividend = useCallback(async (row, amount) => {
    const f = financeRef.current;
    if (!f || !(amount > 0)) return;
    const positions = await f.ds.positions.list();
    const pos = positions.find((p) => p.id === row.id);
    if (!pos) return;
    await f.money.recordDividend({
      accountId: pos.accountId,
      positionId: pos.id,
      amount,
      currency: 'USD',
      note: `Provento ${pos.symbol}`,
    });
  }, []);



  // Posições — CRUD (único writer DataService) + marcação manual + remoção.
  const handlePositionSave = useCallback(async (position) => {
    const f = financeRef.current;
    if (!f) return;
    const rec = { ...position, id: position.id || `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
    if (rec.lastMarkPrice != null) rec.lastMarkAt = new Date().toISOString();
    await f.ds.positions.put(rec, { source: 'local' });
    reload();
  }, [reload]);
  const handlePositionDelete = useCallback(async (id) => {
    const f = financeRef.current;
    if (!f) return;
    await f.ds.positions.remove(id);
    reload();
  }, [reload]);
  const handlePositionMark = useCallback(async (id, price) => {
    const f = financeRef.current;
    if (!f) return;
    await f.wealth.markPosition(id, price);
    reload();
  }, [reload]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Portfolio</h1>
        <button className="cmd-refresh" onClick={doRefresh} disabled={quotes.status === 'refreshing'}>
          {quotes.status === 'refreshing' ? 'Atualizando…' : 'Atualizar preços'}
        </button>
      </div>
      <ModuleTabs module="investimentos" />
      <nav className="ws-tabs" aria-label="Seções do portfolio">
        {[['positions', 'Posições'], ['income', 'Proventos'], ['alerts', 'Alertas'], ['config', 'Configurar']].map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`ws-tab${ptab === k ? ' active' : ''}`}
            aria-pressed={ptab === k}
            onClick={() => setPtab(k)}
          >
            {label}
          </button>
        ))}
      </nav>

      {quotes.at && (
        <div className="cmd-msg" role="status">
          preços ao vivo {ageMin === 0 ? 'agora' : `há ${ageMin} min`} • {quotes.count} posições
          {quotes.fromCache.length > 0 && ` • ${quotes.fromCache.length} do cache`}
          {quotes.failed.length > 0 && ` • sem preço: ${quotes.failed.join(', ')}`}
        </div>
      )}
      {data?.portfolio?.unconverted > 0 && (
        <div className="cmd-warn" role="note">
          ⚠️ {data.portfolio.unconverted} posição(ões) USD fora dos totais — informe a taxa em Configurar.
        </div>
      )}

      {ptab === 'positions' && (
        <Positions
          positions={data?.positions ?? []}
          accounts={data?.accounts ?? []}
          loading={loading}
          onSave={handlePositionSave}
          onMark={handlePositionMark}
          onDelete={handlePositionDelete}
        />
      )}

      {ptab === 'income' && (
        <Portfolio
          rows={data?.portfolio?.rows ?? []}
          summary={data?.portfolio ?? null}
          allocation={null}
          history={[]}
          benchmark={[]}
          loading={loading}
          announced={data?.announced ?? []}
          dividends={data?.dividends ?? []}
          positions={data?.positions ?? []}
          onReceiveDividend={handleReceiveDividend}
          onSaveDividendEvent={handleSaveDividendEvent}
          onRemoveDividendEvent={handleRemoveDividendEvent}
          onDividend={handleDividend}
          only={['income', 'positions']}
        />
      )}

      {ptab === 'alerts' && (
        <Portfolio
          rows={data?.portfolio?.rows ?? []}
          summary={null}
          allocation={null}
          history={[]}
          benchmark={[]}
          loading={loading}
          onSaveAlert={handleSaveAlert}
          onDeleteAlert={handleDeleteAlert}
          onRearmAlert={handleRearmAlert}
          firedAlertIds={firedIds}
          only={['alerts', 'positions']}
        />
      )}

      {ptab === 'config' && (
        <div className="pf-config">
          {/* Câmbio USD→BRL agora é ÚNICO: definido em Settings → Moeda (e mostrado na
              Home). Aqui só informamos o valor em uso, sem campo duplicado. */}
          <div className="cfg-card">
            <div className="cfg-title">Câmbio USD → BRL</div>
            <p className="cfg-hint">
              Definido em <b>Settings → Moeda</b> (é o mesmo usado na navbar, na Home e nos cálculos).
              {data?.fx != null ? ` Em uso: ${data.fx}` : ''}
            </p>
          </div>

          <div className="cfg-card">
            <div className="cfg-title">CDI mensal (benchmark)</div>
            <p className="cfg-hint">Série para comparar a evolução do portfolio com o CDI ({(data?.cdi ?? []).length} meses).</p>
            <div className="cfg-row">
              <input
                className="cmd-select" style={{ maxWidth: 120 }}
                value={cdiYm} onChange={(e) => setCdiYm(e.target.value)}
                placeholder="AAAA-MM" aria-label="Mês do CDI (AAAA-MM)"
              />
              <input
                className="cmd-select" style={{ maxWidth: 110 }}
                type="number" min="0" step="0.0001" value={cdiPct}
                onChange={(e) => setCdiPct(e.target.value)}
                placeholder="ex.: 0.0087" aria-label="CDI mensal (decimal)"
              />
              <button className="cmd-refresh" onClick={handleSaveCdi}>Adicionar CDI</button>
            </div>
          </div>

          <div className="cfg-card">
            <div className="cfg-title">Acompanhamento</div>
            <p className="cfg-hint">Cadastre as posições em <b>Posições</b> (ativo, quantidade, preço médio, moeda, renda fixa). Alocação e % são derivadas automaticamente do que você cadastra.</p>
            <button className="cmd-refresh" onClick={() => setPtab('positions')}>Ir para Posições</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WalletsPage() {
  const { loading, data } = useEngineData((f) => f.money.walletSummary());
  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Wallets</h1></div>
      <ModuleTabs module="dinheiro" />
      <Wallets rows={data ?? []} loading={loading} />
    </div>
  );
}

// A4 — vendas de ativos no mês com base FIFO + sugestão de reserva de IR.
// Registrar aqui cria a transaction (buy/sell com asset); a reserva é um botão
// explícito por venda (sugerir, nunca lançar sozinho).
function AssetSalesSection({ finance }) {
  const ym = nowIso().slice(0, 7);
  const [txs, setTxs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ side: 'sell', symbol: '', qty: '', price: '', date: '', accountId: '' });
  const [reserveFor, setReserveFor] = useState('');

  const load = useCallback(async () => {
    if (!finance) return;
    const [t, a] = await Promise.all([finance.ds.transactions.list(), finance.ds.accounts.list()]);
    setTxs(t);
    setAccounts(a);
  }, [finance]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', load);
    return off;
  }, [finance, load]);

  const sales = useMemo(() => stockSalesTaxBase(txs, ym), [txs, ym]);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleRecord = useCallback(async () => {
    if (!finance) return;
    const qty = Number(form.qty);
    const price = Number(form.price);
    if (!form.symbol.trim() || !(qty > 0) || !(price > 0) || !form.accountId) return;
    await finance.money.recordTradeAsset(form.side, {
      accountId: form.accountId,
      amount: qty * price,
      currency: 'BRL',
      date: form.date ? new Date(form.date).toISOString() : undefined,
      asset: { symbol: form.symbol.trim().toUpperCase(), qty, price },
      note: `${form.side === 'sell' ? 'Venda' : 'Compra'} ${form.symbol.trim().toUpperCase()}`,
    });
    setForm({ side: 'sell', symbol: '', qty: '', price: '', date: '', accountId: form.accountId });
    load();
  }, [finance, form, load]);

  const handleReserve = useCallback(async (sale) => {
    if (!finance || sale.gain == null || !(sale.gain > 0)) return;
    const accountId = reserveFor || accounts[0]?.id;
    if (!accountId) return;
    await finance.money.recordTaxReserve({
      accountId,
      amount: Number((sale.gain * 0.15).toFixed(2)),
      currency: 'BRL',
      note: `IR swing ${ym} ${sale.symbol}`,
    });
    load();
  }, [finance, reserveFor, accounts, ym, load]);

  return (
    <div className="cmd-msg" role="group" aria-label="Vendas de ativos e IR" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b>Vendas de ativos no mês (FIFO) — IR 15% swing</b>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="cmd-select" value={form.side} onChange={(e) => setF('side', e.target.value)} aria-label="Compra ou venda" style={{ maxWidth: 110 }}>
          <option value="sell">Venda</option>
          <option value="buy">Compra</option>
        </select>
        <input className="cmd-select" style={{ maxWidth: 110 }} value={form.symbol} onChange={(e) => setF('symbol', e.target.value)} placeholder="VALE3" aria-label="Símbolo" />
        <input className="cmd-select" style={{ maxWidth: 90 }} type="number" min="0" value={form.qty} onChange={(e) => setF('qty', e.target.value)} placeholder="Qtd" aria-label="Quantidade" />
        <input className="cmd-select" style={{ maxWidth: 110 }} type="number" min="0" step="0.01" value={form.price} onChange={(e) => setF('price', e.target.value)} placeholder="Preço" aria-label="Preço" />
        <input className="cmd-select" style={{ maxWidth: 150 }} type="date" value={form.date} onChange={(e) => setF('date', e.target.value)} aria-label="Data" />
        <select className="cmd-select" value={form.accountId} onChange={(e) => setF('accountId', e.target.value)} aria-label="Conta" style={{ maxWidth: 150 }}>
          <option value="">Conta…</option>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
        </select>
        <button className="cmd-refresh" onClick={handleRecord}>Registrar</button>
      </div>
      {sales.sales.length === 0 ? (
        <span>Nenhuma venda no mês. Ganho tributável: R$ 0.</span>
      ) : (
        <>
          {sales.sales.map((s, i) => (
            <div key={`${s.symbol}-${s.date}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <span><b>{s.symbol}</b> {s.qty} un · base {s.cost != null ? `R$ ${s.cost}` : '—'}</span>
              <span style={{ color: (s.gain ?? 0) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                {s.gain == null ? 'sem dados FIFO' : `ganho R$ ${s.gain}`}
              </span>
              {s.gain != null && s.gain > 0 && (
                <button className="cmd-refresh" onClick={() => handleReserve(s)}>Reservar 15% (R$ {(s.gain * 0.15).toFixed(2)})</button>
              )}
            </div>
          ))}
          <span><b>Ganho total no mês: R$ {sales.monthGain}</b> → IR estimado 15%: <b>R$ {(sales.monthGain * 0.15).toFixed(2)}</b></span>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            Conta da reserva:
            <select className="cmd-select" value={reserveFor} onChange={(e) => setReserveFor(e.target.value)} aria-label="Conta da reserva" style={{ maxWidth: 150 }}>
              <option value="">(primeira conta)</option>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}

export function TaxPage() {
  const { period, setPeriod } = usePeriod();
  // Tax é mensal: usa o mês do período (ou o mês final do intervalo) como referência.
  const ym = (period.mode === 'month' ? period.ym : period.mode === 'range' ? (period.to || period.from) : null) || nowIso().slice(0, 7);
  const { loading, data, finance, reload } = useEngineData((f) => f.money.taxCockpit(ym));
  useEffect(() => { reload(); }, [ym, reload]);
  const handleExportCSV = useCallback(() => {
    if (!data) return;
    const rows = [
      ['mes', ym],
      ['dayNet', data.dayNet],
      ['swingNet', data.swingNet],
      ['fees', data.fees],
      ['dayTaxable', data.dayTaxable],
      ['swingTaxable', data.swingTaxable],
      ['dayTax', data.dayTax],
      ['swingTax', data.swingTax],
      ['estTax', data.estTax],
      ['carryDay', data.carryAfter?.day],
      ['carrySwing', data.carryAfter?.swing],
      ['darfDeadline', data.darfDeadline ?? ''],
    ];
    const csv = rows.map(([k, v]) => `${k},${v ?? ''}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-${ym}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, ym]);
  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Tax Cockpit</h1></div>
      <ModuleTabs module="gastos" />
      <PeriodPicker period={period} onChange={setPeriod} />
      <TaxCockpit cockpit={data} yearMonth={ym} loading={loading} onExportCSV={handleExportCSV} />
      <AssetSalesSection finance={finance} />
    </div>
  );
}

export function ForecastPage() {
  const { loading, data, finance, reload } = useEngineData(async (f) => {
    const [forecast, safeAvailable, inputs, nw] = await Promise.all([
      f.wealth.forecast(),
      f.wealth.safeAvailable(),
      f.wealth.monthlyInputs(),
      f.wealth.netWorth(),
    ]);
    return { forecast, safeAvailable, inputs, cash: nw.components.cash };
  });
  const financeRef = useRef(finance);
  financeRef.current = finance;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.inputs && form === null) setForm(data.inputs);
  }, [data, form]);

  const setF = (k, v) => setForm((f) => ({ ...(f ?? {}), [k]: Number(v) || 0 }));
  const onSave = useCallback(async () => {
    const f = financeRef.current;
    if (!f || !form) return;
    setSaving(true);
    try {
      await f.wealth.setMonthlyInputs(form);
      reload();
    } finally {
      setSaving(false);
    }
  }, [form, reload]);

  const forecast = data?.forecast;
  const net = forecast?.netMonthly ?? 0;

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Forecast</h1></div>
      <ModuleTabs module="gastos" />

      <div className="dash-cards">
        <div className="card accent3">
          <h3>Caixa hoje</h3>
          <div className="stat">{fmtMoney(data?.cash ?? forecast?.today, 'BRL')}</div>
          <div className="muted">cash derivado</div>
        </div>
        <div className={`card ${net >= 0 ? 'accent1' : 'accent2'}`}>
          <h3>Fluxo mensal</h3>
          <div className="stat">{fmtMoney(net, 'BRL')}</div>
          <div className="muted">líquido/mês</div>
        </div>
        <div className="card accent4">
          <h3>Safe Available</h3>
          <div className="stat">{fmtMoney(data?.safeAvailable, 'BRL')}</div>
          <div className="muted">posso comprar isso?</div>
        </div>
        <div className="card accent5">
          <h3>Em 90 dias</h3>
          <div className="stat">{fmtMoney(forecast?.d90, 'BRL')}</div>
          <div className="muted">projeção</div>
        </div>
      </div>

      <div className="dash-section">
        <div className="dash-title"><span>Parâmetros mensais</span></div>
        {form && (
          <div className="fc-inputs">
            <label className="fc-field"><span>Renda mensal</span><input className="cmd-select" type="number" value={form.monthlyIncome} onChange={(e) => setF('monthlyIncome', e.target.value)} /></label>
            <label className="fc-field"><span>Contas fixas</span><input className="cmd-select" type="number" value={form.monthlyBills} onChange={(e) => setF('monthlyBills', e.target.value)} /></label>
            <label className="fc-field"><span>Reserva de imposto/mês</span><input className="cmd-select" type="number" value={form.monthlyTaxReserve} onChange={(e) => setF('monthlyTaxReserve', e.target.value)} /></label>
            <label className="fc-field"><span>Aportes/mês</span><input className="cmd-select" type="number" value={form.monthlyContributions} onChange={(e) => setF('monthlyContributions', e.target.value)} /></label>
            <label className="fc-field"><span>Contas 30d</span><input className="cmd-select" type="number" value={form.next30dBills} onChange={(e) => setF('next30dBills', e.target.value)} /></label>
            <label className="fc-field"><span>Reserva imposto</span><input className="cmd-select" type="number" value={form.taxReserve} onChange={(e) => setF('taxReserve', e.target.value)} /></label>
            <button className="cmd-refresh" onClick={onSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar e recalcular'}</button>
          </div>
        )}
      </div>

      <Forecast forecast={forecast} safeAvailable={data?.safeAvailable} loading={loading} />
    </div>
  );
}

export function FirmPnlPage() {
  const { loading, data, finance } = useEngineData(async (f) => {
    const [txs, accounts] = await Promise.all([
      f.ds.transactions.list(),
      f.ds.accounts.list(),
    ]);
    const rows = firmPnlByFirm(txs);
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    const byAccount = {};
    for (const r of rows) {
      const per = computeFirmPnlByAccount(txs, r.firmId);
      byAccount[r.firmId] = Object.entries(per).map(([accountId, v]) => ({
        accountId,
        accountName: names.get(accountId) ?? accountId,
        ...v,
      }));
    }
    return { rows, byAccount, history: firmPnlHistory(txs, 6) };
  });
  const financeRef = useRef(finance);
  financeRef.current = finance;

  // A4 — relatório da firm (contador/IR): CSV por (firm, conta) + total, com BRL.
  const handleExportReport = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    const [txs, accounts] = await Promise.all([
      f.ds.transactions.list(),
      f.ds.accounts.list(),
    ]);
    const { firmPnlReport } = await import('@apps/lib/db');
    const rows = firmPnlReport(
      txs,
      accounts.map((a) => ({ id: a.id, name: a.name })),
    );
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['firm', 'account', 'payouts', 'costs', 'fees', 'rebates', 'profit', 'brl_profit', 'txs'].join(',');
    const lines = rows.map((r) => [
      r.firmId, r.accountName, r.payouts, r.costs, r.fees, r.rebates, r.profit, r.brlProfit, r.txCount,
    ].map(esc).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firm-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);
  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Firm P&L</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh no-print" onClick={handleExportReport}>Exportar relatório</button>
          <button className="cmd-refresh no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <ModuleTabs module="contas" />
      <FirmPnl rows={data?.rows ?? []} byAccount={data?.byAccount ?? {}} history={data?.history ?? null} loading={loading} />
    </div>
  );
}

export function ExpensesPage() {
  const { loading, data, finance } = useEngineData(async (f) => {
    const { getSavingsGoal, getRolloverCats } = await import('@apps/lib/db');
    const [txs, accounts, categories, budgets, savingsGoal, rolloverCats, cards] = await Promise.all([
      f.ds.transactions.list(),
      f.ds.accounts.list(),
      listCategories(f.ds),
      getBudgets(f.ds),
      getSavingsGoal(f.ds),
      getRolloverCats(f.ds),
      f.ds.cards.list(),
    ]);
    return { txs, accounts, categories, budgets, savingsGoal, rolloverCats, cards };
  });
  const financeRef = useRef(finance);
  financeRef.current = finance;

  // G8 — editar/deletar/restaurar via MoneyService (bus recarrega sozinho).
  const onAdd = useCallback(async (input) => {
    const f = financeRef.current;
    if (!f) return;
    if (input.kind === 'income') {
      await f.money.recordIncome({ accountId: input.accountId, amount: input.amount, currency: 'BRL', date: input.date, note: input.note });
    } else {
      // #1 — repassa TODOS os campos do form (cartão/contas a pagar/parcela/anexos/tags).
      await f.money.recordExpense({
        accountId: input.accountId, amount: input.amount, currency: 'BRL',
        category: input.category, date: input.date, note: input.note, recurrence: input.recurrence,
        attachments: input.attachments, paid: input.paid, dueDate: input.dueDate,
        card: input.card, cardId: input.cardId, tags: input.tags, installments: input.installments,
      });
    }
  }, []);

  const onUpdate = useCallback(async (id, patch) => {
    const f = financeRef.current;
    if (!f) return;
    await f.money.updateTransaction(id, patch);
  }, []);

  const onDelete = useCallback(async (id) => {
    const f = financeRef.current;
    if (!f) return;
    await f.money.removeTransaction(id);
  }, []);

  const onRestore = useCallback(async (tx) => {
    const f = financeRef.current;
    if (!f || !tx) return;
    await f.ds.transactions.put({ ...tx, updatedAt: new Date().toISOString() }, { source: 'local' });
  }, []);

  const onSaveBudget = useCallback(async (ym, catId, amount) => {
    const f = financeRef.current;
    if (!f) return;
    await saveBudget(f.ds, ym, catId, amount);
  }, []);

  const onSaveCategory = useCallback(async (cat) => {
    const f = financeRef.current;
    if (!f) return;
    await saveCategory(f.ds, cat);
  }, []);

  const onGenerate = useCallback(async (templateId, ym) => {
    const f = financeRef.current;
    if (!f) return;
    await f.money.generateRecurring(templateId, ym);
  }, []);

  // A1 — tornar recorrente (marca template com dia sugerido).
  const onMakeRecurring = useCallback(async (id, day) => {
    const f = financeRef.current;
    if (!f) return;
    await f.money.updateTransaction(id, { recurrence: { freq: 'monthly', day } });
  }, []);

  // B1 — opt-in/out de rollover por categoria.
  const onToggleRollover = useCallback(async (catId) => {
    const f = financeRef.current;
    if (!f) return;
    const { getRolloverCats, setRolloverCats } = await import('@apps/lib/db');
    const cur = await getRolloverCats(f.ds);
    await setRolloverCats(f.ds, cur.includes(catId) ? cur.filter((c) => c !== catId) : [...cur, catId]);
  }, []);

  // A4 — meta de economia mensal.
  const onSaveSavingsGoal = useCallback(async (ym, amount) => {
    const f = financeRef.current;
    if (!f) return;
    const { saveSavingsGoal } = await import('@apps/lib/db');
    await saveSavingsGoal(f.ds, ym, amount);
  }, []);

  // A3 — importa lote do extrato (despesa/ganho por sinal, categoria confirmada).
  const onImportBatch = useCallback(async (entries) => {
    const f = financeRef.current;
    if (!f || !entries?.length) return;
    const accounts = await f.ds.accounts.list();
    const accountId = accounts[0]?.id;
    if (!accountId) return;
    for (const en of entries) {
      if (en.kind === 'income') {
        await f.money.recordIncome({
          accountId, amount: Math.abs(en.amount), currency: 'BRL',
          date: en.date, note: en.description,
        });
      } else {
        await f.money.recordExpense({
          accountId, amount: Math.abs(en.amount), currency: 'BRL',
          category: en.categoryId ?? undefined, date: en.date, note: en.description,
        });
      }
    }
  }, []);

  // D2 — parcelamento (N despesas mensais, contas a pagar).
  const onAddInstallments = useCallback(async (input) => {
    const f = financeRef.current;
    if (!f) return;
    await f.money.recordInstallments(input);
  }, []);

  // D5 — transferência entre carteiras (débito na origem + crédito no destino).
  const onTransfer = useCallback(async (input) => {
    const f = financeRef.current;
    if (!f) return;
    await f.money.recordTransferBetween(input);
  }, []);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Lançamentos</h1></div>
      <ModuleTabs module="gastos" />
      <Expenses
        txs={data?.txs ?? []}
        categories={data?.categories ?? []}
        budgets={data?.budgets ?? {}}
        savingsGoal={data?.savingsGoal ?? {}}
        accounts={data?.accounts ?? []}
        cards={data?.cards ?? []}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onRestore={onRestore}
        onSaveBudget={onSaveBudget}
        onMakeRecurring={onMakeRecurring}
        onSaveSavingsGoal={onSaveSavingsGoal}
        onImportBatch={onImportBatch}
        onAddInstallments={onAddInstallments}
        onTransfer={onTransfer}
        rolloverCats={data?.rolloverCats ?? []}
        onToggleRollover={onToggleRollover}
        onSaveCategory={onSaveCategory}
        onGenerate={onGenerate}
        loading={loading}
      />
    </div>
  );
}

export function FinancialJournalPage() {
  const { loading, data, finance, reload } = useEngineData(async (f) => {
    const [suggested, confirmed] = await Promise.all([f.wealth.suggestJournalEvents(), f.wealth.listJournalEvents()]);
    // Unifica: eventos sugeridos (não confirmados) + confirmados.
    const confirmedIds = new Set(confirmed.map((e) => e.id));
    const events = [
      ...suggested.filter((e) => !confirmedIds.has(e.id)),
      ...confirmed,
    ];
    return events.sort((a, b) => b.date.localeCompare(a.date));
  });
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const onConfirm = useCallback(
    async (event) => {
      if (!finance) return;
      try {
        await finance.wealth.confirmJournalEvent(event);
        reload();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[journal] falha ao confirmar evento', err);
      }
    },
    [finance, reload],
  );

  const [form, setForm] = useState({ title: '', date: new Date().toISOString().slice(0, 10), amount: '', note: '' });

  const onCreate = useCallback(async () => {
    const f = financeRef.current;
    if (!f || !form.title.trim()) return;
    await f.wealth.createJournalEvent({
      date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
      title: form.title,
      amount: form.amount ? Number(form.amount) : undefined,
      note: form.note.trim() || undefined,
    });
    setForm({ title: '', date: new Date().toISOString().slice(0, 10), amount: '', note: '' });
    reload();
  }, [form, reload]);

  const onDelete = useCallback(async (id) => {
    const f = financeRef.current;
    if (!f) return;
    await f.wealth.removeJournalEvent(id);
    reload();
  }, [reload]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Marcos</h1></div>
      <ModuleTabs module="planejamento" />
      <div className="mj-new">
        <div className="mj-new-title">Novo marco</div>
        <div className="mj-new-grid">
          <input className="cmd-select" style={{ maxWidth: 'none' }} placeholder="Título (ex.: primeiro payout 10k)" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} aria-label="Título do marco" />
          <input className="cmd-select" type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} aria-label="Data do marco" />
          <input className="cmd-select" type="number" placeholder="Valor (opcional)" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} aria-label="Valor do marco" />
          <input className="cmd-select" style={{ maxWidth: 'none' }} placeholder="Nota (opcional)" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} aria-label="Nota do marco" />
          <button className="cmd-refresh" onClick={onCreate} disabled={!form.title.trim()}>Adicionar</button>
        </div>
      </div>
      <FinancialJournal events={data ?? []} onConfirm={onConfirm} onDelete={onDelete} loading={loading} />
    </div>
  );
}
