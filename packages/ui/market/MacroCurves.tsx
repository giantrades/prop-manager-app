// MACRO — Curva de juros (US Treasury) + spreads 10y-3m / 30y-10y / 10y-5y.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { injectMarketStyles } from './marketUi';
import type { YieldPoint, YieldSpreads } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

function spreadColor(v: number | null): string {
  if (v == null) return 'var(--muted, #a1a7b3)';
  return v < 0 ? 'var(--red, #e74c3c)' : 'var(--green, #2ecc71)';
}

function fmtBp(v: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)} bp`;
}

interface MacroCurvesProps {
  curve: YieldPoint[];
  spreads: YieldSpreads;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MacroCurves({ curve, spreads, at, loading = false, stale = false, error = null, onRefresh }: MacroCurvesProps) {
  useEffect(() => { injectMarketStyles(); }, []);

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : 'Curva US Treasury'}
        </span>
        {at && <span className="mk-status">atualizado {new Date(at).toLocaleTimeString('pt-BR')}</span>}
        <span className="mk-toolbar-spacer" />
        {onRefresh && (
          <button type="button" className="mk-btn" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            <RefreshCw size={14} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
      </div>

      {error && <div className="cmd-warn" role="alert">Feed indisponível ({error}). Mostrando cache quando houver.</div>}

      <div className="mk-kpis">
        <Kpi label="10y − 3m" value={spreads.s10m3m != null ? `${spreads.s10m3m.toFixed(2)}%` : '—'} sub={spreads.inverted ? 'curva invertida' : 'curva positiva'} color={spreadColor(spreads.s10m3m)} />
        <Kpi label="30y − 10y" value={spreads.s30m10 != null ? `${spreads.s30m10.toFixed(2)}%` : '—'} sub="prêmio de prazo longo" color={spreadColor(spreads.s30m10)} />
        <Kpi label="10y − 5y" value={spreads.s10m5 != null ? `${spreads.s10m5.toFixed(2)}%` : '—'} sub="inclinação intermediária" color={spreadColor(spreads.s10m5)} />
        <Kpi label="10y" value={spreads.y10 != null ? `${spreads.y10.toFixed(2)}%` : '—'} sub="yield de referência" />
      </div>

      {curve.length < 2 ? (
        <div className="mk-empty">Sem dados de yield ainda.</div>
      ) : (
        <section className="mk-group" aria-label="Curva de juros">
          <div className="mk-group-head">
            <span className="mk-group-title">Curva de juros (yield %)</span>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 10, right: 14, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted, #a1a7b3)', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--muted, #a1a7b3)', fontSize: 10 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Tooltip
                  contentStyle={{ background: 'rgba(18,20,26,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Yield']}
                />
                <Line type="monotone" dataKey="value" stroke="#4f8cff" strokeWidth={2.2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="mk-group" aria-label="Pontos da curva">
        <div className="mk-table">
          <div className="mk-table-head">
            <span>Vencimento</span>
            <span className="mk-num">Yield</span>
            <span className="mk-num">Período</span>
          </div>
          {curve.map((p) => (
            <div key={p.symbol} className="mk-table-row">
              <span className="mk-table-name">
                <span className="mk-table-sym">{p.label}</span>
                <span className="mk-table-sub">{p.symbol}</span>
              </span>
              <span className="mk-num">{p.value.toFixed(2)}%</span>
              <span className={`mk-num ${p.changeBp == null ? 'mk-flat' : p.changeBp >= 0 ? 'mk-up' : 'mk-down'}`}>{fmtBp(p.changeBp)}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="mk-subtitle" style={{ marginTop: 10 }}>O 2Y não está disponível no feed grátis (Yahoo); a curva usa 3M, 5Y, 10Y e 30Y.</p>
    </div>
  );
}
