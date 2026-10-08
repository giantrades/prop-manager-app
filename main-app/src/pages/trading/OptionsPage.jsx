// OptionsPage — módulo Opções do Trading (aba nova). Sub-abas: Analyzer (offline) ·
// Desk (chain) · Smile (IV) · Posições (derivadas de option_legs). Container: liga a UI
// ao motor (`useFinance`) e faz o fluxo de Paper → salvar como posição.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md

import React, { useCallback, useEffect, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import OptionAnalyzer from '@apps/ui/options/OptionAnalyzer';
import OptionDesk from '@apps/ui/options/OptionDesk';
import OptionSmile from '@apps/ui/options/OptionSmile';
import OptionPositions from '@apps/ui/options/OptionPositions';
import { useFinance } from '@apps/state';
import { buildOptionLegFromQuote, optionAssignment } from '@apps/lib/db';
import { useToast } from '@apps/ui/Toast';

const TABS = [
  { id: 'analyzer', label: 'Analyzer' },
  { id: 'desk', label: 'Desk' },
  { id: 'smile', label: 'Smile' },
  { id: 'positions', label: 'Posições' },
];

export default function OptionsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const [tab, setTab] = useState('analyzer');
  const [quotes, setQuotes] = useState([]);
  const [legs, setLegs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [paper, setPaper] = useState([]);
  const [spot, setSpot] = useState(38);

  const reload = useCallback(async () => {
    if (!finance?.ds) return;
    const [q, l, a] = await Promise.all([
      finance.ds.optionChain.list(),
      finance.ds.optionLegs.list(),
      finance.ds.accounts.list(),
    ]);
    setQuotes(q);
    setLegs(l);
    setAccounts(a);
  }, [finance]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!finance?.ds) return undefined;
    return finance.ds.bus.on('datastore:change', () => reload());
  }, [finance, reload]);

  const addPaper = useCallback((quote, qty) => {
    const leg = buildOptionLegFromQuote(quote, {
      accountId: accounts[0]?.id ?? '',
      qty,
      source: 'manual',
    });
    setPaper((p) => [...p, leg]);
  }, [accounts]);

  const savePaper = useCallback(async () => {
    if (!finance?.ds || paper.length === 0) return;
    const groupId = `grp_${Date.now().toString(36)}`;
    await finance.ds.optionLegs.bulkPut(paper.map((l) => ({ ...l, groupId })), { source: 'local' });
    setPaper([]);
    toast(`Estratégia salva (${paper.length} perna(s)).`);
    reload();
  }, [finance, paper, reload, toast]);

  const deleteLegs = useCallback(async (ids) => {
    if (!finance?.ds) return;
    for (const id of ids) await finance.ds.optionLegs.remove(id, { source: 'local' });
    reload();
  }, [finance, reload]);

  // Assignment: put vendida exercida → cria a posição de ações com cost basis; call → entrega.
  const assignLeg = useCallback(async (leg) => {
    if (!finance?.ds) return;
    const res = optionAssignment(leg);
    // Fecha a perna (exercida) no ledger de opções.
    await finance.ds.optionLegs.put(
      { ...leg, exitPrice: 0, exitDatetime: new Date().toISOString() },
      { source: 'local' },
    );
    if (res.position) {
      await finance.ds.positions.put(res.position, { source: 'local' });
      toast(`Assignment: ${res.position.qty} ${res.position.symbol} a ${res.position.avgPrice.toFixed(2)}.`);
    } else if (res.proceedsPerShare != null) {
      toast(`Exercício (call): entrega a ${res.proceedsPerShare.toFixed(2)}/ação.`);
    } else {
      toast('Perna não gera assignment.', { type: 'warn' });
    }
    reload();
  }, [finance, reload, toast]);

  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Opções</h1>
        <div className="cmd-actions">
          <label className="op-spot"><span>Spot</span>
            <input className="input" type="number" value={spot} onChange={(e) => setSpot(Number(e.target.value))} aria-label="Preço do subjacente" />
          </label>
        </div>
      </div>
      <div className="op-topbar">
        <ModuleTabs module="trading" />
        <div className="op-tabs" role="tablist" aria-label="Visão de Opções">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`op-tab${tab === t.id ? ' active' : ''}`}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {paper.length > 0 && (
        <div className="card op-paper" role="region" aria-label="Paper positions">
          <span><b>{paper.length}</b> perna(s) no paper</span>
          <span className="muted op-paper-list">
            {paper.map((l) => `${l.qty >= 0 ? '+' : ''}${l.qty} ${l.symbol}`).join(' · ')}
          </span>
          <div className="op-paper-actions">
            <button className="cmd-refresh" onClick={() => setPaper([])}>Limpar</button>
            <button className="cmd-refresh" onClick={savePaper}>Salvar estratégia</button>
          </div>
        </div>
      )}

      {tab === 'analyzer' && <OptionAnalyzer />}
      {tab === 'desk' && <OptionDesk quotes={quotes} spot={spot} onAddPaper={addPaper} />}
      {tab === 'smile' && <OptionSmile quotes={quotes} spot={spot} />}
      {tab === 'positions' && <OptionPositions legs={legs} spot={spot} onDelete={deleteLegs} onAssign={assignLeg} />}

      {current && <style>{OP_CSS}</style>}
    </div>
  );
}

const OP_CSS = `
.op-topbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.op-topbar .ws-tabs { margin: 0; flex: 0 1 auto; }
.op-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.op-tab { padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 13px; cursor: pointer; font-weight: 600; }
.op-tab.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); }
.op-spot { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted, #a1a7b3); }
.op-spot .input { width: 90px; }
.op-paper { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 14px; }
.op-paper-list { font-size: 12px; flex: 1 1 auto; }
.op-paper-actions { display: flex; gap: 8px; }
@media (max-width: 720px) { .op-tabs { order: 3; width: 100%; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('op-styles')) {
  const style = document.createElement('style');
  style.id = 'op-styles';
  style.textContent = OP_CSS;
  document.head.appendChild(style);
}
