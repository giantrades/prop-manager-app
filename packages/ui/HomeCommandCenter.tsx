// HomeCommandCenter — cockpit (COMPOSIÇÃO PURA). Mostra o gráfico principal de cada
// módulo (Trading, Gastos, Investimentos, Contas/Payouts, Metas) + Ações + Calendário.
// Nenhum cálculo financeiro aqui: só lê o snapshot do Command Center.
import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, ReferenceDot,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Activity, Receipt, TrendingUp, Wallet, Target, Bell, CalendarDays } from 'lucide-react';
import { fmtMoney as fmtMoneyShared } from './currency';
import WidgetGrid from './WidgetGrid';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }

const WIDGET_ICONS = { risk: Activity, money: Receipt, investments: TrendingUp, payouts: Wallet, goals: Target, actions: Bell, calendar: CalendarDays };

function fmtPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  const v = value * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}
const shortYm = (ym) => `${String(ym).slice(5, 7)}/${String(ym).slice(2, 4)}`;
const tip = { background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 };
const kfmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`);
const PALETTE = ['#7c5cff', '#2ecc71', '#3498db', '#e1b12c', '#e74c3c', '#a855f7', '#22d3ee', '#f59e0b'];
const CLASS_COLORS = { equity: '#7c5cff', crypto: '#f7931a', fixed: '#3498db', other: '#e1b12c', cash: '#2ecc71' };
const CAT_COLORS = { blue: '#3498db', green: '#2ecc71', yellow: '#e1b12c', red: '#e74c3c', brand: '#7c5cff', gray: '#8b94a5' };

function Widget({ id, title, to = null, hide, children }) {
  if (hide(id)) return null;
  const Icon = WIDGET_ICONS[id];
  return (
    <section className="hc-widget" aria-label={title}>
      <div className="hc-widget-head">
        <h3 className="hc-widget-title">{Icon && <Icon size={14} strokeWidth={2.2} />} {title}</h3>
        {to && <a className="hc-widget-link" href={to}>abrir</a>}
      </div>
      {children}
    </section>
  );
}

export default function HomeCommandCenter({ snapshot = null, actions = [], insights = [], calendar = { events: [], holidays: [] }, loading = false, hidden = [] }) {
  const hide = (id) => (hidden || []).includes(id);
  if (loading || !snapshot) {
    return (
      <div className="hc-root hc-loading" role="status" aria-live="polite">
        <div className="hc-skeleton" /><div className="hc-skeleton" /><div className="hc-skeleton" />
        <span className="hc-screen-reader">Carregando Command Center…</span>
      </div>
    );
  }

  const nw = snapshot.netWorth;
  const risk = snapshot.risk;
  const portfolio = snapshot.portfolio;
  const goals = snapshot.goals ?? [];
  const cashflow = snapshot.cashflowSeries ?? [];
  const trading = snapshot.tradingSeries ?? [];
  const history = snapshot.portfolioHistory ?? [];
  const pending = snapshot.pendingPayouts ?? [];
  const firms = (snapshot.firmPnl ?? []).filter((f) => f.profit !== 0).slice(0, 4);
  const catList = (snapshot.categories ?? []) as Array<{ id: string; name: string; color?: string }>;
  const catById = new Map<string, { name: string; color?: string }>(catList.map((c) => [c.id, c]));
  const expensePie = (snapshot.expensesByCategory ?? []).slice(0, 7).map((g, i) => {
    const c = catById.get(g.categoryId);
    return { name: c?.name ?? g.categoryId, value: g.total, color: CAT_COLORS[c?.color] || PALETTE[i % PALETTE.length] };
  });
  const assetClasses = (snapshot.assetClasses ?? []) as Array<{ key: string; label: string; value: number }>;
  const classTotal = assetClasses.reduce((s, c) => s + (c.value || 0), 0);
  const classPie = assetClasses.map((c, i) => ({ name: c.label, value: c.value, color: CLASS_COLORS[c.key] || PALETTE[i % PALETTE.length] }));
  const payoutMonths = [...new Set((snapshot.payoutEvents ?? []).map((p) => String(p.date).slice(0, 7)))]
    .map((ym) => ({ label: shortYm(ym), value: (trading.find((t) => t.ym === ym) ?? {}).pnl }))
    .filter((m) => m.value != null);
  const acctPnl = snapshot.accountPnl ?? [];

  const header = [
    { label: 'Net Worth', value: fmtMoney(nw.netWorth) },
    { label: 'Cash', value: fmtMoney(nw.components.cash) },
    { label: 'Invest', value: fmtMoney(nw.components.investments) },
    { label: 'Pendente', value: fmtMoney(nw.components.receivables) },
  ];

  return (
    <div className="hc-root">
      <div className="hc-hero">
        <div className="hc-hero-label">Patrimônio líquido (derivado)</div>
        <div className="hc-hero-value">{fmtMoney(nw.netWorth)}</div>
        <div className="hc-hero-grid">
          {header.map((h) => (
            <div key={h.label} className="hc-hero-cell">
              <div className="hc-hero-cell-label">{h.label}</div>
              <div className="hc-hero-cell-value">{h.value}</div>
            </div>
          ))}
        </div>
      </div>

      <WidgetGrid storageKey="home">
        {!hide('risk') && (<Widget key="risk" id="risk" title="Trading" to="/trading" hide={hide}>
          <div className="hc-stats">
            <div className="hc-stat"><span className="hc-stat-label">PnL hoje</span><span className="hc-stat-value" style={{ color: risk.pnlToday >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(risk.pnlToday, 'USD')}</span></div>
            <div className="hc-stat"><span className="hc-stat-label">Hoje</span><span className="hc-stat-value">{risk.tradesToday.win}W / {risk.tradesToday.loss}L</span></div>
            <div className="hc-stat"><span className="hc-stat-label">Acumulado</span><span className="hc-stat-value">{fmtMoney(trading.length ? trading[trading.length - 1].pnl : 0, 'USD')}</span></div>
          </div>
          {trading.length > 1 && (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={trading.map((t) => ({ ...t, label: shortYm(t.ym) }))} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="hc-tr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={44} tickFormatter={kfmt} />
                <Tooltip contentStyle={tip} formatter={(v) => fmtMoney(v, 'USD')} />
                <Area type="monotone" dataKey="pnl" stroke="#7c5cff" fill="url(#hc-tr)" strokeWidth={2} />
                {payoutMonths.map((m) => (
                  <ReferenceDot key={m.label} x={m.label} y={m.value} r={4} fill="#10b981" stroke="#0f1218" strokeWidth={2} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Widget>)}

        {!hide('money') && (<Widget key="money" id="money" title="Gastos" to="/gastos" hide={hide}>
          <div className="hc-stats">
            <div className="hc-stat"><span className="hc-stat-label">Entrou (mês)</span><span className="hc-stat-value" style={{ color: 'var(--green)' }}>{fmtMoney(snapshot.freeCash?.income, 'BRL')}</span></div>
            <div className="hc-stat"><span className="hc-stat-label">Gastou (mês)</span><span className="hc-stat-value" style={{ color: 'var(--red)' }}>{fmtMoney(snapshot.freeCash?.expenses, 'BRL')}</span></div>
            <div className="hc-stat"><span className="hc-stat-label">Saldo</span><span className="hc-stat-value">{fmtMoney(snapshot.freeCash?.freeCash, 'BRL')}</span></div>
          </div>
          {expensePie.length > 0 ? (
            <div className="hc-pie">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={expensePie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={64} paddingAngle={2}>
                    {expensePie.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v) => fmtMoney(v, 'BRL')} />
                </PieChart>
              </ResponsiveContainer>
              <div className="hc-legend">
                {expensePie.slice(0, 5).map((d) => (
                  <div key={d.name} className="hc-legend-row"><span className="hc-dot" style={{ background: d.color }} />{d.name}<span className="hc-legend-val">{fmtMoney(d.value, 'BRL')}</span></div>
                ))}
              </div>
            </div>
          ) : <div className="hc-empty">Sem despesas neste mês.</div>}
        </Widget>)}

        {!hide('investments') && (<Widget key="investments" id="investments" title="Patrimônio por classe" to="/investimentos" hide={hide}>
          <div className="hc-stats">
            <div className="hc-stat"><span className="hc-stat-label">Net worth</span><span className="hc-stat-value">{fmtMoney(nw.netWorth)}</span></div>
            <div className="hc-stat"><span className="hc-stat-label">Investido</span><span className="hc-stat-value">{fmtMoney(portfolio.totalValue)}</span></div>
            <div className="hc-stat"><span className="hc-stat-label">PnL</span><span className="hc-stat-value" style={{ color: portfolio.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(portfolio.totalPnl)} <small>{fmtPct(portfolio.pnlPercent)}</small></span></div>
          </div>
          {classPie.length > 0 ? (
            <div className="hc-pie">
              <ResponsiveContainer width={150} height={150}>
                <PieChart>
                  <Pie data={classPie} dataKey="value" nameKey="name" innerRadius={46} outerRadius={70} paddingAngle={2}>
                    {classPie.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v) => fmtMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="hc-legend">
                {classPie.map((d) => (
                  <div key={d.name} className="hc-legend-row"><span className="hc-dot" style={{ background: d.color }} />{d.name}<span className="hc-legend-val">{classTotal > 0 ? Math.round((d.value / classTotal) * 100) : 0}%</span></div>
                ))}
              </div>
            </div>
          ) : <div className="hc-empty">Cadastre posições/contas para ver a alocação.</div>}
        </Widget>)}

        {!hide('payouts') && (<Widget key="payouts" id="payouts" title="Contas (PnL por conta)" to="/contas" hide={hide}>
          <div className="hc-stats">
            <div className="hc-stat"><span className="hc-stat-label">Contas com PnL</span><span className="hc-stat-value">{acctPnl.length}</span></div>
            <div className="hc-stat"><span className="hc-stat-label">Payouts pendentes</span><span className="hc-stat-value">{pending.length}</span></div>
          </div>
          {acctPnl.length > 0 ? acctPnl.slice(0, 6).map((a) => (
            <div key={a.accountId} className="hc-row">
              <span className="hc-row-name">{a.name}</span>
              <span className="hc-row-sub">trad {fmtMoney(a.trading, 'USD')} · inv {fmtMoney(a.invest)}</span>
              <span className={`hc-row-val ${a.total >= 0 ? 'hc-pos' : 'hc-neg'}`}>{fmtMoney(a.total, 'USD')}</span>
            </div>
          )) : <div className="hc-empty">Sem PnL por conta ainda.</div>}
        </Widget>)}

        {!hide('goals') && (<Widget key="goals" id="goals" title="Metas" to="/planejamento" hide={hide}>
          {goals.length === 0 ? (
            <div className="hc-empty">Nenhuma meta definida.</div>
          ) : (
            <div className="hc-goals">
              {goals.slice(0, 5).map((g) => (
                <div key={g.goal.id} className="hc-goal">
                  <div className="hc-goal-row"><span className="hc-goal-name">{g.goal.kind}</span><span className="hc-goal-pct">{g.pct.toFixed(0)}%</span></div>
                  <div className="hc-goal-bar"><div className="hc-goal-fill" style={{ width: `${Math.min(100, g.pct)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Widget>)}

        {!hide('actions') && (<Widget key="actions" id="actions" title="Ações" hide={hide}>
          {actions.length === 0 ? (
            <div className="hc-empty">Sem ações em aberto.</div>
          ) : actions.slice(0, 6).map((a) => (
            <div key={a.id} className={`hc-row hc-action-${a.severity}`}>
              <span className="hc-action-dot" aria-hidden="true" />
              <span className="hc-row-name">{a.title}</span>
              <span className="hc-row-sub">{a.detail}</span>
            </div>
          ))}
        </Widget>)}

        {!hide('calendar') && (<Widget key="calendar" id="calendar" title="Calendário (45 dias)" hide={hide}>
          {calendar.holidays?.length > 0 && calendar.holidays.slice(0, 3).map((h) => (
            <div key={h.date} className="hc-row">
              <span className="hc-row-name">EUA · {h.name}</span>
              <span className="hc-row-sub">feriado</span>
              <span className="hc-row-val">{String(h.date).slice(5).replace('-', '/')}</span>
            </div>
          ))}
          {calendar.events?.length > 0 ? calendar.events.slice(0, 6).map((e) => (
            <div key={e.id} className="hc-row">
              <span className={`hc-imp hc-imp-${e.importance}`} />
              <span className="hc-row-name">{e.eventName}</span>
              <span className="hc-row-sub">{String(e.scheduledAt).slice(5, 10).replace('-', '/')} {String(e.scheduledAt).slice(11, 16)}</span>
            </div>
          )) : <div className="hc-empty">Sem eventos econômicos (offline ou API indisponível).</div>}
        </Widget>)}
      </WidgetGrid>

      {insights.length > 0 && !hide('insights') && (
        <section className="hc-insights" aria-label="Insights">
          <div className="hc-insights-title">Insights (leitura-only)</div>
          <div className="hc-insights-list">
            {insights.slice(0, 4).map((ins) => (
              <div key={ins.id} className="hc-insight">
                <div className="hc-insight-text">{ins.text}</div>
                <div className="hc-insight-source">fonte: {ins.source}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const HC_CSS = `
.hc-root { display: flex; flex-direction: column; gap: 16px; }
.hc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.hc-loading { gap: 8px; }
.hc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: hc-pulse 1.4s ease-in-out infinite; }

.hc-hero { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.hc-hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.hc-hero-value { font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 4px 0 14px; }
.hc-hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.hc-hero-cell-label { font-size: 11px; color: var(--muted, #a1a7b3); }
.hc-hero-cell-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }

.hc-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: stretch; }
.hc-widget { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); min-height: 260px; }
.hc-widget > .hc-pie { flex: 1; align-items: center; }
.hc-widget > .hc-goals { flex: 1; }
.hc-widget > .hc-empty { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; }
.hc-widget-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.hc-widget-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin: 0; display: inline-flex; align-items: center; gap: 6px; }
.hc-widget-link { font-size: 11px; font-weight: 700; color: var(--brand, #7c5cff); }
.hc-widget-link:hover { text-decoration: underline; }

.hc-stats { display: flex; flex-wrap: wrap; gap: 16px; }
.hc-stat { display: flex; flex-direction: column; gap: 2px; }
.hc-stat-label { font-size: 11px; color: var(--muted, #a1a7b3); }
.hc-stat-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hc-stat-value small { font-size: 11px; color: var(--muted, #a1a7b3); }

.hc-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.hc-row:last-child { border-bottom: none; }
.hc-row-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hc-row-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.hc-row-val { font-variant-numeric: tabular-nums; font-weight: 700; }
.hc-pos { color: var(--green, #2ecc71); }
.hc-neg { color: var(--red, #e74c3c); }
.hc-action-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--yellow, #e1b12c); flex-shrink: 0; }
.hc-action-warn .hc-action-dot { background: var(--red, #e74c3c); }
.hc-action-good .hc-action-dot { background: var(--green, #2ecc71); }
.hc-imp { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--muted, #a1a7b3); }
.hc-imp-high { background: var(--red, #e74c3c); }
.hc-imp-med { background: var(--yellow, #e1b12c); }

.hc-goals { display: flex; flex-direction: column; gap: 10px; }
.hc-goal-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
.hc-goal-name { text-transform: capitalize; }
.hc-goal-pct { font-variant-numeric: tabular-nums; }
.hc-goal-bar { height: 6px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
.hc-goal-fill { height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }

.hc-insights { background: rgba(124,92,255,0.04); border: 1px solid rgba(124,92,255,0.18); border-radius: 14px; padding: 16px; }
.hc-insights-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.hc-insights-list { display: flex; flex-direction: column; gap: 12px; }
.hc-insight-text { font-size: 13px; }
.hc-insight-source { font-size: 10px; color: var(--muted, #a1a7b3); font-family: monospace; margin-top: 2px; }

.hc-empty { font-size: 12px; color: var(--muted, #a1a7b3); }
.hc-pie { display: flex; align-items: center; gap: 10px; }
.hc-legend { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.hc-legend-row { display: flex; align-items: center; gap: 6px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hc-legend-val { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.hc-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
@media (max-width: 900px) { .hc-widgets { grid-template-columns: 1fr; } }
@media (max-width: 719px) { .hc-hero-grid { grid-template-columns: repeat(2, 1fr); } }
@keyframes hc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('hc-styles')) {
  const style = document.createElement('style');
  style.id = 'hc-styles';
  style.textContent = HC_CSS;
  document.head.appendChild(style);
}
