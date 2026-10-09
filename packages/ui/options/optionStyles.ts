// Stylesheet ÚNICO do módulo Opções (injetado uma vez). Só variáveis CSS do tema
// (--brand/--green/--red/--muted/--text/--soft/--panel/--chip-bg…): zero hex.
// Alvos de toque ≥40px em telas estreitas; nada <10px.

const CSS = `
.opx-stack { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.opx-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.opx-grow { flex: 1 1 auto; min-width: 0; }
.opx-muted { color: var(--muted); }
.opx-small { font-size: 12px; }
.opx-pos { color: var(--green); }
.opx-neg { color: var(--red); }
.opx-num { font-variant-numeric: tabular-nums; }
.opx-panel { padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.opx-title { font-weight: 700; font-size: 14px; }

.opx-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; min-width: 0; }
.opx-field > span { color: var(--muted); }
.opx-field .input, .opx-field .select { margin: 0; min-height: 40px; }
.opx-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }

.opx-btn { min-height: 40px; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--soft); background: var(--chip-bg); color: var(--text); font-size: 13px; font-weight: 600; cursor: pointer; }
.opx-btn:hover:not(:disabled) { border-color: var(--brand); }
.opx-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.opx-btn.primary { background: var(--brand); border-color: var(--brand); color: var(--text); }
.opx-btn.danger { border-color: var(--red); color: var(--red); }
.opx-btn.small { min-height: 32px; padding: 4px 10px; font-size: 12px; }
.opx-btn:focus-visible, .opx-tab:focus-visible, .opx-chip:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.opx-chip { min-height: 32px; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--soft); background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; }
.opx-chip[aria-pressed="true"] { background: color-mix(in srgb, var(--brand) 16%, transparent); border-color: var(--brand); color: var(--text); }

.opx-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--soft); color: var(--muted); letter-spacing: 0.02em; }
.opx-badge.ok { color: var(--green); border-color: color-mix(in srgb, var(--green) 40%, transparent); }
.opx-badge.warn { color: var(--yellow); border-color: color-mix(in srgb, var(--yellow) 45%, transparent); }
.opx-badge.bad { color: var(--red); border-color: color-mix(in srgb, var(--red) 45%, transparent); }
.opx-badge.info { color: var(--blue); border-color: color-mix(in srgb, var(--blue) 45%, transparent); }

.opx-alert { padding: 10px 12px; border-radius: 10px; font-size: 13px; border: 1px solid var(--soft); background: var(--panel); display: flex; flex-direction: column; gap: 6px; }
.opx-alert.warn { border-color: var(--yellow); }
.opx-alert.bad { border-color: var(--red); }
.opx-alert b { font-weight: 700; }

.opx-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.opx-tab { min-height: 40px; padding: 8px 16px; border-radius: 999px; background: transparent; border: 1px solid var(--soft); color: var(--muted); font-size: 13px; cursor: pointer; font-weight: 600; }
.opx-tab[aria-selected="true"] { background: color-mix(in srgb, var(--brand) 16%, transparent); border-color: var(--brand); color: var(--text); }

.opx-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.opx-stat { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; }
.opx-stat-label { font-size: 11px; color: var(--muted); }
.opx-stat-value { font-size: 15px; font-variant-numeric: tabular-nums; }

.opx-scroll { overflow-x: auto; border: 1px solid var(--soft); border-radius: 12px; }
.opx-table { border-collapse: collapse; width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; }
.opx-table th, .opx-table td { padding: 6px 8px; text-align: right; white-space: nowrap; }
.opx-table thead th { color: var(--muted); font-weight: 600; border-bottom: 1px solid var(--soft); position: sticky; top: 0; background: var(--panel); }
.opx-table tbody tr { border-bottom: 1px solid var(--chip-bg); }
.opx-table td.left, .opx-table th.left { text-align: left; }
.opx-table .input, .opx-table .select { margin: 0; padding: 6px 8px; min-height: 32px; min-width: 64px; }

.opx-skel { border-radius: 12px; background: linear-gradient(90deg, var(--chip-bg), var(--soft), var(--chip-bg)); background-size: 200% 100%; animation: opxSkel 1.2s linear infinite; min-height: 90px; }
@keyframes opxSkel { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .opx-skel { animation: none; } }

.opx-empty { padding: 20px 16px; text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; }

/* Desk */
.opx-desk-atm td, .opx-desk-atm .opx-strike-head { background: color-mix(in srgb, var(--brand) 12%, transparent); }
.opx-itm { background: color-mix(in srgb, var(--soft) 55%, transparent); }
.opx-strike-col { text-align: center !important; font-weight: 700; background: var(--chip-bg); }
.opx-th-call { text-align: center !important; color: var(--green) !important; }
.opx-th-put { text-align: center !important; color: var(--red) !important; }
.opx-quote-btn { min-width: 52px; min-height: 32px; padding: 2px 6px; border-radius: 8px; border: 1px solid var(--soft); background: transparent; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; }
.opx-quote-btn.bid { color: var(--green); }
.opx-quote-btn.ask { color: var(--red); }
.opx-quote-btn:hover:not(:disabled) { border-color: var(--brand); }
.opx-quote-btn:disabled { opacity: 0.4; cursor: default; }
.opx-strike-card { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.opx-strike-card.opx-desk-atm { border-color: var(--brand); }
.opx-strike-head { display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 1; background: var(--panel); padding: 4px 0; }
.opx-strike-head b { font-size: 16px; }
.opx-side { display: grid; grid-template-columns: 56px repeat(auto-fit, minmax(54px, 1fr)); gap: 6px 8px; align-items: center; font-size: 12px; font-variant-numeric: tabular-nums; }
.opx-side .opx-quote-btn { min-height: 40px; min-width: 40px; }
.opx-side-label { font-weight: 700; }
.opx-side-label.call { color: var(--green); }
.opx-side-label.put { color: var(--red); }
.opx-metric { display: flex; flex-direction: column; gap: 1px; }
.opx-metric > span:first-child { color: var(--muted); font-size: 10px; }

/* Posições */
.opx-pos-card { padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.opx-pos-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.opx-pos-nums { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; }
.opx-pos-nums > div { display: flex; flex-direction: column; gap: 1px; }
.opx-pos-nums span.k { color: var(--muted); font-size: 10px; }
.opx-pos-actions { display: flex; gap: 6px; flex-wrap: wrap; }

/* Analyzer */
.opx-wi { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: end; }
.opx-legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--muted); }
.opx-legend i { display: inline-block; width: 18px; height: 0; border-top: 2px solid currentColor; vertical-align: middle; margin-right: 4px; }
.opx-legend i.dash { border-top-style: dashed; }

/* Analyzer — layout de duas colunas (OptionStrat-like): tudo visível sem scroll */
.opxa-root { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.opxa-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 10px; padding: 10px 12px; }
.opxa-sep { width: 1px; align-self: stretch; background: var(--soft); margin: 2px; }
.opxa-tf { display: flex; flex-direction: column; gap: 2px; font-size: 11px; min-width: 0; }
.opxa-tf > span { color: var(--muted); }
.opxa-tf .input, .opxa-tf .select { min-height: 32px; margin: 0; width: 100%; min-width: 84px; }
.opxa-mult { display: flex; align-items: center; gap: 6px; }
.opxa-grid { display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 1fr); gap: 12px; align-items: start; }
.opxa-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.opxa-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.opxa-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.opxa-kv { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
.opxa-kv > span { color: var(--muted); }
.opxa-kv > b { font-variant-numeric: tabular-nums; }
.opxa-chart { padding: 12px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.opxa-greeks { display: flex; flex-wrap: wrap; gap: 14px; padding: 8px 10px; border: 1px solid var(--soft); border-radius: 10px; background: var(--chip-bg); }
.opxa-gk { display: inline-flex; align-items: baseline; gap: 6px; font-size: 12px; }
.opxa-gk b { font-variant-numeric: tabular-nums; }
.opxa-wi { display: grid; grid-template-columns: 10px 1fr 1fr 34px; gap: 6px; align-items: center; }
.opxa-wi .input { min-height: 32px; margin: 0; }
.opxa-wi-dot { width: 10px; height: 10px; border-radius: 50%; }
.opxa-seg { display: inline-flex; gap: 4px; }
.opxa-hint { margin-left: auto; }
.opxa-chain .opx-table th, .opxa-chain .opx-table td { padding: 4px 6px; }
.opxa-price { min-width: 56px; min-height: 32px; padding: 2px 6px; border-radius: 8px; border: 1px solid var(--soft); background: transparent; font-variant-numeric: tabular-nums; font-size: 12px; cursor: pointer; }
.opxa-price.call { color: var(--green); }
.opxa-price.put { color: var(--red); }
.opxa-price:hover:not(:disabled) { border-color: var(--brand); }
.opxa-price:disabled { opacity: 0.4; cursor: default; }

/* Busca de subjacente (combobox) */
.opxs-root { position: relative; }
.opxs-panel { position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; right: 0; max-height: 260px; overflow-y: auto; background: var(--panel); border: 1px solid var(--soft); border-radius: 10px; box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
.opxs-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; min-height: 40px; background: transparent; border: 0; color: var(--text); text-align: left; cursor: pointer; font-size: 13px; }
.opxs-item:hover, .opxs-item.on { background: var(--chip-bg); }
.opxs-name { font-weight: 600; }
.opxs-count { color: var(--muted); font-size: 11px; }
.opxs-empty { padding: 10px 12px; color: var(--muted); font-size: 12px; }
@media (max-width: 900px) {
  .opxa-grid { grid-template-columns: 1fr; }
  .opxa-main { order: 1; }
  .opxa-side { order: 2; }
}

@media (max-width: 720px) {
  .opx-stats { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
  .opx-fields { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
  .opx-btn.small { min-height: 40px; }
  .opx-chip { min-height: 40px; }
}
`;

let injected = false;
export function ensureOptionStyles(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById('opx-styles')) { injected = true; return; }
  const el = document.createElement('style');
  el.id = 'opx-styles';
  el.textContent = CSS;
  document.head.appendChild(el);
  injected = true;
}
