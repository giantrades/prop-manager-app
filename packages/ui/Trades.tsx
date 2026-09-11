// STAGE 7 — Trades (Journal engine-driven). Lista de trades + edit/delete + link pro
// TradeForm. COMPOSIÇÃO: recebe `trades` já lidos do motor e callbacks; o container
// persiste via `DataChainEngine.syncTrade`/`deleteTrade`.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/00-produto.md (Journal) + 01-tasks.md (T3.5).

import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import { tradeReplay } from '@apps/lib/db';


function fmtR(v) {
  if (v == null || Number.isNaN(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}R`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {Array<{id:string;name:string}>} [props.accounts]
 * @param {(trade:object)=>void} [props.onEdit]
 * @param {(tradeId:string)=>void} [props.onDelete]
 * @param {()=>void} [props.onNew]
 * @param {boolean} [props.loading]
 */
export default function Trades({ trades = [], accounts = [], onEdit, onDelete, onNew, loading = false }) {
  const [filter, setFilter] = useState('');
  const [replayId, setReplayId] = useState(null);
  const [tag, setTag] = useState('');
  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);

  // J12 — tags livres por trade (array de strings). Helper tipado para o filtro.
  const tagsOf = (t) => (Array.isArray(t?.tags) ? t.tags : []);
  const allTags = useMemo(() => {
    const tagSet: Set<string> = new Set();
    for (const t of trades) for (const g of tagsOf(t)) if (typeof g === 'string' && g) tagSet.add(g);
    return [...tagSet].sort((a, b) => String(a).localeCompare(String(b)));
  }, [trades]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return trades.filter((t) => {
      if (tag && !tagsOf(t).includes(tag)) return false;
      if (!q) return true;
      return (
        (t.symbol || '').toLowerCase().includes(q) ||
        (t.strategyId || '').toLowerCase().includes(q) ||
        tagsOf(t).join(' ').toLowerCase().includes(q)
      );
    });
  }, [trades, filter, tag]);

  if (loading) {
    return (
      <div className="tr-root tr-loading" role="status" aria-live="polite">
        <div className="tr-skeleton" /><div className="tr-skeleton" /><div className="tr-skeleton" />
        <span className="tr-screen-reader">Carregando trades…</span>
      </div>
    );
  }

  return (
    <div className="tr-root">
      <div className="tr-head">
        <input className="tr-search" placeholder="Buscar símbolo/estratégia/tag…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar trades" />
        {allTags.length > 0 && (
          <select className="tr-tagfilter" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filtrar por tag">
            <option value="">Todas as tags</option>
            {allTags.map((g) => (
              <option key={g} value={g}>#{g}</option>
            ))}
          </select>
        )}
        {onNew && <button className="tr-btn tr-btn-primary" onClick={onNew}>+ Novo trade</button>}
      </div>

      {filtered.length === 0 ? (
        <div className="tr-empty" role="status">Nenhum trade registrado.</div>
      ) : (
        <div className="tr-list">
          {filtered.map((t) => {
            const acct = t.accounts?.length ? t.accounts.map((a) => accountName.get(a.accountId) || a.accountId).join(', ') : (accountName.get(t.accountId) || t.accountId || '—');
            return (
              <div key={t.id} className="tr-item">
                <div className="tr-item-head">
                  <div className="tr-symbol">{t.symbol} <span className={`tr-dir tr-${t.direction}`}>{t.direction}</span></div>
                  <div className="tr-item-actions">
                    <button
                      className="tr-btn tr-btn-sm tr-btn-ghost"
                      aria-expanded={replayId === t.id}
                      onClick={() => setReplayId((id) => (id === t.id ? null : t.id))}
                    >
                      {replayId === t.id ? 'Ocultar replay' : '▶ Replay'}
                    </button>
                    {onEdit && <button className="tr-btn tr-btn-sm" onClick={() => onEdit(t)}>Editar</button>}
                    {onDelete && <button className="tr-btn tr-btn-sm tr-btn-danger" onClick={() => onDelete(t.id)}>Excluir</button>}
                  </div>
                </div>
                <div className="tr-item-grid">
                  <div className="tr-cell"><span className="tr-cell-label">Qty</span><span>{t.qty}</span></div>
                  <div className="tr-cell"><span className="tr-cell-label">Entrada</span><span>{fmtMoney(t.entryPrice)}</span></div>
                  <div className="tr-cell"><span className="tr-cell-label">Saída</span><span>{t.exitPrice != null ? fmtMoney(t.exitPrice) : '—'}</span></div>
                  <div className="tr-cell"><span className="tr-cell-label">PnL</span><span style={{ color: (t.resultNet ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(t.resultNet)}</span></div>
                  <div className="tr-cell"><span className="tr-cell-label">R</span><span>{fmtR(t.resultR)}</span></div>
                  <div className="tr-cell"><span className="tr-cell-label">Conta</span><span className="tr-acct">{acct}</span></div>
                </div>
                <div className="tr-item-meta">{fmtDate(t.entryDatetime)} · {t.strategyId || 'sem estratégia'}</div>
                {replayId === t.id && <TradeReplayView trade={t} />}
                {tagsOf(t).length > 0 && (
                  <div className="tr-tags">
                    {tagsOf(t).map((g) => (
                      <button key={g} type="button" className="tr-tag" onClick={() => setTag(g)} title={`Filtrar por #${g}`}>#{g}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// B1 — replay expansível: sequência temporal entrada → fills → saída + MAE/MFE + notas.
function TradeReplayView({ trade }) {
  const replay = useMemo(() => tradeReplay(trade), [trade]);
  const maxAbs = Math.max(1, ...replay.points.map((p) => Math.abs(p.price - trade.entryPrice)));
  return (
    <div className="tr-replay" role="region" aria-label={`Replay de ${trade.symbol}`}>
      <div className="tr-replay-track">
        {replay.points.map((p, i) => (
          <div key={`${p.at}-${i}`} className={`tr-replay-pt tr-replay-${p.kind}`} title={`${p.label} — ${p.price} @ ${fmtDate(p.at)}`}>
            <span
              className="tr-replay-dot"
              style={{ opacity: 0.35 + (0.65 * Math.abs(p.price - trade.entryPrice)) / maxAbs }}
            />
            <span className="tr-replay-label">{p.label}</span>
            <span className="tr-replay-price">{fmtMoney(p.price)}</span>
          </div>
        ))}
      </div>
      <div className="tr-replay-meta">
        <span>MAE <b style={{ color: 'var(--red)' }}>{replay.mae ?? '—'}</b></span>
        <span>MFE <b style={{ color: 'var(--green)' }}>{replay.mfe ?? '—'}</b></span>
      </div>
      {replay.notes && <div className="tr-replay-notes">{replay.notes}</div>}
    </div>
  );
}

const TR_CSS = `
.tr-root { display: flex; flex-direction: column; gap: 14px; }
.tr-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.tr-loading { gap: 8px; }
.tr-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: tr-pulse 1.4s ease-in-out infinite; }
.tr-skeleton:nth-child(2) { width: 80%; }

.tr-head { display: flex; gap: 10px; align-items: center; }
.tr-search { flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.tr-btn { padding: 10px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 42px; }
.tr-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.tr-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }
.tr-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.tr-btn-ghost { background: transparent; }

.tr-list { display: flex; flex-direction: column; gap: 10px; }
.tr-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.tr-item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tr-symbol { font-size: 15px; font-weight: 800; }
.tr-dir { font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-left: 6px; text-transform: capitalize; }
.tr-long { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.tr-short { background: rgba(231,76,60,0.15); color: var(--red, #e74c3c); }
.tr-item-actions { display: flex; gap: 6px; }

.tr-item-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.tr-cell { display: flex; flex-direction: column; gap: 2px; }
.tr-cell-label { font-size: 10px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.tr-cell span:last-child { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tr-acct { font-size: 12px !important; }

.tr-item-meta { font-size: 11px; color: var(--muted, #a1a7b3); }
.tr-replay { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; }
.tr-replay-track { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.tr-replay-pt { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 76px; }
.tr-replay-dot { width: 12px; height: 12px; border-radius: 999px; background: var(--brand, #7c5cff); }
.tr-replay-exit .tr-replay-dot { background: var(--green, #2ecc71); }
.tr-replay-entry .tr-replay-dot { background: var(--yellow, #e1b12c); }
.tr-replay-label { font-size: 10px; color: var(--muted, #a1a7b3); white-space: nowrap; }
.tr-replay-price { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-replay-meta { display: flex; gap: 14px; font-size: 12px; font-variant-numeric: tabular-nums; }
.tr-replay-notes { font-size: 12px; color: var(--text, #e7eaf0); background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; }
.tr-tagfilter { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.tr-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-tag { font-size: 11px; padding: 2px 10px; border-radius: 999px; background: rgba(124,92,255,0.12); border: 1px solid rgba(124,92,255,0.3); color: var(--brand, #7c5cff); cursor: pointer; }
.tr-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@media (max-width: 719px) { .tr-item-grid { grid-template-columns: repeat(3, 1fr); } }
@keyframes tr-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tr-styles')) {
  const style = document.createElement('style');
  style.id = 'tr-styles';
  style.textContent = TR_CSS;
  document.head.appendChild(style);
}
