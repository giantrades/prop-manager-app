// F1/F8/F3 — AccountDetail (engine-driven). Dashboard próprio da conta:
// equity/peak/DD/headroom (gráfico), payouts com comprovantes, trades,
// checklist de elegibilidade. Tudo via `accountDashboard()` — nenhuma fórmula aqui.
// Mobile-first 360px (cards).
//
// Fonte: DOCS/10_MODULES/propfirm/00-spec.md (F1, F3, F8).

import { fmtMoney } from './currency';
import React, { useId } from 'react';
import { normalizePropPhase } from '@apps/lib/db';
import type { Account, AccountDashboard, Payout, PropExtension } from '@apps/lib/db';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';


const PHASE_LABEL: Record<string, string> = { challenge: 'Challenge', funded: 'Funded', live: 'Live', standby: 'Standby' };


function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

interface AccountDetailProps {
  account: Account;
  prop?: PropExtension | null;
  dashboard?: AccountDashboard | null;
  payouts?: Payout[];
  onBack?: () => void;
  loading?: boolean;
}

/**
 * @param {object} props
 * @param {object} props.account
 * @param {object} [props.prop]
 * @param {object} [props.dashboard] retorno de `accountDashboard()`
 * @param {Array<object>} [props.payouts] todos os payouts (filtra pela conta)
 * @param {()=>void} [props.onBack]
 * @param {boolean} [props.loading]
 */
