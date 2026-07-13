import React, { useMemo, useEffect, useState } from 'react';
import { Trade, AccountWeight, EnrichedTrade } from '../types/trade';
import { useJournal } from "@apps/journal-state";
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import { useCurrency } from '@apps/state';

function FirmBadge({ firmLogo, firmColor, firmName }: { firmLogo?: string | null; firmColor?: string | null; firmName?: string | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {firmLogo ? (
        <img
          src={firmLogo}
          title={firmName || ''}
          style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3 }}
        />
      ) : firmColor ? (
        <span
          title={firmName || ''}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: 3,
            background: firmColor, color: '#fff',
            fontSize: 9, fontWeight: 700, lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {(firmName || '?').charAt(0).toUpperCase()}
        </span>
      ) : null}
    </span>
  );
}

type Props = {
  trades: EnrichedTrade[];
  onEdit?: (t: EnrichedTrade) => void;
  onDelete?: (id: string) => void;
};

export default function TradeTable({ trades, onEdit, onDelete }: Props) {
  const [accounts, setAccounts] = useState(() => getAll().accounts || []);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
const isMobile = useMemo(() => window.innerWidth < 768, []);

useEffect(() => {
  setAccounts(getAll().accounts || []);
}, []);

  
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<'entry_datetime' | 'result_net' | 'result_R' | 'asset' |'tf_signal' | string>('entry_datetime');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { currency, rate } = useCurrency();

const fmt = (v: number) => currency === 'USD'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate);
  // Função para resolver nomes das contas
  function resolveAccountNames(t) {
    if (t.accounts && t.accounts.length > 0) {
      return t.accounts
        .map(a => {
          const acc = accounts.find(x => x.id === a.accountId);
          return acc ? acc.name : a.accountId;
        })
        .join(', ');
    }
    if (t.accountId) {
      const acc = accounts.find(x => x.id === t.accountId);
      return acc ? acc.name : 'N/A';
    }
    return 'N/A';
  }

  // Filtrar e ordenar trades
  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    if (query) {
      list = list.filter(t =>
        (t.asset || '').toLowerCase().includes(lower)
        || (t.accountName || '').toLowerCase().includes(lower)
        || (t.strategyId || '').toLowerCase().includes(lower)
        || (t.notes || '').toLowerCase().includes(lower)
        || (t.direction || '').toLowerCase().includes(lower)
        || (t.tf_signal||'').toLowerCase().includes(lower)
      );
    }
    return list.sort((a, b) => {
      let av: any = (a as any)[sortKey] || 0;
      let bv: any = (b as any)[sortKey] || 0;
      
      if (sortKey === 'entry_datetime') {
        av = new Date(av);
        bv = new Date(bv);
      }
      
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trades, query, sortKey, sortDir]);

  // 🧭 Paginação local
const [page, setPage] = useState(1);
const pageSize = 25; // 👈 trades por página

const totalPages = Math.ceil(filtered.length / pageSize);
const paginated = useMemo(() => {
  const start = (page - 1) * pageSize;
  return filtered.slice(start, start + pageSize);
}, [filtered, page, pageSize]);

function calculateDuration(entryStr?: string, exitStr?: string) {
  if (!entryStr || !exitStr) return '';
  try {
    // converte "YYYY-MM-DDTHH:MM" para milissegundos locais
    const [eDate, eTime] = entryStr.split('T');
    const [xDate, xTime] = exitStr.split('T');
    const eParts = [...eDate.split('-').map(Number), ...eTime.split(':').map(Number)];
    const xParts = [...xDate.split('-').map(Number), ...xTime.split(':').map(Number)];
    const entry = new Date(eParts[0], eParts[1] - 1, eParts[2], eParts[3], eParts[4]);
    const exit = new Date(xParts[0], xParts[1] - 1, xParts[2], xParts[3], xParts[4]);

    const diffMs = exit.getTime() - entry.getTime();
    if (diffMs < 0) return '–';

    const diffMins = Math.floor(diffMs / 60000);
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return `${h}h ${m}m`;
  } catch {
    return '';
  }
}


