// Batch D — Relatórios v1 (audit UX P2). COMPOSIÇÃO PURA: só lê selectors dos
// motores (`firmPnlHistory`, `freeCash`, `taxCockpit`, `netWorth`) e exibe +
// exporta. Nenhum número novo, nenhum writer.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { firmPnlHistory } from '@apps/lib/db';
import {
  ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';

const FIRM_COLORS = ['#7c5cff', '#2ecc71', '#3498db', '#e1b12c', '#e74c3c', '#a855f7', '#22d3ee'];


const ymLabel = (ym) => `${String(ym).slice(5, 7)}/${String(ym).slice(2, 4)}`;

export default function ReportsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const financeRef = useRef(finance);
  financeRef.current = finance;

  const load = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    setLoading(true);
    try {
      const [txs, nw] = await Promise.all([f.ds.transactions.list(), f.wealth.netWorth()]);
      const history = firmPnlHistory(txs, 6);
      const perMonth = [];
      for (const ym of history.months) {
        const [fc, tax] = await Promise.all([f.money.freeCash(ym), f.money.taxCockpit(ym)]);
        const firmTotal = history.rows
          .filter((r) => r.ym === ym)
          .reduce((s, r) => s + Object.entries(r).reduce((a, [k, v]) => (k === 'ym' ? a : a + (Number(v) || 0)), 0), 0);
        perMonth.push({ ym, freeCash: fc.freeCash, income: fc.income, expenses: fc.expenses, estTax: tax.estTax, firmTotal });
      }
      setData({ history, perMonth, netWorth: nw?.netWorth ?? null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', load);
    return off;
  }, [finance, load]);

  const handleExportCSV = useCallback(() => {
    if (!data) return;
    const head = 'mes,firm_pnl,receitas,despesas,free_cash,ir_est';
    const lines = data.perMonth.map((m) => [m.ym, m.firmTotal, m.income, m.expenses, m.freeCash, m.estTax].join(','));
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-6m-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Relatório exportado.');
  }, [data, toast]);

  const months = data?.history?.months ?? [];
  const firms = data?.history?.firms ?? [];
  const chartRows = (data?.history?.rows ?? []).map((r) => ({ ...r, ym: ymLabel(String(r.ym)) }));

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Relatórios</h1>
        <div className="cmd-actions">
          <button className="cmd-refresh" onClick={handleExportCSV} disabled={!data}>Exportar CSV</button>
          <button className="cmd-refresh no-print" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="cmd-msg">Carregando relatório…</div>
      ) : !data ? (
        <div role="status" className="cmd-msg">Sem dados.</div>
      ) : (
        <>
          <div className="rp-cards">
            <div className="card accent3">
              <h3>Patrimônio atual</h3>
              <div className="stat">{fmtMoney(data.netWorth)}</div>
            </div>
            <div className="card accent1">
              <h3>Firm P&L (6m)</h3>
              <div className="stat">{fmtMoney(data.perMonth.reduce((s, m) => s + m.firmTotal, 0))}</div>
            </div>
            <div className="card accent4">
              <h3>IR estimado (6m)</h3>
              <div className="stat">{fmtMoney(data.perMonth.reduce((s, m) => s + m.estTax, 0))}</div>
            </div>
          </div>

          {chartRows.length > 0 && firms.length > 0 && (
            <div className="rp-chart" role="img" aria-label="Firm P&L mensal por firm">
              <div className="rp-chart-title">Firm P&L mensal</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartRows} margin={{ left: -4, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#a1a7b3' }}
                    width={56}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                  />
                  <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {firms.map((firmId, i) => (
                    <Bar key={firmId} dataKey={firmId} stackId="pnl" fill={FIRM_COLORS[i % FIRM_COLORS.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="rp-chart-title">Fechamento mensal (6m)</caption>
              <thead>
                <tr>
                  <th scope="col">Mês</th>
                  <th scope="col">Firm P&L</th>
                  <th scope="col">Receitas</th>
                  <th scope="col">Despesas</th>
                  <th scope="col">Free cash</th>
                  <th scope="col">IR est.</th>
                </tr>
              </thead>
              <tbody>
                {data.perMonth.map((m) => (
                  <tr key={m.ym}>
                    <th scope="row">{ymLabel(m.ym)}</th>
                    <td>{fmtMoney(m.firmTotal)}</td>
                    <td>{fmtMoney(m.income)}</td>
                    <td>{fmtMoney(m.expenses)}</td>
                    <td>{fmtMoney(m.freeCash)}</td>
                    <td>{fmtMoney(m.estTax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const RP_CSS = `
.rp-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.rp-cards .card { margin-bottom: 0; }
.rp-chart { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); margin-bottom: 14px; }
.rp-chart-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.rp-table-wrap { overflow-x: auto; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.rp-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.rp-table caption { text-align: left; }
.rp-table th, .rp-table td { padding: 8px 10px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.06); }
.rp-table th:first-child, .rp-table td:first-child { text-align: left; }
.rp-table thead th { color: var(--muted, #a1a7b3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
@media (max-width: 719px) { .rp-cards { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('rp-styles')) {
  const style = document.createElement('style');
  style.id = 'rp-styles';
  style.textContent = RP_CSS;
  document.head.appendChild(style);
}
