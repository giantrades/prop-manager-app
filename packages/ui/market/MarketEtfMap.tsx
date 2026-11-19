// MARKET — ETF map (treemap de ETFs por categoria). Tamanho ≈ AUM, cor = variação.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { squarify } from './treemap';
import useElementWidth from './useElementWidth';
import { changeClass, fmtPct, injectMarketStyles } from './marketUi';
import type { EtfMapCategory, EtfTile } from '@apps/lib/db';

const HEADER_H = 18;
const GAP = 3;

function tileColor(changePct: number): string {
  const clamp = Math.max(-0.03, Math.min(0.03, changePct));
  const a = 0.22 + (0.66 * Math.abs(clamp)) / 0.03;
  if (changePct > 0) return `rgba(46,204,113,${a.toFixed(3)})`;
  if (changePct < 0) return `rgba(231,76,60,${a.toFixed(3)})`;
  return 'rgba(120,128,145,0.28)';
}

function EtfTiles({ tiles, width, height, top }: { tiles: EtfTile[]; width: number; height: number; top: number }) {
  const cells = squarify(tiles, (t) => t.weight, { x: 0, y: 0, w: width, h: height });
  return (
    <>
      {cells.map((c) => {
        const area = c.w * c.h;
        const symSize = Math.max(9, Math.min(20, Math.sqrt(area) / 5.2));
        const showPct = c.h >= 30 && c.w >= 46;
        if (c.w < 26 || c.h < 15) return null;
        return (
          <div
            key={c.item.symbol}
            className="mk-heat-tile"
            style={{ left: c.x, top: top + c.y, width: c.w, height: c.h, background: tileColor(c.item.changePct) }}
            title={`${c.item.symbol} · ${c.item.label} · ${fmtPct(c.item.changePct)}`}
          >
            <span className="mk-heat-tile-sym" style={{ fontSize: symSize }}>{c.item.symbol}</span>
            {showPct && <span className="mk-heat-tile-chg" style={{ fontSize: Math.max(9, symSize * 0.72) }}>{fmtPct(c.item.changePct, 1)}</span>}
          </div>
        );
      })}
    </>
  );
}

function CategoryBlock({ category, width, height }: { category: EtfMapCategory; width: number; height: number }) {
  return (
    <div className="mk-heat-sector-inner" style={{ position: 'absolute', inset: 0 }}>
      <div className="mk-heat-sector-head">
        <span className="mk-heat-sector-short">{category.label}</span>
        <span className={`mk-heat-sector-chg ${changeClass(category.avgChangePct)}`}>{fmtPct(category.avgChangePct, 1)}</span>
      </div>
      <EtfTiles tiles={category.tiles} width={Math.max(0, width - 2)} height={Math.max(0, height - HEADER_H - 2)} top={HEADER_H + 1} />
    </div>
  );
}

interface MarketEtfMapProps {
  categories: EtfMapCategory[];
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MarketEtfMap({ categories, at, loading = false, stale = false, error = null, onRefresh }: MarketEtfMapProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
  const desktop = width >= 640;
  const height = desktop ? Math.max(460, Math.min(760, width * 0.56)) : 0;
  const outer = desktop && width > 0 ? squarify(categories, (c) => c.weight, { x: 0, y: 0, w: width, h: height }) : [];

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : 'Ao vivo · variação do dia'}
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

      <div ref={ref}>
        {categories.length === 0 ? (
          <div className="mk-group"><div className="mk-empty">Sem dados de ETFs. Verifique o feed de mercado.</div></div>
        ) : desktop ? (
          <div className="mk-heatmap" style={{ height }} role="img" aria-label="Mapa de ETFs por categoria">
            {outer.map((cell) => (
              <div key={cell.item.id} className="mk-heat-sector" style={{ left: cell.x + GAP, top: cell.y + GAP, width: Math.max(0, cell.w - GAP * 2), height: Math.max(0, cell.h - GAP * 2) }}>
                <CategoryBlock category={cell.item} width={cell.w - GAP * 2} height={cell.h - GAP * 2} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mk-page">
            {categories.map((c) => {
              const h = Math.max(130, Math.min(280, (c.weight / (totalWeight || 1)) * 900));
              return (
                <div key={c.id} className="mk-heatmap" style={{ height: h, position: 'relative' }}>
                  <CategoryBlock category={c} width={Math.max(0, width)} height={h} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mk-note">Tamanho do bloco ≈ AUM; cor = variação do dia. Passe o mouse para o nome completo.</div>
    </div>
  );
}
