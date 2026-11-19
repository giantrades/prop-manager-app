// MARKET — helpers de UI (formatação, cores, CSS do módulo) compartilhados pelos
// componentes de `packages/ui/market/*`. Apresentação pura; nada calcula dinheiro.
// CSS por variáveis do tema (nunca hex hardcoded em componente novo).

import type { MarketQuote } from '@apps/lib/db';

/** Cor (rgba) de um tile/linha a partir da variação % (fração). */
export function changeColor(changePct: number | null | undefined, alphaBase = 0.18): string {
  if (changePct == null || Number.isNaN(changePct)) return 'rgba(255,255,255,0.05)';
  const clamp = Math.max(-0.04, Math.min(0.04, changePct));
  const a = alphaBase + (0.62 * Math.abs(clamp)) / 0.04;
  if (changePct > 0) return `rgba(46,204,113,${a.toFixed(3)})`;
  if (changePct < 0) return `rgba(231,76,60,${a.toFixed(3)})`;
  return 'rgba(255,255,255,0.05)';
}

/** Classe de cor de texto (verde/vermelho). */
export function changeClass(changePct: number | null | undefined): string {
  if (changePct == null || Number.isNaN(changePct)) return 'mk-flat';
  if (changePct > 0) return 'mk-up';
  if (changePct < 0) return 'mk-down';
  return 'mk-flat';
}

/** "+1.23%" (fração → %). */
export function fmtPct(changePct: number | null | undefined, digits = 2): string {
  if (changePct == null || Number.isNaN(changePct)) return '—';
  const v = changePct * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

/** Preço com separador de milhar e casas adaptativas. */
export function fmtPrice(value: number | null | undefined, digits?: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  const d = digits ?? (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 1 ? 2 : 4);
  return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Volume compacto (1.2M, 3.4B). */
export function fmtVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return String(Math.round(value));
}

/** Normaliza a série de preços p/ um path SVG (0..1 na vertical). */
export function sparkPath(series: Array<[number, number]>, width = 100, height = 28): string {
  const closes = series.map((p) => p[1]).filter((c) => Number.isFinite(c));
  if (closes.length < 2) return '';
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const step = width / (closes.length - 1);
  return closes
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - ((c - min) / span) * height).toFixed(2)}`)
    .join(' ');
}

/** True quando a cotação veio do cache (offline/falha). */
export function isStale(q: MarketQuote | null | undefined): boolean {
  return !!q?.stale;
}

// ---------------------------------------------------------------------------
// CSS do módulo (injetado 1x)
// ---------------------------------------------------------------------------

export const MARKET_CSS = `
.mk-page { display: flex; flex-direction: column; gap: 14px; }
.mk-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mk-toolbar-spacer { flex: 1; }
.mk-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--muted, #a1a7b3); }
.mk-live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green, #2ecc71); box-shadow: 0 0 0 3px rgba(46,204,113,0.15); }
.mk-live-dot.stale { background: var(--yellow, #e1b12c); box-shadow: 0 0 0 3px rgba(225,177,44,0.15); }
.mk-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; min-height: 40px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); font-size: 12px; font-weight: 700; cursor: pointer; }
.mk-btn:hover { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); }
.mk-btn:disabled { opacity: 0.5; cursor: default; }

