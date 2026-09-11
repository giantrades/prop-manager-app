// Positions (live) — posições abertas vindas da ponte (Quantower/cTrader). Permite
// gerenciar SL/TP (`modifyPosition`) e fechar (`closePosition`). Nada de storage
// próprio: a fonte é a plataforma; aqui é só leitura + comandos ao bridge.
import { fmtMoney } from '@apps/ui/currency';
import React, { useMemo, useRef, useState } from 'react';
import { usePlatform, bridgePrefs } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import ModuleTabs from '../../ModuleTabs';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { Activity, RefreshCw, X } from 'lucide-react';


export default function LivePositionsPage() {
  const { livePositions, statuses, lastSync, refreshStatuses } = usePlatform();
  const { toast } = useToast();
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const adapterRef = useRef(null);
  if (!adapterRef.current) {
    const { bridgeUrl, bridgeToken } = bridgePrefs();
    adapterRef.current = new QuantowerAdapter({ bridgeUrl, bridgeToken });
  }

  const online = statuses.some((s) => s.online);
  const totals = useMemo(() => {
    const pnl = livePositions.reduce((s, p) => s + (p.netPnl ?? 0), 0);
    const long = livePositions.filter((p) => p.side === 'Long').length;
    const short = livePositions.filter((p) => p.side === 'Short').length;
    return { pnl, long, short };
  }, [livePositions]);

  const setEdit = (id, k, v) => setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [k]: v } }));
  const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

  const saveSl = async (p) => {
    const e = edits[p.platformPositionId] ?? {};
    const sl = 'sl' in e ? num(e.sl) : p.sl;
    const tp = 'tp' in e ? num(e.tp) : p.tp;
    setBusy(p.platformPositionId);
    try {
      await adapterRef.current.modifyPosition({ platformPositionId: p.platformPositionId, sl, tp });
      toast(`SL/TP atualizados — ${p.symbol}`);
      setEdits((prev) => { const n = { ...prev }; delete n[p.platformPositionId]; return n; });
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao atualizar ${p.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  const close = async (p) => {
    setBusy(p.platformPositionId);
    try {
      await adapterRef.current.closePosition(p);
      toast(`Posição fechada — ${p.symbol}`);
      setConfirmId(null);
      refreshStatuses();
    } catch (err) {
      toast(`Falha ao fechar ${p.symbol}: ${err instanceof Error ? err.message : err}`, { type: 'error' });
    } finally { setBusy(null); }
  };

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Positions</h1>
        <button className="cmd-refresh" onClick={() => refreshStatuses()}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>
      <ModuleTabs module="trading" />

      <div className="lp-status" role="status">
        <span className={`lp-dot ${online ? 'on' : 'off'}`} />
        <span>{online ? 'Plataforma conectada' : 'Plataforma offline — abra o bridge'}</span>
        <span className="lp-muted">{livePositions.length} posição(ões){lastSync ? ` · último sync ${new Date(lastSync).toLocaleTimeString('pt-BR')}` : ''}</span>
      </div>

      {online && livePositions.length > 0 && (
        <div className="dash-cards">
          <div className={`card ${totals.pnl >= 0 ? 'accent1' : 'accent2'}`}>
            <h3>PnL aberto</h3>
            <div className="stat">{fmtMoney(totals.pnl)}</div>
            <div className="muted">líquido das posições</div>
          </div>
          <div className="card accent3"><h3>Long</h3><div className="stat">{totals.long}</div><div className="muted">posições</div></div>
          <div className="card accent4"><h3>Short</h3><div className="stat">{totals.short}</div><div className="muted">posições</div></div>
          <div className="card accent5"><h3>Total</h3><div className="stat">{livePositions.length}</div><div className="muted">abertas</div></div>
        </div>
      )}

      {!online ? (
        <div className="lp-empty" role="status"><Activity size={18} /> Sem conexão. Configure o bridge em Sistema → Quantower.</div>
      ) : livePositions.length === 0 ? (
        <div className="lp-empty" role="status">Nenhuma posição aberta agora.</div>
      ) : (
        <div className="lp-list">
          <div className="lp-row lp-head" aria-hidden="true">
            <span>Símbolo</span><span>Lado</span><span>Qtd</span><span>Abertura</span><span>Atual</span><span>PnL</span><span>SL</span><span>TP</span><span>Ações</span>
          </div>
          {livePositions.map((p) => {
            const e = edits[p.platformPositionId] ?? {};
            const slVal = 'sl' in e ? e.sl : (p.sl ?? '');
            const tpVal = 'tp' in e ? e.tp : (p.tp ?? '');
            const dirty = 'sl' in e || 'tp' in e;
            const confirming = confirmId === p.platformPositionId;
            return (
              <div key={p.platformPositionId} className="lp-row">
                <span className="lp-sym">{p.symbol}<span className="lp-acct">{p.accountName || p.connectionName || ''}</span></span>
                <span className={`lp-side ${p.side === 'Long' ? 'dash-pos' : 'dash-neg'}`}>{p.side}</span>
                <span className="lp-num">{p.quantity}</span>
                <span className="lp-num">{fmtMoney(p.openPrice)}</span>
                <span className="lp-num">{fmtMoney(p.currentPrice)}</span>
                <span className={`lp-num ${(p.netPnl ?? 0) >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(p.netPnl)}</span>
                <input className="lp-input" type="number" step="0.00001" value={slVal} placeholder="SL" onChange={(ev) => setEdit(p.platformPositionId, 'sl', ev.target.value)} aria-label={`Stop loss ${p.symbol}`} />
                <input className="lp-input" type="number" step="0.00001" value={tpVal} placeholder="TP" onChange={(ev) => setEdit(p.platformPositionId, 'tp', ev.target.value)} aria-label={`Take profit ${p.symbol}`} />
                <span className="lp-actions">
                  <button className="ac3-btn ac3-btn-sm" disabled={!dirty || busy === p.platformPositionId} onClick={() => saveSl(p)}>Salvar</button>
                  {confirming ? (
                    <>
                      <button className="ac3-btn ac3-btn-sm ac3-btn-danger" disabled={busy === p.platformPositionId} onClick={() => close(p)}>Confirmar</button>
                      <button className="ac3-btn ac3-btn-sm" onClick={() => setConfirmId(null)} aria-label="Cancelar"><X size={13} /></button>
                    </>
                  ) : (
                    <button className="ac3-btn ac3-btn-sm ac3-btn-danger" onClick={() => setConfirmId(p.platformPositionId)}>Fechar</button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const LP_CSS = `
.lp-status { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text); padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); }
.lp-muted { color: var(--muted, #a1a7b3); margin-left: auto; }
.lp-dot { width: 9px; height: 9px; border-radius: 50%; }
.lp-dot.on { background: var(--green, #2ecc71); box-shadow: 0 0 8px rgba(46,204,113,0.6); }
.lp-dot.off { background: var(--red, #e74c3c); }
.lp-empty { display: flex; align-items: center; gap: 8px; padding: 28px; justify-content: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 14px; }
.lp-list { display: flex; flex-direction: column; gap: 6px; background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.lp-row { display: grid; grid-template-columns: 1.4fr 0.7fr 0.6fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr auto; gap: 8px; align-items: center; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 12px; }
.lp-head { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); border-bottom: 1px solid rgba(255,255,255,0.08); }
.lp-sym { font-weight: 700; display: flex; flex-direction: column; }
.lp-acct { font-size: 10px; color: var(--muted, #a1a7b3); font-weight: 400; }
.lp-side { font-weight: 700; }
.lp-num { font-variant-numeric: tabular-nums; }
.lp-input { width: 100%; min-width: 64px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text, #e7eaf0); font-size: 12px; padding: 7px 8px; min-height: 38px; font-family: inherit; }
.lp-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.lp-actions { display: flex; gap: 6px; justify-content: flex-end; }
@media (max-width: 900px) {
  .lp-row { grid-template-columns: 1fr 1fr 1fr; }
  .lp-head { display: none; }
  .lp-sym { grid-column: 1 / -1; }
  .lp-actions { grid-column: 1 / -1; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('lp-styles')) {
  const style = document.createElement('style');
  style.id = 'lp-styles';
  style.textContent = LP_CSS;
  document.head.appendChild(style);
}
