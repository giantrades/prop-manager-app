// CRYPTO — Painel cripto (majors): KPIs, tiles com sparkline e tabela.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, fmtPrice, fmtVolume, injectMarketStyles } from './marketUi';
import Sparkline from './Sparkline';
import type { CryptoBoard } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

const usd = (v: number | null | undefined) =>
  v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: v >= 100 ? 0 : 2, maximumFractionDigits: v >= 100 ? 0 : 4 })}`;

interface CryptoOverviewProps {
  board: CryptoBoard;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function CryptoOverview({ board, at, loading = false, stale = false, error = null, onRefresh }: CryptoOverviewProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const btc = board.coins.find((c) => c.symbol === 'BTC-USD');
  const eth = board.coins.find((c) => c.symbol === 'ETH-USD');
  const featured = board.coins.slice(0, 3);

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : `Crypto · ${board.total} moedas`}
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
        <Kpi label="Bitcoin" value={usd(btc?.price)} sub={fmtPct(btc?.changePct, 2)} color={btc?.changePct != null && btc.changePct >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
        <Kpi label="Ethereum" value={usd(eth?.price)} sub={fmtPct(eth?.changePct, 2)} color={eth?.changePct != null && eth.changePct >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
        <Kpi label="Avanços / quedas" value={`${board.advancers} / ${board.decliners}`} sub={`${board.unchanged} estáveis`} />
        <Kpi label="Variação média" value={fmtPct(board.avgChangePct, 2)} sub="majors" color={board.avgChangePct != null && board.avgChangePct >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
      </div>

      {featured.length > 0 && (
        <div className="mk-coin-grid">
          {featured.map((c) => (
            <div key={c.symbol} className="mk-coin">
              <div className="mk-coin-head">
                <span>
                  <span className="mk-coin-sym">{c.symbol.replace('-USD', '')}</span>
                  <span className="mk-coin-label"> · {c.label}</span>
                </span>
                <span className={changeClass(c.changePct)}>{fmtPct(c.changePct, 2)}</span>
              </div>
              <span className="mk-coin-price">{usd(c.price)}</span>
              <Sparkline series={c.series} width={160} height={30} changePct={c.changePct} ariaLabel={`sparkline ${c.label}`} />
            </div>
          ))}
        </div>
      )}

      <section className="mk-group" aria-label="Moedas">
        <div className="mk-group-head">
          <span className="mk-group-title">Majors</span>
        </div>
        <div className="mk-table mk-table--crypto">
          <div className="mk-table-head">
            <span>Moeda</span>
            <span className="mk-num">Preço</span>
            <span className="mk-num">Variação</span>
            <span className="mk-num">Volume</span>
          </div>
          {board.coins.map((c) => (
            <div key={c.symbol} className="mk-table-row">
              <span className="mk-table-name">
                <span className="mk-table-sym">{c.symbol.replace('-USD', '')}</span>
                <span className="mk-table-sub">{c.label}</span>
              </span>
              <span className="mk-num">{usd(c.price)}</span>
              <span className={`mk-num ${changeClass(c.changePct)}`}>{fmtPct(c.changePct, 2)}</span>
              <span className="mk-num">{fmtVolume(c.volume)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