export default function AccountDetail({ account, prop = null, dashboard = null, payouts = [], onBack, loading = false }: AccountDetailProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');

  if (loading || !dashboard) {
    return (
      <div className="ad-root ad-loading" role="status" aria-live="polite">
        <div className="ad-skeleton" />
        <div className="ad-skeleton" />
        <span className="ad-screen-reader">Carregando conta…</span>
      </div>
    );
  }

  const mine = payouts.filter((p) => (p.accountIds || []).includes(account.id));
  const checks = dashboard.eligibility
    ? [
        { label: `Equity ≥ target (${fmtMoney(prop?.target ?? 0)})`, ok: dashboard.eligibility.checks.equityReachedTarget },
        { label: 'Drawdown < 100% do limite', ok: dashboard.eligibility.checks.drawdownOk },
        { label: `Dias operados ≥ mín (${prop?.minDays ?? 0})`, ok: dashboard.eligibility.checks.daysOperatedOk },
        { label: 'Consistência dentro do limite', ok: dashboard.eligibility.checks.consistencyOk },
      ]
    : [];

  const stats = [
    { label: 'Equity', value: fmtMoney(dashboard.equity) },
    { label: 'Peak', value: fmtMoney(dashboard.peak) },
    { label: 'DD usado', value: `${fmtMoney(dashboard.drawdown.value)} (${fmtPct(dashboard.drawdown.fraction)})` },
    { label: 'Headroom', value: fmtMoney(dashboard.headroom.value) },
    { label: 'Payouts', value: `${dashboard.payouts.count} • ${fmtMoney(dashboard.payouts.totalNet)}` },
    { label: 'Trades', value: `${dashboard.trades.count} (${dashboard.trades.wins}W/${dashboard.trades.losses}L)` },
  ];

  return (
    <div className="ad-root">
      <div className="ad-head">
        <div>
          <div className="ad-title">{account.name} <span className="ad-kind">{account.kind}</span></div>
          <div className="ad-sub">
            {prop ? `${PHASE_LABEL[normalizePropPhase(prop.phase) ?? ''] ?? prop.phase} · balance ${fmtMoney(prop.nominalSize)}` : 'sem regras prop'}
            {account.platformName ? ` · ${account.platformName}` : ''}
          </div>
        </div>
        {onBack && <button className="ad-btn" onClick={onBack}>Voltar</button>}
      </div>

      <div className="ad-grid" aria-live="polite">
        {stats.map((s) => (
          <div key={s.label} className="ad-card">
            <span className="ad-label">{s.label}</span>
            <span className="ad-value">{s.value}</span>
          </div>
        ))}
      </div>

      {dashboard.series.length > 1 && (
        <div className="ad-section">
          <div className="ad-section-title">Equity da conta</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard.series.map((p) => ({ at: String(p.at).slice(5, 10), equity: p.equity }))}>
                <defs>
                  <linearGradient id={`adg-${gid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="at" tick={{ fontSize: 10, fill: '#a1a7b3' }} minTickGap={28} />
                <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <Area type="monotone" dataKey="equity" stroke="#7c5cff" strokeWidth={2} fill={`url(#adg-${gid})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {dashboard.eligibility && (
        <div className="ad-section">
          <div className="ad-section-title">
            Elegibilidade payout {dashboard.eligibility.eligible
              ? <span className="ad-pill ad-pill-ok">ELEGÍVEL</span>
              : <span className="ad-pill">NÃO ELEGÍVEL</span>}
          </div>
          <div className="ad-checks">
            {checks.map((c) => (
              <div key={c.label} className="ad-check">
                <span aria-hidden="true">{c.ok ? '✅' : '❌'}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ad-section">
        <div className="ad-section-title">Payouts da conta ({mine.length})</div>
        {mine.length === 0 ? (
          <div className="ad-empty" role="status">Nenhum payout nesta conta.</div>
        ) : (
          <div className="ad-payouts">
            {mine.map((p) => {
              const files = Object.keys(p.attachments || {});
              return (
                <div key={p.id} className="ad-payout">
                  <span className="ad-payout-date">{(p.date || '').slice(0, 10)}</span>
                  <span className={`ad-payout-net ${p.status === 'Pending' ? '' : 'ad-pos'}`}>
                    {fmtMoney(p.splitByAccount?.[account.id]?.net ?? 0)}
                  </span>
                  <span className="ad-payout-status">{p.status}</span>
                  {files.length > 0 && <span className="ad-payout-files" title={files.join(', ')}>📎{files.length}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const AD_CSS = `
.ad-root { display: flex; flex-direction: column; gap: 14px; }
.ad-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ad-loading { gap: 8px; }
.ad-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ad-pulse 1.4s ease-in-out infinite; }
.ad-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.ad-title { font-size: 16px; font-weight: 800; }
.ad-kind { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(124,92,255,0.15); color: var(--brand, #7c5cff); margin-left: 6px; text-transform: capitalize; }
.ad-sub { font-size: 12px; color: var(--muted, #a1a7b3); margin-top: 4px; }
.ad-btn { padding: 8px 14px; border-radius: 10px; background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); font-size: 12px; font-weight: 600; cursor: pointer; min-height: 42px; }
.ad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ad-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.ad-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.ad-value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ad-section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.ad-section-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px; }
.ad-pill { font-size: 10px; padding: 2px 10px; border-radius: 999px; background: rgba(225,177,44,0.15); color: var(--yellow, #e1b12c); font-weight: 800; }
.ad-pill-ok { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.ad-checks { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.ad-check { display: flex; gap: 8px; align-items: center; }
.ad-payouts { display: flex; flex-direction: column; gap: 6px; }
.ad-payout { display: flex; gap: 10px; align-items: center; font-size: 12px; font-variant-numeric: tabular-nums; }
.ad-payout-date { color: var(--muted, #a1a7b3); }
.ad-payout-net { font-weight: 700; margin-left: auto; }
.ad-pos { color: var(--green, #2ecc71); }
.ad-payout-status { font-size: 11px; color: var(--muted, #a1a7b3); }
.ad-payout-files { font-size: 11px; }
.ad-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .ad-grid { grid-template-columns: 1fr 1fr; } }
@keyframes ad-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ad-styles')) {
  const style = document.createElement('style');
  style.id = 'ad-styles';
  style.textContent = AD_CSS;
  document.head.appendChild(style);
}
