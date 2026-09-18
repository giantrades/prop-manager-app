// Trades — lista estilo tabela (app antigo): busca, ordenação, paginação, badges de
// firm/lado e cards no mobile. Mantém replay + tags. COMPOSIÇÃO (sem cálculo financeiro
// novo: só agrega resultNet/resultR já calculados pelo motor).
import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import { tradeReplay, tradeNetPnl, formatDate, parseDate } from '@apps/lib/db';

function fmtR(v) {
  if (v == null || Number.isNaN(v)) return 'n/a';
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}R`;
}
// Data/hora SEMPRE local (nunca slice() em ISO UTC).
function fmtDate(iso) {
  return iso ? formatDate(parseDate(iso), 'dd/MM/yyyy HH:mm') : '—';
}
function fmtDateShort(iso) {
  return iso ? formatDate(parseDate(iso), 'dd/MM HH:mm') : '—';
}
/** Duração do trade (abertura → fechamento), curta: "12m", "1h 05m". */
function fmtDuration(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = parseDate(toIso).getTime() - parseDate(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

function FirmBadge({ firm }) {
  if (!firm) return null;
  if (firm.logo) return <span className="tr-firm-badge tr-firm-logo" title={firm.name}><img src={firm.logo} alt={firm.name} /></span>;
  if (firm.icon) return <span className="tr-firm-badge" title={firm.name}>{firm.icon}</span>;
  return (
    <span className="tr-firm-badge" title={firm.name} style={{ background: firm.color, color: '#fff' }}>
      {(firm.name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {Array<{id:string;name:string;firmId?:string}>} [props.accounts]
 * @param {Array<{id:string;name:string;color:string;icon?:string}>} [props.firms]
 * @param {(trade:object)=>void} [props.onEdit]
 * @param {(tradeId:string)=>void} [props.onDelete]
 * @param {(tradeIds:string[])=>void} [props.onDeleteMany]
 * @param {()=>void} [props.onNew]
 * @param {boolean} [props.loading]
 */
export default function Trades({ trades = [], accounts = [], firms = [], onEdit, onDelete, onDeleteMany, onNew, loading = false }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sortKey, setSortKey] = useState('entryDatetime');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const perPage = 15;

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const firmById = useMemo(() => new Map(firms.map((f) => [f.id, f])), [firms]);
  const tagsOf = (t) => (Array.isArray(t?.tags) ? t.tags : []);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of trades) for (const g of tagsOf(t)) if (typeof g === 'string' && g) s.add(g);
    return [...s].sort((a, b) => String(a).localeCompare(String(b)));
  }, [trades]);

  const accountLabel = (t) => {
    if (t.accounts?.length) return t.accounts.map((a) => accountById.get(a.accountId)?.name || a.accountId).join(', ');
    return accountById.get(t.accountId)?.name || t.accountId || '—';
  };
  const firmOf = (t) => {
    const accId = t.accountId || t.accounts?.[0]?.accountId;
    const acc = accId ? accountById.get(accId) : null;
    return acc?.firmId ? firmById.get(acc.firmId) : null;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = trades.filter((t) => {
      if (tag && !tagsOf(t).includes(tag)) return false;
      if (!q) return true;
      return `${t.symbol} ${t.strategyId || ''} ${accountLabel(t)} ${tagsOf(t).join(' ')}`.toLowerCase().includes(q);
    });
    list = list.slice().sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'entryDatetime') { av = new Date(a.entryDatetime || 0).getTime(); bv = new Date(b.entryDatetime || 0).getTime(); }
      else { av = Number(av) || 0; bv = Number(bv) || 0; }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [trades, query, tag, sortKey, sortDir, accountById]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const wins = filtered.filter((t) => tradeNetPnl(t) > 0).length;
    const pnl = filtered.reduce((s, t) => s + tradeNetPnl(t), 0);
    const avgR = total > 0 ? filtered.reduce((s, t) => s + (Number(t.resultR) || 0), 0) / total : 0;
    return { total, wr: total > 0 ? (wins / total) * 100 : 0, pnl, avgR };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * perPage, pageClamped * perPage);

  // Seleção em lote (excluir vários de uma vez).
  const toggleSel = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const pageIds = pageRows.map((t) => t.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAllPage = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allPageSelected) pageIds.forEach((id) => n.delete(id));
    else pageIds.forEach((id) => n.add(id));
    return n;
  });
  const clearSel = () => setSelected(new Set());

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };
  const sortMark = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

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
      {/* Stats */}
      <div className="tr-stats">
        <div className="td-stat" style={{ borderColor: 'rgba(124,92,255,0.25)' }}><div className="td-stat-label">Trades</div><div className="td-stat-value" style={{ color: '#7c5cff' }}>{stats.total}</div></div>
        <div className="td-stat" style={{ borderColor: 'rgba(245,158,11,0.25)' }}><div className="td-stat-label">Winrate</div><div className="td-stat-value" style={{ color: '#f59e0b' }}>{stats.wr.toFixed(1)}%</div></div>
        <div className="td-stat" style={{ borderColor: 'rgba(34,211,238,0.25)' }}><div className="td-stat-label">Avg R</div><div className="td-stat-value" style={{ color: '#22d3ee' }}>{stats.avgR.toFixed(2)}R</div></div>
        <div className="td-stat" style={{ borderColor: stats.pnl >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)' }}><div className="td-stat-label">PnL</div><div className="td-stat-value" style={{ color: stats.pnl >= 0 ? '#10b981' : '#ef4444' }}>{fmtMoney(stats.pnl)}</div></div>
      </div>

      {/* Toolbar */}
      <div className="tr-head">
        <input className="tr-search" placeholder="Buscar símbolo/estratégia/conta/tag…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar trades" />
        {allTags.length > 0 && (
          <select className="tr-tagfilter" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filtrar por tag">
            <option value="">Todas as tags</option>
            {allTags.map((g) => (<option key={g} value={g}>#{g}</option>))}
          </select>
        )}
        {onNew && <button className="tr-btn tr-btn-primary" onClick={onNew}>+ Novo trade</button>}
      </div>

      {selected.size > 0 && (
        <div className="tr-bulk" role="region" aria-label="Ações em lote">
          <span className="tr-bulk-count">{selected.size} selecionado(s)</span>
          {onDeleteMany && (
            <button className="tr-btn tr-btn-sm tr-btn-danger" onClick={() => { onDeleteMany([...selected]); clearSel(); }}>
              Excluir selecionados
            </button>
          )}
          <button className="tr-btn tr-btn-sm" onClick={clearSel}>Limpar seleção</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="tr-empty" role="status">Nenhum trade encontrado.</div>
      ) : (
        <>
          <div className="tr-table-wrap">
            <table className="tr-table">
              <thead>
                <tr>
                  <th scope="col" className="tr-checkcol">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAllPage} aria-label="Selecionar todos da página" />
                  </th>
                  <th scope="col" onClick={() => toggleSort('entryDatetime')} className="tr-sortable">Aberto → Fechado{sortMark('entryDatetime')}</th>
                  <th scope="col">Ativo</th>
                  <th scope="col">Lado</th>
                  <th scope="col" onClick={() => toggleSort('qty')} className="tr-sortable tr-num">Qtd{sortMark('qty')}</th>
                  <th scope="col" className="tr-num">Entrada</th>
                  <th scope="col" className="tr-num">Saída</th>
                  <th scope="col" onClick={() => toggleSort('resultNet')} className="tr-sortable tr-num">PnL{sortMark('resultNet')}</th>
                  <th scope="col" onClick={() => toggleSort('resultR')} className="tr-sortable tr-num">R{sortMark('resultR')}</th>
                  <th scope="col">Conta</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const acct = accountLabel(t);
                  const isOpen = expanded === t.id;
                  return (
                    <React.Fragment key={t.id}>
                      <tr>
                        <td className="tr-checkcol"><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} aria-label={`Selecionar ${t.symbol}`} /></td>
                        <td>
                          {/* Horário de abertura → fechamento (com dia) e, abaixo, o tempo decorrido. */}
                          <div className="tr-times" title={`Aberto ${fmtDate(t.entryDatetime)} → Fechado ${fmtDate(t.exitDatetime)}`}>
                            <span>{fmtDateShort(t.entryDatetime)}</span>
                            <span className="tr-arrow" aria-hidden="true">→</span>
                            <span>{t.exitDatetime ? fmtDateShort(t.exitDatetime) : 'em aberto'}</span>
                          </div>
                          {fmtDuration(t.entryDatetime, t.exitDatetime) && (
                            <div className="tr-dur">({fmtDuration(t.entryDatetime, t.exitDatetime)})</div>
                          )}
                        </td>
                        <td className="tr-sym">{t.symbol}</td>
                        <td><span className={`tr-dir tr-${t.direction}`}>{t.direction}</span></td>
                        <td className="tr-num">{t.qty}</td>
                        <td className="tr-num">{fmtMoney(t.entryPrice)}</td>
                        <td className="tr-num">{t.exitPrice != null ? fmtMoney(t.exitPrice) : '—'}</td>
                        <td className={`tr-num ${tradeNetPnl(t) >= 0 ? 'tr-pos' : 'tr-neg'}`}>{fmtMoney(tradeNetPnl(t))}</td>
                        <td className="tr-num">{fmtR(t.resultR)}</td>
                        <td className="tr-acct"><FirmBadge firm={firmOf(t)} /> {acct}</td>
                        <td className="tr-actions">
                          <button className="tr-btn tr-btn-sm tr-btn-ghost" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : t.id)}>{isOpen ? 'Ocultar' : 'Replay'}</button>
                          {onEdit && <button className="tr-btn tr-btn-sm" onClick={() => onEdit(t)} aria-label="Editar">✎</button>}
                          {onDelete && <button className="tr-btn tr-btn-sm tr-btn-danger" onClick={() => onDelete(t.id)} aria-label="Excluir">🗑</button>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="tr-expand">
                          <td colSpan={11}>
                            <TradeReplayView trade={t} />
                            {tagsOf(t).length > 0 && (
                              <div className="tr-tags" style={{ marginTop: 8 }}>
                                {tagsOf(t).map((g) => (<button key={g} type="button" className="tr-tag" onClick={() => setTag(g)}>#{g}</button>))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards mobile */}
          <div className="tr-cards">
            {pageRows.map((t) => {
              const isOpen = expanded === t.id;
              return (
                <div key={t.id} className="tr-card">
                  <div className="tr-card-head">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} aria-label={`Selecionar ${t.symbol}`} />
                    <span className="tr-symbol">{t.symbol} <span className={`tr-dir tr-${t.direction}`}>{t.direction}</span></span>
                    <span className={`tr-num ${tradeNetPnl(t) >= 0 ? 'tr-pos' : 'tr-neg'}`}>{fmtMoney(tradeNetPnl(t))}</span>
                  </div>
                  <div className="tr-card-meta">
                    {fmtDateShort(t.entryDatetime)}
                    {fmtDuration(t.entryDatetime, t.exitDatetime) ? ` → ${fmtDuration(t.entryDatetime, t.exitDatetime)}` : ''} · {fmtR(t.resultR)} · <FirmBadge firm={firmOf(t)} /> {accountLabel(t)}
                  </div>
                  <div className="tr-card-actions">
                    <button className="tr-btn tr-btn-sm tr-btn-ghost" onClick={() => setExpanded(isOpen ? null : t.id)}>{isOpen ? 'Ocultar' : 'Replay'}</button>
                    {onEdit && <button className="tr-btn tr-btn-sm" onClick={() => onEdit(t)}>Editar</button>}
                    {onDelete && <button className="tr-btn tr-btn-sm tr-btn-danger" onClick={() => onDelete(t.id)}>Excluir</button>}
                  </div>
                  {isOpen && <TradeReplayView trade={t} />}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="tr-pagination">
              <button className="tr-btn tr-btn-sm" disabled={pageClamped === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Anterior</button>
              <span className="tr-page">Página {pageClamped} / {totalPages}</span>
              <button className="tr-btn tr-btn-sm" disabled={pageClamped >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TradeReplayView({ trade }) {
  const replay = useMemo(() => tradeReplay(trade), [trade]);
  const maxAbs = Math.max(1, ...replay.points.map((p) => Math.abs(p.price - trade.entryPrice)));
  return (
    <div className="tr-replay" role="region" aria-label={`Replay de ${trade.symbol}`}>
      {/* Horários executados: abertura → fechamento · duração (como no app antigo). */}
      <div className="tr-replay-times">
        <span className="tr-tt-label">Aberto</span><span className="tr-tt-val">{fmtDate(trade.entryDatetime)}</span>
        <span className="tr-tt-arrow" aria-hidden="true">→</span>
        <span className="tr-tt-label">Fechado</span><span className="tr-tt-val">{trade.exitDatetime ? fmtDate(trade.exitDatetime) : '—'}</span>
        {fmtDuration(trade.entryDatetime, trade.exitDatetime) && (
          <span className="tr-tt-dur" title="Tempo em mercado">⏱ {fmtDuration(trade.entryDatetime, trade.exitDatetime)}</span>
        )}
      </div>
      <div className="tr-replay-track">
        {replay.points.map((p, i) => (
          <div key={`${p.at}-${i}`} className={`tr-replay-pt tr-replay-${p.kind}`} title={`${p.label} — ${p.price} @ ${fmtDate(p.at)}`}>
            <span className="tr-replay-dot" style={{ opacity: 0.35 + (0.65 * Math.abs(p.price - trade.entryPrice)) / maxAbs }} />
            <span className="tr-replay-label">{p.label}</span>
            <span className="tr-replay-price">{fmtMoney(p.price)}</span>
          </div>
        ))}
      </div>
      <div className="tr-replay-meta">
        <span>MAE <b style={{ color: 'var(--red)' }}>{replay.mae ?? '—'}</b></span>
        <span>MFE <b style={{ color: 'var(--green)' }}>{replay.mfe ?? '—'}</b></span>
        <span>R <b>{fmtR(trade.resultR)}</b></span>
        <span>Fees <b style={{ color: 'var(--red)' }}>{fmtMoney(-Math.abs(trade.fees || 0))}</b></span>
        {/* Conferência: gross = net + fees (derivado do que está gravado, não é fórmula nova). */}
        <span>Gross <b>{fmtMoney(tradeNetPnl(trade) + Math.abs(trade.fees || 0))}</b></span>
        {trade.stopPrice != null && <span>Stop <b>{fmtMoney(trade.stopPrice)}</b></span>}
        {trade.takePrice != null && <span>Alvo <b>{fmtMoney(trade.takePrice)}</b></span>}
        {trade.multiplier != null && <span>Multiplier <b>{trade.multiplier}×</b></span>}
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

.tr-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.tr-stats .td-stat { position: relative; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 14px 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.tr-stats .td-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; font-weight: 600; color: var(--muted, #a1a7b3); margin-bottom: 6px; }
.tr-stats .td-stat-value { font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; }

.tr-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.tr-search { flex: 1; min-width: 200px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.tr-tagfilter { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 42px; }
.tr-btn { padding: 10px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.tr-btn:disabled { opacity: 0.5; cursor: default; }
.tr-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; font-weight: 700; }
.tr-btn-sm { padding: 5px 10px; min-height: 36px; font-size: 11px; border-radius: 8px; }
.tr-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.tr-btn-ghost { background: transparent; }

.tr-table-wrap { overflow-x: auto; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.tr-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.tr-table th, .tr-table td { padding: 10px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; }
.tr-table thead th { color: var(--muted, #a1a7b3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
.tr-sortable { cursor: pointer; user-select: none; }
.tr-sortable:hover { color: var(--text, #e7eaf0); }
.tr-table tbody tr:hover { background: rgba(255,255,255,0.02); }
.tr-table th.tr-num, .tr-table td.tr-num { text-align: right; }
.tr-pos { color: var(--green, #2ecc71); }
.tr-neg { color: var(--red, #e74c3c); }
.tr-sym { font-weight: 700; }
.tr-acct { font-size: 11px; }
.tr-actions { display: flex; gap: 6px; }
.tr-firm-badge { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; font-size: 9px; font-weight: 700; vertical-align: middle; margin-right: 4px; }
.tr-firm-logo img { width: 100%; height: 100%; object-fit: contain; border-radius: 4px; }
.tr-checkcol { width: 34px; text-align: center; }
.tr-checkcol input { width: 15px; height: 15px; cursor: pointer; }
.tr-bulk { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: rgba(124,92,255,0.08); border: 1px solid rgba(124,92,255,0.3); }
.tr-bulk-count { font-size: 12px; font-weight: 700; }
.tr-expand td { background: rgba(7,16,35,0.5); }

.tr-dir { font-size: 10px; padding: 2px 8px; border-radius: 999px; text-transform: capitalize; }
.tr-long { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.tr-short { background: rgba(231,76,60,0.15); color: var(--red, #e74c3c); }

.tr-cards { display: none; }
.tr-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
.tr-page { font-size: 12px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }

.tr-replay { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding: 10px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; }
.tr-replay-track { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.tr-replay-pt { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 76px; }
.tr-replay-dot { width: 12px; height: 12px; border-radius: 999px; background: var(--brand, #7c5cff); }
.tr-replay-exit .tr-replay-dot { background: var(--green, #2ecc71); }
.tr-replay-entry .tr-replay-dot { background: var(--yellow, #e1b12c); }
.tr-replay-label { font-size: 10px; color: var(--muted, #a1a7b3); white-space: nowrap; }
.tr-replay-price { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tr-times { display: flex; align-items: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tr-arrow { color: var(--muted, #a1a7b3); }
.tr-dur { text-align: center; font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.tr-replay-times { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; font-variant-numeric: tabular-nums; }
.tr-tt-label { color: var(--muted, #a1a7b3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
.tr-tt-val { font-weight: 700; }
.tr-tt-arrow { color: var(--muted, #a1a7b3); }
.tr-tt-dur { margin-left: 6px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: rgba(124,92,255,0.12); border: 1px solid rgba(124,92,255,0.3); color: #b9a8ff; }
.tr-replay-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; font-variant-numeric: tabular-nums; }
.tr-replay-notes { font-size: 12px; color: var(--text, #e7eaf0); background: rgba(255,255,255,0.03); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; }
.tr-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tr-tag { font-size: 11px; padding: 2px 10px; border-radius: 999px; background: rgba(124,92,255,0.12); border: 1px solid rgba(124,92,255,0.3); color: var(--brand, #7c5cff); cursor: pointer; }
.tr-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@media (max-width: 900px) {
  .tr-table-wrap { display: none; }
  .tr-cards { display: flex; flex-direction: column; gap: 10px; }
  .tr-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .tr-card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .tr-card-meta { font-size: 11px; color: var(--muted, #a1a7b3); }
  .tr-card-actions { display: flex; gap: 6px; }
  .tr-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@keyframes tr-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tr-styles')) {
  const style = document.createElement('style');
  style.id = 'tr-styles';
  style.textContent = TR_CSS;
  document.head.appendChild(style);
}
