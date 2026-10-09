// OptionsPage — módulo Opções do Trading. Sub-abas: Analyzer · Desk · Cotações · Smile ·
// Posições. Container: liga a UI ao motor (`useFinance` → DataService) e implementa os
// fluxos: cotação manual/CSV → Desk → paper → (risk gate) → posição → fechar/rolar/exercer.
// Toda escrita passa pelo DataService; toda fórmula vem de `@apps/lib/db` (§ Opções).
// Parâmetros (spot por subjacente, taxa, multiplicador padrão, estresse) persistem em `meta`.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import OptionAnalyzer from '@apps/ui/options/OptionAnalyzer';
import OptionSmile from '@apps/ui/options/OptionSmile';
import OptionPositions from '@apps/ui/options/OptionPositions';
import OptionChainEditor from '@apps/ui/options/OptionChainEditor';
import OptionLegForm from '@apps/ui/options/OptionLegForm';
import OptionBoundary from '@apps/ui/options/OptionBoundary';
import { ensureOptionStyles } from '@apps/ui/options/optionStyles';
import { useFinance, bridgePrefs } from '@apps/state';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import {
  closeOptionLeg,
  enrichOptionQuote,
  groupOptionLegs,
  optionAssignment,
  optionNakedExposure,
  recordOptionPremium,
  syncOptionsFromBridge,
} from '@apps/lib/db';
import { fmtMoney } from '@apps/ui/currency';
import { useToast } from '@apps/ui/Toast';

ensureOptionStyles();

const TABS = [
  { id: 'analyzer', label: 'Analyzer' },
  { id: 'quotes', label: 'Cotações' },
  { id: 'smile', label: 'Smile' },
  { id: 'positions', label: 'Posições' },
];

const SETTINGS_KEY = 'options.settings';
const DEFAULT_SETTINGS = { spots: {}, ratePct: 5, stressPct: 20, defaultMultiplier: null };

