// STAGE 6 — CalendarPage. Container do Financial Calendar. Busca dos motores:
// trades (por dia), transactions (bills/tax), payouts, e overlay econômico via API
// free (FOMC/CPI). Usa `tradePnl` (fórmula única) pra PnL por dia — nada de fórmula nova.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Financial Calendar) + 01-tasks.md (T6.2).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FinancialCalendar from '@apps/ui/FinancialCalendar';
import ModuleTabs from '../../ModuleTabs';
import { useFinance } from '@apps/state';
import { fetchEconomicEvents, monthRange, tradePnl, nowIso } from '@apps/lib/db';

const LAYER_IDS = ['trading', 'economic', 'bills', 'payouts', 'tax'];

export default function CalendarPage() {
  const finance = useFinance();
  const [yearMonth, setYearMonth] = useState(() => nowIso().slice(0, 7));
  const [activeLayers, setActiveLayers] = useState(() => new Set(LAYER_IDS));
  const [trading, setTrading] = useState([]);
  const [bills, setBills] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [tax, setTax] = useState([]);
  const [economic, setEconomic] = useState([]);
  const [economicLoading, setEconomicLoading] = useState(false);
  const [economicError, setEconomicError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshCalendar = useCallback(async () => {
    if (!finance) return;
    setLoading(true);
    try {
      const [trades, transactions, payoutList] = await Promise.all([
        finance.ds.trades.list(),
        finance.ds.transactions.list(),
        finance.ds.payouts.list(),
      ]);

      // Trading por dia (PnL usa tradePnl — fórmula única dos motores).
      const byDay = new Map();
      for (const t of trades) {
        if (t.exitPrice == null) continue;
        const day = (t.exitDatetime ?? t.entryDatetime).slice(0, 10);
        const cur = byDay.get(day) ?? { pnl: 0, trades: 0 };
        cur.pnl += tradePnl(t);
        cur.trades += 1;
        byDay.set(day, cur);
      }
      setTrading([...byDay.entries()].map(([date, v]) => ({ date, pnl: Number(v.pnl.toFixed(2)), trades: v.trades })));

      // Bills = despesas; Tax = tax_reserve; Payouts = payout_in (após a alocação).
      const billsArr = [];
      const taxArr = [];
      for (const tx of transactions) {
        if (tx.kind === 'expense') billsArr.push({ date: tx.date, amount: Math.abs(tx.amount), label: tx.note });
        else if (tx.kind === 'tax_reserve') taxArr.push({ date: tx.date, amount: Math.abs(tx.amount), label: tx.note });
      }
      setBills(billsArr);
      setTax(taxArr);

      setPayouts(payoutList.map((p) => ({ date: p.date ?? p.updatedAt, amount: p.net ?? 0, status: p.status })));
    } finally {
      setLoading(false);
    }
  }, [finance]);

  // Econômico (API free) — best-effort + cache.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setEconomicLoading(true);
      try {
        const { from, to } = monthRange(yearMonth);
        const events = await fetchEconomicEvents(from, to);
        if (!cancelled) {
          setEconomic(events);
          setEconomicError(null);
        }
      } catch {
        if (!cancelled) setEconomicError('indisponível');
      } finally {
        if (!cancelled) setEconomicLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [yearMonth]);

  useEffect(() => {
    refreshCalendar();
  }, [refreshCalendar]);

  const prevMonth = useCallback(() => {
    setYearMonth((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 2, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setYearMonth((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const d = new Date(Date.UTC(y, m, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const toggleLayer = useCallback((id) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const activeLayersArray = useMemo(() => [...activeLayers], [activeLayers]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Financial Calendar</h1>
      </div>
      <ModuleTabs module="home" />
      <FinancialCalendar
        yearMonth={yearMonth}
        trading={trading}
        economic={economic}
        bills={bills}
        payouts={payouts}
        tax={tax}
        loading={loading}
        economicLoading={economicLoading}
        economicError={economicError}
        activeLayers={activeLayersArray}
        onToggleLayer={toggleLayer}
        onPrevMonth={prevMonth}
        onNextMonth={nextMonth}
      />
    </div>
  );
}
