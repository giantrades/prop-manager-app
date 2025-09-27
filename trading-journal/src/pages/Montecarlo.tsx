// @apps/trading-journal/src/pages/MonteCarlo.tsx
import React, { useMemo, useState } from 'react';
import { MonteCarloConfigPanel } from '../Components/MonteCarloConfig';
import { MonteCarloCharts } from '../Components/MonteCarloCharts';
import { MonteCarloResults } from '../Components/MonteCarloResults';
import { MonteCarloHistoryTable } from '../Components/MonteCarloHistoryTable';
import { useMonteCarlo } from '../hooks/useMonteCarlo';
import { exportHistoryCSV, listHistory } from '../services/monteCarloService';
import type { MonteCarloConfig } from '../types/monteCarlo';
import { Button } from '../Components/ui/Button';
import { Card } from '../Components/ui/Card';

// Assume you can get stats from journal (you should implement the loader)
async function loadJournalStatsForStrategy(strategy?: string, category?: string) {
  // stub: implement real loading from journal (filter by strategy/category)
  // returns { winRate: 0.52, expectancyR: 0.18, empiricalR: number[] }
  return {
    winRate: 0.52,
    expectancyR: 0.18,
    empiricalR: Array.from({ length: 200 }, () => (Math.random() > 0.5 ? Math.random() * 2 : -Math.random() * 1.2)),
    strategies: ['MeanReversion', 'Breakout', 'Trend'],
    categories: ['Futures', 'FX', 'Crypto'],
  };
}

export default function MonteCarloPage() {
  const { running, progress, summary, sampleRuns, start, stop, history, refreshHistory } = useMonteCarlo();
  const [journalStats, setJournalStats] = useState<any>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const s = await loadJournalStatsForStrategy();
      setJournalStats(s);
    })();
  }, []);

  const defaultWin = journalStats?.winRate ?? 0.5;
  const defaultExp = journalStats?.expectancyR ?? 0.2;
  const empiricalR = journalStats?.empiricalR ?? undefined;
  const strategies = journalStats?.strategies ?? [];
  const categories = journalStats?.categories ?? [];

  async function handleRun(config: MonteCarloConfig) {
    // merge defaults
    const cfg = { ...config, winProb: config.winProb ?? defaultWin, expectancyR: config.expectancyR ?? defaultExp };
    await start(cfg, empiricalR);
  }

  async function handleViewHistory(id: string) {
    setSelectedHistoryId(id);
    // you might want to load that history and display its charts; keep simple: refreshHistory and set summary
    await refreshHistory();
    // find item
    const item = history.find(h => h.id === id);
    if (item) {
      // show item.summary in UI
      // simple: set local summary to item.summary (if you want to plot sampleRuns you need to persist sample runs too)
      // hack: set document title
      // For now, we'll just set sampleRuns as empty and summary to loaded summary by starting state
      // Ideally you store sampleRuns as well in history
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <MonteCarloConfigPanel
            defaultWinRate={defaultWin}
            defaultExpectancyR={defaultExp}
            strategies={strategies}
            categories={categories}
            onRun={handleRun}
          />
          <div className="mt-3">
            <Card className="p-3">
              <div className="flex items-center gap-3">
                {running ? (
                  <>
                    <div className="flex-1">
                      <div className="text-sm">Executando... {progress}%</div>
                      <div className="h-2 bg-slate-200 rounded overflow-hidden mt-2">
                        <div style={{ width: `${progress}%` }} className="h-full bg-emerald-500" />
                      </div>
                    </div>
                    <Button variant="destructive" onClick={stop}>Parar</Button>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted">Pronto para rodar</div>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>

        <div className="w-96">
          <MonteCarloResults summary={summary} />
        </div>
      </div>

      <div>
        <MonteCarloCharts sampleRuns={sampleRuns} summary={summary} initialCapital={10000} />
      </div>

      <div>
        <MonteCarloHistoryTable items={history} onView={handleViewHistory} onExportCSV={() => exportHistoryCSV(history)} />
      </div>
    </div>
  );
}