function newGroupId() {
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export default function OptionsPage() {
  const finance = useFinance();
  const { toast } = useToast();
  const [tab, setTab] = useState('analyzer');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [legs, setLegs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [stockPositions, setStockPositions] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [paper, setPaper] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [gate, setGate] = useState(null);
  const [preload, setPreload] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bridgeList, setBridgeList] = useState([]);
  const settingsLoaded = useRef(false);

  const ds = finance?.ds;

  const reload = useCallback(async () => {
    if (!ds) return;
    try {
      const [q, l, a, p] = await Promise.all([ds.optionChain.list(), ds.optionLegs.list(), ds.accounts.list(), ds.positions.list()]);
      setQuotes(q);
      setLegs(l);
      setAccounts(a);
      setStockPositions(p);
      setLoadError(null);
    } catch (err) {
      setLoadError(err?.message || 'falha ao ler os dados locais');
    } finally {
      setLoading(false);
    }
  }, [ds]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!ds) return undefined;
    return ds.bus.on('datastore:change', () => reload());
  }, [ds, reload]);

  // Lista de subjacentes com opções no Quantower (para a busca). Best-effort (bridge off = []).
  const loadBridgeList = useCallback(async () => {
    try {
      const { bridgeUrl, bridgeToken } = bridgePrefs();
      const adapter = new QuantowerAdapter({ bridgeUrl, bridgeToken });
      const list = await adapter.getOptionUnderlyings();
      setBridgeList(Array.isArray(list) ? list : []);
    } catch {
      /* bridge off */
    }
  }, []);
  useEffect(() => { loadBridgeList(); }, [loadBridgeList]);

  // Parâmetros persistidos (carrega uma vez; depois o estado local é a fonte).
  useEffect(() => {
    if (!ds || settingsLoaded.current) return;
    settingsLoaded.current = true;
    ds.meta.getKey(SETTINGS_KEY).then((m) => {
      if (m?.value && typeof m.value === 'object') setSettings({ ...DEFAULT_SETTINGS, ...m.value });
    }).catch(() => {});
  }, [ds]);

  const saveSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (ds) ds.meta.setKey(SETTINGS_KEY, next).catch(() => toast('Não foi possível salvar os parâmetros.', { type: 'error' }));
      return next;
    });
  }, [ds, toast]);

  // Conta padrão: primeira de investimento, senão a primeira.
  useEffect(() => {
    if (accountId || accounts.length === 0) return;
    setAccountId((accounts.find((a) => a.kind === 'investment') ?? accounts[0]).id);
  }, [accounts, accountId]);

  const rate = settings.ratePct / 100;
  const spots = settings.spots;

  const underlyings = useMemo(
    () => [...new Set([...quotes.map((q) => q.underlying), ...legs.map((l) => l.underlying), ...Object.keys(spots)])].sort(),
    [quotes, legs, spots],
  );
  const underlyingOptions = useMemo(() => {
    const map = new Map();
    for (const x of bridgeList) if (x?.underlying) map.set(x.underlying, { underlying: x.underlying, count: x.count });
    for (const u of underlyings) if (!map.has(u)) map.set(u, { underlying: u });
    return [...map.values()];
  }, [bridgeList, underlyings]);
  const multipliers = useMemo(() => {
    const m = {};
    for (const l of legs) if (l.multiplier > 0) m[l.underlying] = l.multiplier;
    for (const q of quotes) if (q.multiplier > 0) m[q.underlying] = q.multiplier;
    return m;
  }, [quotes, legs]);
  const sharesByUnderlying = useMemo(() => {
    const m = {};
    for (const p of stockPositions) {
      if (p.assetKind && p.assetKind !== 'equity') continue;
      m[p.symbol] = (m[p.symbol] ?? 0) + (p.qty ?? 0);
    }
    return m;
  }, [stockPositions]);
  const accountNames = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const accountCurrency = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.currency])), [accounts]);
  const groups = useMemo(() => groupOptionLegs(legs), [legs]);
  const chains = useMemo(() => {
    const m = new Map();
    for (const q of quotes) {
      const k = `${q.underlying}|${q.expiry}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([k, count]) => { const [underlying, expiry] = k.split('|'); return { underlying, expiry, count }; })
      .sort((a, b) => a.underlying.localeCompare(b.underlying) || a.expiry.localeCompare(b.expiry));
  }, [quotes]);

  // ---- spot por subjacente (re-enriquece cotações sem IV ao informar o spot) ----
  const setSpot = useCallback(async (underlying, value) => {
    const u = String(underlying).trim().toUpperCase();
    if (!u || !(value > 0)) return;
    saveSettings({ spots: { ...spots, [u]: value } });
    if (!ds) return;
    const changed = [];
    for (const q of quotes) {
      if (q.underlying !== u || q.iv != null) continue;
      const e = enrichOptionQuote(q, { spot: value, r: rate });
      if (e !== q) changed.push(e);
    }
    if (changed.length) await ds.optionChain.bulkPut(changed, { source: 'local' });
  }, [ds, quotes, rate, saveSettings, spots]);

  // ---- cotações ----
  const saveQuotes = useCallback(async (list) => {
    if (!ds || list.length === 0) return;
    const enriched = list.map((q) => enrichOptionQuote(q, { spot: spots[q.underlying], r: rate }));
    await ds.optionChain.bulkPut(enriched, { source: 'local' });
    const derived = enriched.filter((q) => q.derivedFields?.length).length;
    toast(`${enriched.length} cotação(ões) salva(s)${derived ? ` · IV/gregas calculadas em ${derived}` : ''}.`);
  }, [ds, rate, spots, toast]);

  const clearChain = useCallback(async (underlying, expiry) => {
    if (!ds) return;
    const ids = quotes.filter((q) => q.underlying === underlying && q.expiry === expiry).map((q) => q.id);
    for (const id of ids) await ds.optionChain.remove(id, { source: 'local' });
    toast(`Cadeia ${underlying} ${expiry} removida.`);
  }, [ds, quotes, toast]);

  // ---- risk gate (A2): avisa antes de gravar venda descoberta ----
  const requestSave = useCallback((newLegs, persist, label) => {
    const byUnderlying = new Map();
    for (const l of newLegs) {
      if (!byUnderlying.has(l.underlying)) byUnderlying.set(l.underlying, []);
      byUnderlying.get(l.underlying).push(l);
    }
    const risky = [];
    for (const [underlying, ls] of byUnderlying) {
      const spot = spots[underlying];
      const exp = optionNakedExposure(ls, {
        spot: spot > 0 ? spot : ls[0].strike,
        stressPct: settings.stressPct / 100,
        shares: sharesByUnderlying[underlying] ?? 0,
      });
      if (exp.naked) risky.push({ underlying, exp, approx: !(spot > 0), currency: accountCurrency[ls[0].accountId] ?? 'USD' });
    }
    if (risky.length === 0) return persist();
    setGate({ risky, persist, label });
    return undefined;
  }, [accountCurrency, settings.stressPct, sharesByUnderlying, spots]);

  // ---- paper ----
  const sendToPaper = useCallback((list) => {
    setPaper((p) => [
      ...p,
      ...list.map((l, i) => ({ ...l, id: `leg_${Date.now().toString(36)}_${i}`, accountId, groupId: undefined })),
    ]);
    toast(`${list.length} perna(s) enviada(s) ao paper.`);
  }, [accountId, toast]);

  const savePaper = useCallback(() => {
    if (!ds || paper.length === 0) return;
    if (!accountId) { toast('Escolha a conta antes de salvar.', { type: 'warn' }); return; }
    const groupId = newGroupId();
    const toSave = paper.map((l) => ({ ...l, accountId, groupId }));
    requestSave(toSave, async () => {
      await ds.optionLegs.bulkPut(toSave, { source: 'local' });
      setPaper([]);
      toast(`Estratégia salva (${toSave.length} perna(s)).`);
      setTab('positions');
    }, 'Salvar estratégia do paper');
  }, [accountId, ds, paper, requestSave, toast]);

  // ---- posições ----
  const registerLegs = useCallback((list) => {
    if (!ds) return undefined;
    return requestSave(list, async () => {
      await ds.optionLegs.bulkPut(list, { source: 'local' });
      toast(`Operação registrada (${list.length} perna(s)).`);
      setShowForm(false);
    }, 'Registrar operação');
  }, [ds, requestSave, toast]);

  // Salvar a estratégia montada no Analyzer como posição real (mesmo risk gate).
  const saveAnalyzerLegs = useCallback((list) => {
    if (!ds) return undefined;
    if (!accountId) { toast('Escolha a conta antes de salvar.', { type: 'warn' }); return undefined; }
    const withGroup = list.map((l) => ({ ...l, groupId: newGroupId(), accountId }));
    return requestSave(withGroup, async () => {
      await ds.optionLegs.bulkPut(withGroup, { source: 'local' });
      toast(`Estratégia salva (${withGroup.length} perna(s)).`);
      setTab('positions');
    }, 'Salvar estratégia');
  }, [accountId, ds, requestSave, toast]);

  // Sync com o bridge Quantower: puxa vencimentos + cadeia + posições de opções.
  const handleSync = useCallback(async () => {
    if (!ds) return;
    const { bridgeUrl, bridgeToken } = bridgePrefs();
    const adapter = new QuantowerAdapter({ bridgeUrl, bridgeToken });
    setSyncing(true);
    try {
      const res = await syncOptionsFromBridge(ds, {
        underlyings: () => adapter.getOptionUnderlyings(),
        expiries: (u) => adapter.getOptionExpiries(u),
        chain: (u, e, depth) => adapter.getOptionChain(u, e, depth),
        positions: () => adapter.getOptionPositions().then((positions) => ({ positions })),
      }, { underlyings, depth: 15, defaultMultiplier: settings.defaultMultiplier ?? undefined });
      if (res.quotes === 0 && res.legs === 0) {
        toast('Quantower: nenhuma opção encontrada. Carregue a cadeia na plataforma (Option Analytics / watchlist) e tente de novo.', { type: 'warn', durationMs: 10000 });
      } else {
        toast(`Quantower: ${res.quotes} cotação(ões) · ${res.legs} posição(ões)${res.rejectedQuotes ? ` · ${res.rejectedQuotes} rejeitada(s)` : ''}.`);
      }
      reload();
    } catch (e) {
      toast(`Falha no sync: ${e?.message ?? e}`, { type: 'error' });
    } finally {
      setSyncing(false);
    }
  }, [ds, underlyings, settings.defaultMultiplier, toast, reload, loadBridgeList]);

  const importLegs = useCallback(async (list) => {
    if (!ds) return;
    const existing = new Set(legs.map((l) => l.id));
    const fresh = list.filter((l) => !existing.has(l.id));
    if (fresh.length) await ds.optionLegs.bulkPut(fresh, { source: 'local' });
    toast(`${fresh.length} perna(s) importada(s)${list.length - fresh.length ? ` · ${list.length - fresh.length} já existiam` : ''}.`);
  }, [ds, legs, toast]);

  const closeLegs = useCallback(async (closed) => {
    if (!ds) return;
    await ds.optionLegs.bulkPut(closed, { source: 'local' });
    // Prêmio realizado das estratégias que fecharam agora entra no ledger (idempotente).
    const fresh = await ds.optionLegs.list();
    await recordOptionPremium(ds, fresh).catch(() => {});
    toast(`Posição fechada (${closed.length} perna(s)).`);
  }, [ds, toast]);

  const roll = useCallback((plan) => {
    if (!ds || !plan.complete) return undefined;
    const when = new Date().toISOString();
    const closed = plan.items.map((it) => closeOptionLeg(it.leg, { exitPrice: it.closePrice, exitDatetime: when }));
    const opened = plan.items.map((it) => ({ ...it.next, tags: [...(it.next.tags ?? []), 'roll'] }));
    return requestSave(opened, async () => {
      await ds.optionLegs.bulkPut([...closed, ...opened], { source: 'local' });
      const fresh = await ds.optionLegs.list();
      await recordOptionPremium(ds, fresh).catch(() => {});
      toast(`Rolagem registrada: ${plan.netCredit >= 0 ? 'crédito' : 'débito'} de ${fmtMoney(Math.abs(plan.netCredit), accountCurrency[closed[0]?.accountId] ?? 'USD')}.`);
    }, 'Confirmar rolagem');
  }, [accountCurrency, ds, requestSave, toast]);

  const deleteLegs = useCallback(async (ids) => {
    if (!ds) return;
    for (const id of ids) await ds.optionLegs.remove(id, { source: 'local' });
    toast('Registro excluído.');
  }, [ds, toast]);

  // Assignment: put vendida exercida vira posição de ações (cost basis); call vendida = entrega.
  const assignLeg = useCallback(async (leg) => {
    if (!ds) return;
    const res = optionAssignment(leg);
    await ds.optionLegs.put({ ...leg, exitPrice: 0, exitDatetime: new Date().toISOString() }, { source: 'local' });
    const fresh = await ds.optionLegs.list();
    await recordOptionPremium(ds, fresh).catch(() => {});
    if (res.position) {
      await ds.positions.put(res.position, { source: 'local' });
      toast(`Assignment: ${res.position.qty} ${res.position.symbol} a ${res.position.avgPrice.toFixed(2)}.`);
    } else if (res.proceedsPerShare != null) {
      toast(`Exercício (call): entrega a ${res.proceedsPerShare.toFixed(2)}/ação.`);
    } else {
      toast('Perna não gera assignment.', { type: 'warn' });
    }
  }, [ds, toast]);

  const analyzeGroup = useCallback((g) => {
    setPreload({ id: Date.now(), legs: g.legs.filter((l) => l.exitPrice == null), underlying: g.underlying });
    setTab('analyzer');
  }, []);

  const openPaperInAnalyzer = useCallback(() => {
    setPreload({ id: Date.now(), legs: paper, underlying: paper[0]?.underlying ?? '' });
    setTab('analyzer');
  }, [paper]);

  const confirmGate = async () => {
    const g = gate;
    setGate(null);
    if (g) await g.persist();
  };

  if (loading) {
    return (
      <div className="cmd-page">
        <div className="cmd-page-head"><h1 className="cmd-page-title">Opções</h1></div>
        <ModuleTabs module="trading" />
        <div className="opx-stack" role="status" aria-label="Carregando opções">
          <div className="opx-skel" /><div className="opx-skel" style={{ minHeight: 220 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Opções</h1>
        <div className="cmd-actions">
          <button type="button" className="cmd-refresh" onClick={handleSync} disabled={syncing || !ds}>
            {syncing ? 'Sincronizando…' : 'Sincronizar Quantower'}
          </button>
        </div>
      </div>
      <ModuleTabs module="trading" />

      {loadError && (
        <div className="opx-alert bad" role="alert">
          <b>Não foi possível carregar os dados de opções.</b>
          <span>{loadError}. Tente novamente; seus dados locais não foram alterados.</span>
          <div className="opx-row"><button type="button" className="opx-btn" onClick={reload}>Tentar novamente</button></div>
        </div>
      )}

      <details className="card opxa-toolbar" style={{ padding: '6px 12px' }}>
        <summary className="opx-title" style={{ cursor: 'pointer', minHeight: 28, display: 'flex', alignItems: 'center', listStyle: 'none' }}>
          Parâmetros globais {underlyings.length > 0 && <span className="opx-muted opx-small" style={{ marginLeft: 8 }}>({underlyings.length} subjacente(s))</span>}
        </summary>
        <div className="opx-fields" style={{ marginTop: 8, width: '100%' }}>
          {underlyings.map((u) => (
            <label key={u} className="opx-field"><span>Spot {u}</span>
              <input className="input" type="number" inputMode="decimal" defaultValue={spots[u] ?? ''} key={`${u}${spots[u] ?? ''}`} placeholder="preço atual" onBlur={(e) => setSpot(u, Number(e.target.value))} />
            </label>
          ))}
          <label className="opx-field"><span>Novo subjacente</span>
            <input className="input" placeholder="ex.: AAPL (Enter)" onKeyDown={(e) => { if (e.key === 'Enter') { const u = e.currentTarget.value.trim().toUpperCase(); if (u) { saveSettings({ spots: { ...spots, [u]: spots[u] ?? 0 } }); e.currentTarget.value = ''; } } }} />
          </label>
          <label className="opx-field"><span>Taxa livre de risco (% a.a.)</span>
            <input className="input" type="number" inputMode="decimal" defaultValue={settings.ratePct} key={`r${settings.ratePct}`} onBlur={(e) => { const v = Number(e.target.value); if (v >= 0) saveSettings({ ratePct: v }); }} />
          </label>
          <label className="opx-field"><span>Multiplicador padrão</span>
            <input className="input" type="number" inputMode="decimal" defaultValue={settings.defaultMultiplier ?? ''} key={`m${settings.defaultMultiplier ?? ''}`} placeholder="ex.: 100" onBlur={(e) => { const v = Number(e.target.value); saveSettings({ defaultMultiplier: v > 0 ? v : null }); }} />
          </label>
          <label className="opx-field"><span>Estresse do risk gate (± %)</span>
            <input className="input" type="number" inputMode="decimal" defaultValue={settings.stressPct} key={`s${settings.stressPct}`} onBlur={(e) => { const v = Number(e.target.value); if (v > 0) saveSettings({ stressPct: v }); }} />
          </label>
        </div>
        <span className="opx-small opx-muted">Spot por subjacente é necessário para P/L teórico, risco e destaque ATM. O multiplicador do contrato nunca é assumido pelo app.</span>
      </details>

      <div className="opx-tabs" role="tablist" aria-label="Visão de Opções">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="opx-tab" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {gate && (
        <div className={`opx-alert ${gate.risky.some((r) => r.exp.unbounded) ? 'bad' : 'warn'}`} role="alertdialog" aria-label="Confirmar risco">
          <b>Risco de venda descoberta — {gate.label}</b>
          {gate.risky.map((r) => (
            <span key={r.underlying}>
              {r.underlying}: {r.exp.unbounded ? 'perda teórica ilimitada (call sem cobertura)' : `put vendida sem hedge, perda máxima ${fmtMoney(r.exp.maxLoss ?? 0, r.currency)}`}
              {' · '}estresse ±{Math.round(r.exp.stressPct * 100)}%: <b>{fmtMoney(r.exp.stressLoss, r.currency)}</b>
              {r.approx && ' (spot não informado: aproximado)'}
            </span>
          ))}
          <span className="opx-small opx-muted">Não é cálculo de margem da corretora. Confira o requisito de garantia com ela.</span>
          <div className="opx-row">
            <button type="button" className="opx-btn danger" onClick={confirmGate}>Entendo o risco — confirmar</button>
            <button type="button" className="opx-btn" onClick={() => setGate(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {paper.length > 0 && (
        <div className="card opx-panel" role="region" aria-label="Paper positions">
          <div className="opx-row">
            <span><b>{paper.length}</b> perna(s) no paper</span>
            <div className="opx-grow" />
            <label className="opx-field" style={{ minWidth: 160 }}><span>Conta</span>
              <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Selecione…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>
          <div className="opx-row">
            {paper.map((l) => (
              <span key={l.id} className="opx-badge">
                {l.qty >= 0 ? '+' : ''}{l.qty} {l.symbol} @ {l.entryPrice.toFixed(2)}
                <button type="button" className="opx-chip" style={{ minHeight: 24, padding: '0 6px' }} aria-label={`Remover ${l.symbol} do paper`} onClick={() => setPaper((p) => p.filter((x) => x.id !== l.id))}>✕</button>
              </span>
            ))}
          </div>
          <div className="opx-row">
            <button type="button" className="opx-btn" onClick={() => setPaper([])}>Limpar</button>
            <button type="button" className="opx-btn" onClick={openPaperInAnalyzer}>Analisar</button>
            <button type="button" className="opx-btn primary" onClick={savePaper}>Salvar estratégia</button>
          </div>
        </div>
      )}

      <OptionBoundary resetKey={tab} label="esta aba">
        {tab === 'analyzer' && (
          <OptionAnalyzer
            underlyings={underlyings}
            underlyingOptions={underlyingOptions}
            quotes={quotes}
            spots={spots}
            rate={rate}
            defaultMultiplier={settings.defaultMultiplier}
            multipliers={multipliers}
            paper={paper}
            groups={groups}
            preload={preload}
            onSendToPaper={sendToPaper}
            onSaveLegs={saveAnalyzerLegs}
            onEditChain={() => setTab('quotes')}
          />
        )}
        {tab === 'quotes' && (
          <OptionChainEditor
            underlyings={underlyings}
            defaultMultiplier={settings.defaultMultiplier}
            multipliers={multipliers}
            chains={chains}
            onSave={saveQuotes}
            onClearChain={clearChain}
          />
        )}
        {tab === 'smile' && <OptionSmile quotes={quotes} spots={spots} />}
        {tab === 'positions' && (
          <div className="opx-stack">
            {showForm && (
              <OptionLegForm
                accounts={accounts}
                accountId={accountId}
                onAccountChange={setAccountId}
                underlyings={underlyings}
                defaultMultiplier={settings.defaultMultiplier}
                multipliers={multipliers}
                onSubmit={registerLegs}
                onImportLegs={importLegs}
                onCancel={() => setShowForm(false)}
              />
            )}
            <OptionPositions
              legs={legs}
              quotes={quotes}
              spots={spots}
              rate={rate}
              stressPct={settings.stressPct / 100}
              sharesByUnderlying={sharesByUnderlying}
              accountNames={accountNames}
              accountCurrency={accountCurrency}
              onSetSpot={setSpot}
              onAnalyze={analyzeGroup}
              onCloseLegs={closeLegs}
              onRoll={roll}
              onAssign={assignLeg}
              onDelete={deleteLegs}
              onRegister={() => setShowForm(true)}
            />
          </div>
        )}
      </OptionBoundary>
    </div>
  );
}