// Garante que se o filtro mudar e reduzir trades, não fique em página inválida
useEffect(() => {
  if (page > totalPages) setPage(1);
}, [totalPages]);


  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const toggleSelection = (id: string) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelectAll = () => {
    const allSelected = filtered.every(t => selected[t.id]);
    const newSelection: Record<string, boolean> = {};
    if (!allSelected) {
      filtered.forEach(t => newSelection[t.id] = true);
    }
    setSelected(newSelection);
  };

  const bulkDelete = () => {
    const ids = Object.keys(selected).filter(k => selected[k]);
    if (!ids.length) return alert('Nenhum trade selecionado');
    if (!confirm(`Excluir ${ids.length} trade(s)?`)) return;
    ids.forEach(id => onDelete && onDelete(id));
    setSelected({});
  };

  const getSortIndicator = (key: string) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  // Get account type color class
  const getAccountTypeClass = (type: string) => {
    switch (type) {
      case 'Forex': return 'lavander';
      case 'Cripto': return 'orange';
      case 'Futures': return 'pink';
      case 'Personal': return 'purple';
      default: return 'gray';
    }
  };

  if (trades.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <div className="text-xl font-semibold mb-2">Nenhum trade encontrado</div>
        <div className="text-muted">
          Clique em "Novo Trade" para começar a registrar seus trades.
        </div>
      </div>
    );
  }

  return (
<div className="w-full space-y-4">
<div className="trade-table-header">
  {/* Campo de busca */}
  <input
    className="input trade-search"
    placeholder="Buscar por asset, conta, direção..."
    value={query}
    onChange={(e) => {
      setQuery(e.target.value);
      setCurrentPage(1);
    }}
  />

  {/* Paginação e contador */}
  <div className="trade-pagination">
    <div className="trade-count">
      {filtered.length > 0
        ? `${(currentPage - 1) * rowsPerPage + 1}–${Math.min(
            currentPage * rowsPerPage,
            filtered.length
          )} de ${filtered.length} trades`
        : "Nenhum trade"}
    </div>

    <div className="trade-page-controls">
      <button
        className="btn ghost small"
        style={{ padding: "6px 8px" }}
        disabled={currentPage === 1}
        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
      >
        ←
      </button>

      <div className="trade-page-label">
        Página {currentPage} / {totalPages}
      </div>

      <button
        className="btn ghost small"
        style={{ padding: "6px 8px" }}
        disabled={currentPage >= totalPages}
        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      >
        →
      </button>
    </div>
  </div>
</div>


      {/* Table */}
{isMobile ? (
  <div className="trade-cards">
    {paginated.map((t) => (
      <div
        key={t.id}
        className="trade-card"
        onClick={() => setExpanded((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
      >
        {/* Header resumido */}
        <div className="trade-header">
          <div className="trade-header-top">
            <div className="trade-asset">
              <PlatformBadge source={(t as any).source} isLive={(t as any).isLive} />
              {t.asset} <span className="muted">• {t.tf_signal || ""}</span>
            </div>
            <div className={`pill direction-${t.direction?.toLowerCase()}`}>
              {t.direction}
            </div>
          </div>

          <div className="trade-date">
            {t.entry_datetime?.slice(0, 10)} →{" "}
            {t.exit_datetime?.slice(0, 10) || "—"}
          </div>

          <div
            className={`trade-pnl ${
              Number(t.result_net) >= 0 ? "pos" : "neg"
            }`}
          >
            {fmt(Number(t.result_net))}
          </div>
        </div>

        {/* Conteúdo expandido */}
        {expanded[t.id] && (
          <div className="trade-body">
            <div className="trade-info">
              <span>📊 Strategy:</span>{" "}
              <strong>{t.strategyName || "—"}</strong>
            </div>
            <div className="trade-info">
              <span>💼 Account:</span>{" "}
              <strong>{t.accountName || resolveAccountNames(t.accounts)}</strong>
            </div>
            <div className="trade-info">
              <span>🎯 Volume:</span> <strong>{t.volume || 0}</strong>
            </div>
            <div className="trade-info">
              <span>💰 Entry:</span>{" "}
              <strong>{(t.entry_price || 0).toFixed(2)}</strong>
            </div>
            <div className="trade-info">
              <span>📉 Exit:</span>{" "}
              <strong>{(t.exit_price || 0).toFixed(2)}</strong>
            </div>

            {/* Execuções */}
            {t.PartialExecutions?.length > 0 && (
              <div className="exec-section">
                <div className="exec-title">Execuções:</div>
                {t.PartialExecutions.map((e: any, i: number) => (
                  <div key={i} className="exec-card">
                    <div className="exec-header">
                      <strong>Exec #{i + 1}</strong>
                    </div>
                    <div>Entrada: {e.entryPrice?.toFixed(2) || "—"}</div>
                    <div>Saída: {e.exitPrice?.toFixed(2) || "—"}</div>
                    <div>Vol: {e.volume}</div>
                    <div
                      className={`pnl ${
                        Number(e.result_gross || e.result_net) >= 0
                          ? "pos"
                          : "neg"
                      }`}
                    >
                      {fmt(e.result_gross ?? e.result_net ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 mt-3 justify-end">
              <button
                className="btn ghost small"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit && onEdit(t);
                }}
              >
                ✏️ Editar
              </button>
              <button
                className="btn ghost small"
                style={{ color: "#ef4444" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete && onDelete(t.id);
                }}
              >
                🗑️ Excluir
              </button>
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
) : (
      <div className="table-mini">
        <table>
          <thead>
            <tr>
              {/* Cabeçalhos da tabela */}
              <th style={{ width: 40 }}>
                <input 
                  type="checkbox" 
                  checked={filtered.length > 0 && filtered.every(t => selected[t.id])}
                  onChange={toggleSelectAll}
                />
              </th>
              <th 
                style={{ cursor: 'pointer' }} 
                onClick={() => toggleSort('entry_datetime')}
              >
                Date{getSortIndicator('entry_datetime')}
              </th>
              <th 
                style={{ cursor: 'pointer' }} 
                onClick={() => toggleSort('asset')}
              >
                Asset/TF{getSortIndicator('asset')}
              </th>
              <th>Market/Accounts</th>
              <th>Strategy</th>
              <th>Dir</th>
              
              <th>Volume</th>
              <th>Entry</th>
              <th>Exit</th>
              <th 
                style={{ cursor: 'pointer' }} 
                onClick={() => toggleSort('result_net')}
              >
                PnL ($){getSortIndicator('result_net')}
              </th>
              
              <th>Actions</th>
            </tr>
          </thead>
{/* === T corpo da tabela === */}
<tbody>
  {paginated.map(t => (
    <React.Fragment key={t.id}>
      {/* linha principal */}
      <tr
        className="hover:bg-[#071023] cursor-pointer"
        onClick={() => setExpanded(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
      >
        <td>
          <input
            type="checkbox"
            checked={!!selected[t.id]}
            onClick={(e) => { e.stopPropagation(); toggleSelection(t.id); }}
            onChange={() => {}}
          />
        </td>

<td data-label="Date">
  {(() => {
    const entry = t.entry_datetime?.slice(0, 10);
    const exit = t.exit_datetime?.slice(0, 10);
    const sameDay = !exit || entry === exit;

    // formato: 2025-10-13 → 13/10/2025
    const formatDate = (iso?: string) =>
      iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

    const entryDate = formatDate(t.entry_datetime);
    const exitDate = formatDate(t.exit_datetime);

    const formatTime = (iso?: string) =>
      iso
        ? new Date(iso).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

    const entryTime = formatTime(t.entry_datetime);
    const exitTime = formatTime(t.exit_datetime);

    const duration =
      t.exit_datetime && t.entry_datetime
        ? calculateDuration(t.entry_datetime, t.exit_datetime)
        : "";

    return (
      <>
        <div
          style={{
            fontSize: sameDay ? 16 : 12,
            lineHeight: sameDay ? "18px" : "14px",
            fontWeight: 500,
          }}
        >
          {sameDay ? entryDate : `${entryDate} → ${exitDate}`}
        </div>

        <div
          className="muted"
          style={{
            fontSize: sameDay ? 11 : 10,
            marginTop: sameDay ? 0 : 1,
          }}
        >
          {entryTime}
          {exitTime && ` → ${exitTime}`}
        </div>

        {duration && (
          <div
            className="muted"
            style={{
              fontSize: 9,
              marginTop: 1,
              opacity: 0.7,
            }}
          >
            ({duration})
          </div>
        )}
      </>
    );
  })()}
</td>


        <td data-label="Asset/TF">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FirmBadge firmLogo={t.firmLogo} firmColor={t.firmColor} firmName={t.firmName} />
            {t.asset} <span className="muted">• {t.tf_signal || ''}</span>
            {t.isLive && (
              <span
                title="Live Position"
                style={{
                  fontSize: 8, fontWeight: 700,
                  color: '#22c55e',
                  padding: '1px 4px', borderRadius: 4,
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  animation: 'pulse-badge 1.5s infinite',
                }}
              >
                LIVE
              </span>
            )}
          </div>
        </td>

        <td data-label="Market/Accounts">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {t.accountType && (
              <span
                className={`pill ${getAccountTypeClass(t.accountType)}`}
                style={{ fontSize: 8, padding: '2px 4px' }}
              >
                {t.accountType}
              </span>
            )}
            <span style={{ fontSize: 11 }}>{t.accountName || resolveAccountNames(t)}</span>
          </div>
        </td>

        <td data-label="Strategy"><div className="text-sm">{t.strategyName || '-'}</div></td>

        <td data-label="DIR">
          <span className={`pill type ${t.direction === 'Long' ? 'direction-long' : 'direction-short'}`}>
            {t.direction}
          </span>
        </td>

        <td data-label="VOL">
  {t.PartialExecutions && t.PartialExecutions.length > 1 ? (
    <>
      <span>{t.PartialExecutions.reduce((acc, p) => acc + (p.volume || 0), 0).toFixed(2)} </span>
      <div><span className="muted text-xs ml-1"style={{
      fontSize: 10,
      marginTop: 1,
      opacity: 0.9,
    }}>
        (Avg {(
          t.PartialExecutions.reduce((acc, p) => acc + (p.volume || 0), 0) /
          t.PartialExecutions.length
        ).toFixed(2)})
      </span></div>
    </>
  ) : (
    (t.volume || 0).toLocaleString()
  )}
</td>


        <td data-label="Entry">
  {t.PartialExecutions && t.PartialExecutions.length > 1 ? (
    <>
      {(
        t.PartialExecutions.reduce((acc, p) => acc + (p.entryPrice || 0), 0) /
        t.PartialExecutions.length
      ).toFixed(2)}{' '}
      <div><span className="muted text-xs ml-1"style={{
      fontSize: 10,
      marginTop: 1,
      opacity: 0.9,
    }}>
        ({t.PartialExecutions.length} execuções)
      </span></div>
    </>
  ) : (
    (t.entryVwap || t.entry_price || 0).toFixed?.(2) ?? '-'
  )}
</td>

<td data-label="Exit">
  {t.PartialExecutions && t.PartialExecutions.length > 1 ? (
    <>
      {(
        t.PartialExecutions.reduce((acc, p) => acc + (p.exitPrice || 0), 0) /
        t.PartialExecutions.length
      ).toFixed(2)}{' '}
      <div><span className="muted text-xs ml-1"style={{
      fontSize: 10,
      marginTop: 1,
      opacity: 0.9,
    }}>
        ({t.PartialExecutions.length} execuções)
      </span></div>
    </>
  ) : (
    (t.exitVwap || t.exit_price || 0).toFixed?.(2) ?? '-'
  )}
</td>

<td data-label="PNL" className="font-medium">
  {(() => {
    const partials = t.PartialExecutions || [];
    const totalR = partials.length > 0
      ? partials.reduce((acc, p) => acc + (Number(p.result_R) || 0), 0)
      : (Number(t.result_R) || 0);
    const avgGross = partials.length > 0
      ? partials.reduce((acc, p) => acc + (Number(p.result_gross) || 0), 0) / partials.length
      : 0;

    const pnl = fmt(Number(t.result_net || 0));
    const pnlClass = Number(t.result_net || 0) >= 0 ? 'pos' : 'neg';
    const rClass = totalR >= 0 ? 'pos' : 'neg';
    const hasR = totalR !== 0 || (partials.length === 0 && t.result_R);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className={pnlClass}>{pnl}</span>
        {hasR && (
          <span className={`${rClass}`} style={{ fontSize: 10, opacity: 0.9 }}>
            ({totalR.toFixed(2)} R)
          </span>
        )}
        {partials.length > 1 && (
          <span className="muted text-xs ml-1" style={{ fontSize: 10, opacity: 0.8 }}>
            (Avg {fmt(avgGross)})
          </span>
        )}
      </div>
    );
  })()}
</td>

        <td data-label="Actions">
          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn ghost small"
              onClick={() => onEdit && onEdit(t)}
              title="Editar trade"
            >✏️</button>

            <button
              className="btn ghost small"
              onClick={() => onDelete && onDelete(t.id)}
              title="Excluir trade"
              style={{ color: '#e74c3c' }}
            >🗑️</button>
          </div>
        </td>
      </tr>

      {/* linha expansível com execuções parciais */}
      {expanded[t.id] && (t.PartialExecutions && t.PartialExecutions.length > 0) && (
        <tr className="expanded-row">
          {/* ajuste COL_COUNT se precisar (aqui usei 11 como no header) */}
          <td colSpan={11} style={{ padding: 12, background: '#071023' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {t.PartialExecutions.map((e: any, i: number) => (
 <div
  key={e.id || i}
  style={{
    minWidth: 240,
    maxWidth: 280,
    padding: 12,
    borderRadius: 8,
    background: '#0b1624',
    border: '1px solid rgba(255,255,255,0.03)',
  }}
>
  <div style={{ fontWeight: 700, marginBottom: 8 }}>Exec #{i + 1}</div>

  {/* Linha 1 - Entrada + TP */}
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 13,
      color: '#cbd5e1',
      marginBottom: 2,
    }}
  >
    <div>
      Entrada: <strong>{(e.entryPrice ?? e.entry_price ?? 0).toFixed?.(2)}</strong>
    </div>
    <div style={{ opacity: 0.9 }}>
      TP: <strong>{(e.take_profit ?? 0).toFixed(2)}</strong>
    </div>
  </div>

  {/* Linha 2 - Saída + SL */}
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 13,
      color: '#cbd5e1',
      marginBottom: 2,
    }}
  >
    <div>
      Saída: <strong>{(e.exitPrice ?? e.exit_price ?? 0).toFixed?.(2)}</strong>
    </div>
    <div style={{ opacity: 0.9 }}>
      SL: <strong>{(e.stop_loss ?? 0).toFixed(2)}</strong>
    </div>
  </div>

  {/* Volume */}
  <div className="muted" style={{ fontSize: 13 }}>
    Vol: <strong>{(e.volume ?? 0).toLocaleString()}</strong>
  </div>

  {/* PnL */}
  <div style={{ height: 6 }} />
  <div style={{ fontSize: 15 }}>
    PnL: <strong>{fmt(e.result_gross ?? e.result_net ?? 0)}</strong>
  </div>

  {/* Datas */}
  <div
    className="muted"
    style={{
      fontSize: 9,
      marginTop: 6,
      opacity: 0.8,
    }}
  >
    {e.entry_datetime
      ? new Date(e.entry_datetime).toLocaleString('pt-BR')
      : '-'}{' '}
    →{' '}
    {e.exit_datetime
      ? new Date(e.exit_datetime).toLocaleString('pt-BR')
      : '-'}
  </div>
</div>

              ))}
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  ))}
</tbody>

        </table>
      </div>)}

      {filtered.length === 0 && query && (
        <div className="text-center py-8">
          <div className="text-muted">
            Nenhum trade encontrado para "{query}"
          </div>
          <button 
            className="btn ghost mt-2" 
            onClick={() => setQuery('')}
          >
            Limpar busca
          </button>
        </div>
      )}
    </div>
  );
}