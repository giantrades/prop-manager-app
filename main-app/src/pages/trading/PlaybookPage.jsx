// STAGE 12 — PlaybookPage. Strategies (métricas) + checklist pré-trade do dia +
// diário emocional × R. Tudo no motor novo (strategies.ts + checklist.ts + meta).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import usePageData from '../../usePageData';
import {
  allStrategyMetrics,
  deleteStrategyClean,
  getChecklistTemplate,
  getDayCheck,
  setDayCheck,
  getDiaryEntry,
  saveDiaryEntry,
} from '@apps/lib/db';
import Strategies from '@apps/ui/Strategies';
import PreTradeChecklist from '@apps/ui/PreTradeChecklist';
import EmotionalDiary from '@apps/ui/EmotionalDiary';

export function PlaybookPanel() {
  const finance = useFinance();
  const financeRef = useRef(finance);
  financeRef.current = finance;
  const { loading, data, reload: load } = usePageData('playbook', async (f) => {
    const [t, tpl, chk, ent] = await Promise.all([
      f.ds.trades.list(),
      getChecklistTemplate(f.ds),
      getDayCheck(f.ds),
      getDiaryEntry(f.ds),
    ]);
    // Dia × R: últimos 14 dias com trade fechado.
    const byDay = new Map();
    for (const tr of t) {
      if (tr.exitDatetime == null) continue;
      const day = tr.exitDatetime.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (tr.resultR ?? 0));
    }
    const days = [...byDay.keys()].sort().reverse().slice(0, 14);
    const diaryRows = [];
    for (const day of days) {
      const d = await getDiaryEntry(f.ds, `${day}T12:00:00Z`);
      diaryRows.push({ date: day, sleep: d?.sleep ?? null, mood: d?.mood ?? null, fomo: d?.fomo ?? null, r: Number(byDay.get(day).toFixed(2)) });
    }
    return { trades: t, metrics: allStrategyMetrics(t), template: tpl, checked: chk, entry: ent, diaryRows };
  });
  const trades = data?.trades ?? [];
  const metrics = data?.metrics ?? [];
  const template = data?.template ?? [];
  const entry = data?.entry ?? null;
  const diaryRows = data?.diaryRows ?? [];
  const [checked, setChecked] = useState({});
  useEffect(() => { setChecked(data?.checked ?? {}); }, [data]);

  const handleToggle = useCallback(async (index, done) => {
    const f = financeRef.current;
    if (!f) return;
    setChecked(await setDayCheck(f.ds, index, done));
  }, []);

  const handleSaveDiary = useCallback(async (e) => {
    const f = financeRef.current;
    if (!f) return;
    await saveDiaryEntry(f.ds, e);
    load();
  }, [load]);

  const handleUnlink = useCallback(async (strategyId) => {
    const f = financeRef.current;
    if (!f) return;
    await deleteStrategyClean(f.ds, strategyId);
    load();
  }, [load]);

  return (
    <>
      <PreTradeChecklist items={template} checked={checked} onToggle={handleToggle} loading={loading} />
      <div className="pb-section-title">Setups (edge por estratégia)</div>
      <Strategies metrics={metrics} onUnlink={handleUnlink} loading={loading} />
      <div className="pb-section-title">Diário emocional</div>
      <EmotionalDiary entry={entry} rows={diaryRows} onSave={handleSaveDiary} loading={loading} />
    </>
  );
}

export default function PlaybookPage() {
  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Playbook</h1></div>
      <ModuleTabs module="trading" />
      <PlaybookPanel />
    </div>
  );
}

const PB_CSS = `
.pb-section-title { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin: 4px 0 0; }
`;
if (typeof document !== 'undefined' && !document.getElementById('pb-styles')) {
  const style = document.createElement('style');
  style.id = 'pb-styles';
  style.textContent = PB_CSS;
  document.head.appendChild(style);
}
