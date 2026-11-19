// MACRO — Cross-asset / Session tape. Multi-linha normalizada (base 100) + tabela.
// Reutilizado pelos dois painéis (muda `changeLabel` e granularidade do eixo).
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { changeClass, fmtPct, fmtPrice, injectMarketStyles } from './marketUi';
import type { CrossAssetSeries } from '@apps/lib/db';

const PALETTE = [
  '#4f8cff', '#2ecc71', '#e1b12c', '#e74c3c', '#9b59b6',
  '#1abc9c', '#e67e22', '#ff6b9d', '#00d2ff', '#f1c40f',
  '#a29bfe', '#55efc4', '#fd79a8',
];

function fmtDate(key: string): string {
  if (key.includes('T')) {
    const d = new Date(key);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return key.slice(5);
}

interface MacroCrossAssetProps {
  title: string;
  subtitle?: string;
  data: CrossAssetSeries;
  changeLabel: string;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MacroCrossAsset({
  title, subtitle, data, changeLabel, at, loading = false, stale = false, error = null, onRefresh,
}: MacroCrossAssetProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const hasData = data.rows.length > 0 && data.symbols.length > 0;

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : title}
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
      {subtitle && <p className="mk-subtitle">{subtitle}</p>}

      {!hasData ? (
        <div className="mk-empty">Sem dados de mercado ainda.</div>
      ) : (
        <>
          <div className="mk-legend" role="list" aria-label="Ativos e desempenho no período">
            {data.symbols.map((s, i) => (
              <span key={s.symbol} className="mk-legend-item" role="listitem">
                <span className="mk-legend-swatch" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
                {s.label}
                <span className={`mk-legend-chg ${changeClass(s.changePct)}`}>{fmtPct(s.changePct, 1)}</span>
              </span>
            ))}
          </div>

          <section className="mk-group" aria-label={`${title} — desempenho normalizado`}>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.rows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: 'var(--muted, #a1a7b3)', fontSize: 10 }} minTickGap={28} tickLine={false} axisLine={false} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--muted, #a1a7b3)', fontSize: 10 }} tickLine={false} axisLine={false} width={46} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(18,20,26,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--muted, #a1a7b3)' }}
                    labelFormatter={(v) => fmtDate(String(v))}
                    formatter={(value, name) => [Number(value).toFixed(2), String(name)]}
                  />
                  {data.symbols.map((s, i) => (
                    <Line
                      key={s.symbol}
                      type="monotone"
                      dataKey={s.symbol}
                      name={s.label}
                      stroke={PALETTE[i % PALETTE.length]}
                      dot={false}
                      strokeWidth={1.7}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mk-group" aria-label={`${title} — tabela`}>
            <div className="mk-table">
              <div className="mk-table-head">
                <span>Ativo</span>
                <span className="mk-num">Último</span>
                <span className="mk-num">{changeLabel}</span>
              </div>
              {data.symbols.map((s) => (
                <div key={s.symbol} className="mk-table-row">
                  <span className="mk-table-name">
                    <span className="mk-table-sym">{s.symbol}</span>
                    <span className="mk-table-sub">{s.label}</span>
                  </span>
                  <span className="mk-num">{fmtPrice(s.last)}</span>
                  <span className={`mk-num ${changeClass(s.changePct)}`}>{fmtPct(s.changePct, 2)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