.mk-up { color: var(--green, #2ecc71); }
.mk-down { color: var(--red, #e74c3c); }
.mk-flat { color: var(--muted, #a1a7b3); }

.mk-grid { display: grid; gap: 12px; }
.mk-group { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.mk-group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.mk-group-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted, #a1a7b3); }
.mk-group-breadth { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }

.mk-row { display: grid; grid-template-columns: 1fr 78px 58px 64px; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.mk-row:last-child { border-bottom: none; }
.mk-row-name { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mk-row-sym { font-weight: 800; font-size: 13px; letter-spacing: 0.2px; }
.mk-row-label { font-size: 11px; color: var(--muted, #a1a7b3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mk-row-price { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; }
.mk-row-chg { text-align: right; font-variant-numeric: tabular-nums; font-weight: 800; font-size: 13px; }
.mk-row-spark { display: flex; justify-content: flex-end; }
.mk-stale-tag { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 999px; background: rgba(225,177,44,0.16); color: var(--yellow, #e1b12c); margin-left: 6px; }

/* KPI cards */
.mk-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.mk-kpi { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 14px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.mk-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.mk-kpi-value { font-size: 1.6rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.mk-kpi-sub { font-size: 11px; color: var(--muted, #a1a7b3); margin-top: 6px; }

/* Heatmap */
.mk-heatmap { position: relative; width: 100%; border-radius: 14px; overflow: hidden; border: 1px solid #1a2232; background: #0d1017; }
.mk-heat-sector { position: absolute; padding: 3px; box-sizing: border-box; }
.mk-heat-sector-inner { position: relative; width: 100%; height: 100%; border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
.mk-heat-sector-head { position: absolute; top: 0; left: 0; right: 0; height: 18px; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 6px; background: rgba(6,9,14,0.82); backdrop-filter: blur(3px); font-size: 10px; font-weight: 800; letter-spacing: 0.4px; z-index: 3; }
.mk-heat-sector-short { color: var(--text, #e7eaf0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mk-heat-sector-chg { font-variant-numeric: tabular-nums; }
.mk-heat-tile { position: absolute; box-sizing: border-box; border: 1px solid rgba(6,9,14,0.55); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; overflow: hidden; cursor: default; }
.mk-heat-tile-sym { font-weight: 800; line-height: 1; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.45); }
.mk-heat-tile-chg { line-height: 1; color: rgba(255,255,255,0.92); font-variant-numeric: tabular-nums; }
.mk-heat-tile:hover { outline: 1px solid rgba(255,255,255,0.55); z-index: 4; }

/* Breadth bars */
.mk-breadth-row { display: grid; grid-template-columns: 1.4fr 2fr 84px; align-items: center; gap: 12px; padding: 7px 4px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; }
.mk-breadth-row:last-child { border-bottom: none; }
.mk-breadth-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mk-breadth-bar { position: relative; height: 10px; border-radius: 999px; background: rgba(231,76,60,0.25); overflow: hidden; }
.mk-breadth-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #2ecc71, #7ee2a8); border-radius: 999px; }
.mk-breadth-pct { text-align: right; font-variant-numeric: tabular-nums; font-weight: 800; }

/* Distribuição (breadth) */
.mk-dist { display: flex; align-items: flex-end; gap: 8px; height: 180px; }
.mk-dist-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; }
.mk-dist-count { font-size: 11px; font-weight: 700; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.mk-dist-bar { width: 100%; border-radius: 4px 4px 0 0; min-height: 4px; }
.mk-dist-label { font-size: 9.5px; color: var(--muted, #a1a7b3); white-space: nowrap; }

/* Baskets (Themes / Factors) */
.mk-baskets { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; }
.mk-basket { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 8px; }
.mk-basket-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mk-basket-name { font-weight: 800; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mk-basket-score { font-weight: 800; font-variant-numeric: tabular-nums; font-size: 14px; }
.mk-basket-meta { display: flex; gap: 12px; font-size: 11px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.mk-basket-bar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
.mk-basket-bar-fill { display: block; height: 100%; border-radius: 999px; }
.mk-basket-members { display: flex; flex-wrap: wrap; gap: 4px; }
.mk-chip { font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); font-variant-numeric: tabular-nums; }

/* Macro */
.mk-subtitle { margin: 0 0 10px; font-size: 12px; color: var(--muted, #a1a7b3); }
.mk-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-bottom: 8px; }
.mk-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--text, #e7eaf0); }
.mk-legend-swatch { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.mk-legend-chg { font-variant-numeric: tabular-nums; }
.mk-table { display: flex; flex-direction: column; font-size: 12.5px; }
.mk-table-head, .mk-table-row { display: grid; grid-template-columns: 1.5fr 1fr 0.9fr 0.9fr; gap: 10px; align-items: center; padding: 8px 6px; }
.mk-table-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); border-bottom: 1px solid rgba(255,255,255,0.08); }
.mk-table-row { border-bottom: 1px solid rgba(255,255,255,0.04); font-variant-numeric: tabular-nums; }
.mk-table-row:last-child { border-bottom: none; }
.mk-table-name { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mk-table-sym { font-weight: 800; }
.mk-table-sub { font-size: 10.5px; color: var(--muted, #a1a7b3); }
.mk-num { text-align: right; font-variant-numeric: tabular-nums; }
.mk-kpi-value.sm { font-size: 1.15rem; }
.mk-vol-tag { display: inline-flex; align-items: center; font-size: 11px; font-weight: 800; letter-spacing: 0.4px; padding: 3px 10px; border-radius: 999px; border: 1px solid; }
.mk-events { display: flex; flex-direction: column; }
.mk-event-row { display: grid; grid-template-columns: 92px 1fr auto; gap: 10px; align-items: center; padding: 9px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12.5px; }
.mk-event-row:last-child { border-bottom: none; }
.mk-event-when { color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; font-size: 11px; }
.mk-event-name { font-weight: 600; }
.mk-imp { font-size: 9.5px; font-weight: 800; padding: 2px 7px; border-radius: 999px; text-transform: uppercase; }
.mk-imp-high { background: rgba(231,76,60,0.16); color: #ff8a7a; }
.mk-imp-med { background: rgba(225,177,44,0.16); color: var(--yellow, #e1b12c); }
.mk-imp-low { background: rgba(255,255,255,0.06); color: var(--muted, #a1a7b3); }

/* Live */
.mk-signal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.mk-signal { border: 1px solid rgba(255,255,255,0.08); border-left: 3px solid rgba(255,255,255,0.2); border-radius: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 3px; }
.mk-signal.pos { border-left-color: var(--green, #2ecc71); }
.mk-signal.neg { border-left-color: var(--red, #e74c3c); }
.mk-signal.neu { border-left-color: rgba(255,255,255,0.2); }
.mk-signal-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); font-weight: 700; }
.mk-signal-reading { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; }
.mk-signal-detail { font-size: 11px; color: var(--muted, #a1a7b3); }
.mk-live-rows { display: flex; flex-direction: column; }
.mk-live-row { display: grid; grid-template-columns: 1.1fr 2fr auto; gap: 10px; align-items: center; padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12.5px; }
.mk-live-row:last-child { border-bottom: none; }
.mk-live-bar { position: relative; height: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; }
.mk-live-fill { position: absolute; top: 0; bottom: 0; border-radius: 4px; }
.mk-alert-row { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: start; padding: 10px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.mk-alert-row:last-child { border-bottom: none; }
.mk-alert-title { font-weight: 700; font-size: 12.5px; }
.mk-alert-detail { font-size: 11.5px; color: var(--muted, #a1a7b3); }

/* Scanner / Crypto */
.mk-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }
.mk-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mk-field-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); font-weight: 700; }
.mk-input, .mk-select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text, #e7eaf0); padding: 7px 9px; font-size: 12.5px; min-height: 34px; width: 100%; font-family: inherit; }
.mk-input:focus, .mk-select:focus { outline: none; border-color: var(--accent, #4f8cff); }
.mk-table--screener .mk-table-head, .mk-table--screener .mk-table-row { grid-template-columns: 1.5fr 1fr 0.8fr 0.7fr 0.7fr 0.9fr; }
.mk-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.mk-table--screener { min-width: 640px; }
.mk-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.mk-btn.is-active { background: rgba(79,140,255,0.18); border-color: rgba(79,140,255,0.5); color: var(--text, #e7eaf0); }
.mk-th-btn { background: none; border: none; color: inherit; font: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; padding: 0; display: inline-flex; align-items: center; gap: 3px; }
.mk-th-btn:hover { color: var(--text, #e7eaf0); }
.mk-sort-ind { font-size: 9px; opacity: 0.85; }
.mk-rules { margin-bottom: 12px; }
.mk-textarea { width: 100%; min-height: 76px; resize: vertical; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text, #e7eaf0); padding: 9px 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; }
.mk-textarea:focus { outline: none; border-color: var(--accent, #4f8cff); }
.mk-editor { position: relative; height: 96px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; background: rgba(255,255,255,0.04); overflow: hidden; }
.mk-editor:focus-within { border-color: var(--accent, #4f8cff); }
.mk-editor-highlight, .mk-editor-input { position: absolute; inset: 0; margin: 0; padding: 9px 11px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; overflow: auto; tab-size: 2; }
.mk-editor-highlight { color: var(--text, #e7eaf0); pointer-events: none; }
.mk-editor-input { background: transparent; border: none; resize: none; color: transparent; -webkit-text-fill-color: transparent; caret-color: var(--text, #e7eaf0); outline: none; }
.mk-editor-input::placeholder { color: var(--muted, #a1a7b3); -webkit-text-fill-color: var(--muted, #a1a7b3); }
.mk-editor-input::selection { background: rgba(79,140,255,0.35); }
.mk-tok-field { color: var(--accent, #4f8cff); }
.mk-tok-keyword { color: var(--yellow, #e1b12c); font-weight: 700; }
.mk-tok-operator { color: var(--orange, #e67e22); font-weight: 700; }
.mk-tok-number { color: var(--green, #2ecc71); }
.mk-tok-string { color: var(--pink, #ff6b9d); }
.mk-tok-punct { color: var(--muted, #a1a7b3); }
.mk-tok-value { color: var(--text, #e7eaf0); }
.mk-tok-space { color: inherit; }
.mk-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; border: 1px solid; letter-spacing: 0.2px; }
.mk-pill.ok { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.4); background: rgba(46,204,113,0.1); }
.mk-pill.warn { color: var(--yellow, #e1b12c); border-color: rgba(225,177,44,0.4); background: rgba(225,177,44,0.1); }
.mk-pill.off { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.4); background: rgba(231,76,60,0.1); }
.mk-cf-list { display: flex; flex-direction: column; }
.mk-cf-row { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.mk-cf-row:last-child { border-bottom: none; }
.mk-cf-id { font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.mk-cf-expr { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; color: var(--muted, #a1a7b3); overflow: hidden; text-overflow: ellipsis; }
.mk-cf-error { color: var(--red, #e74c3c); font-size: 11px; grid-column: 1 / -1; }
.mk-cf-form { display: grid; grid-template-columns: 1fr 2fr auto; gap: 8px; margin-top: 8px; align-items: end; }
.mk-icon-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--muted, #a1a7b3); cursor: pointer; padding: 7px 9px; display: inline-flex; align-items: center; }
.mk-icon-btn:hover { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.45); }
.mk-rules-error { color: var(--red, #e74c3c); font-size: 11.5px; margin-top: 4px; }
.mk-help { margin-top: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.mk-help summary { cursor: pointer; font-weight: 700; color: var(--text, #e7eaf0); }
.mk-help h4 { margin: 10px 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.mk-help code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; }
.mk-help-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 3px 14px; }
.mk-help-row { display: flex; gap: 6px; font-size: 11.5px; color: var(--muted, #a1a7b3); }
.mk-help-key { min-width: 78px; }
.mk-example-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.mk-example { display: block; width: 100%; text-align: left; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text, #e7eaf0); cursor: pointer; padding: 5px 8px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; }
.mk-example:hover { border-color: rgba(79,140,255,0.5); }
.mk-table--crypto .mk-table-head, .mk-table--crypto .mk-table-row { grid-template-columns: 1.4fr 1fr 0.8fr 1.1fr; }
.mk-coin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.mk-coin { border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 4px; }
.mk-coin-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.mk-coin-sym { font-weight: 800; font-size: 13px; }
.mk-coin-label { font-size: 10.5px; color: var(--muted, #a1a7b3); }
.mk-coin-price { font-size: 1.15rem; font-weight: 800; font-variant-numeric: tabular-nums; }

/* Movers */
.mk-movers-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mk-mover-row { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; padding: 7px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12.5px; }
.mk-mover-row:last-child { border-bottom: none; }
.mk-mover-rank { font-size: 10px; font-weight: 800; color: var(--muted, #a1a7b3); text-align: right; }
.mk-mover-name { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.mk-mover-sym { font-weight: 800; }
.mk-mover-sub { font-size: 10.5px; color: var(--muted, #a1a7b3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mk-mover-chg { font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
.mk-mover-price { font-size: 11px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; text-align: right; }

.mk-note { font-size: 12px; color: var(--muted, #a1a7b3); line-height: 1.5; }
.mk-empty { padding: 20px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; }

@media (max-width: 1000px) { .mk-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) {
  .mk-movers-cols { grid-template-columns: 1fr; }
  .mk-row { grid-template-columns: 1fr 70px 56px; }
  .mk-row-spark { display: none; }
}
@media (max-width: 560px) { .mk-kpis { grid-template-columns: 1fr; } .mk-breadth-row { grid-template-columns: 1.2fr 1.4fr 70px; } }
`;

let injected = false;
export function injectMarketStyles(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById('mk-styles')) {
    injected = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'mk-styles';
  style.textContent = MARKET_CSS;
  document.head.appendChild(style);
  injected = true;
}
