// @apps/trading-journal/src/components/MonteCarloResults.tsx
import React from 'react';
import type { MonteCarloSummary } from '../types/monteCarlo';
import { Card } from '../Components/ui/Card';

type Props = {
  summary: MonteCarloSummary | null;
};

export const MonteCarloResults: React.FC<Props> = ({ summary }) => {
  if (!summary) {
    return (
      <Card className="p-4">
        <div className="text-muted">Nenhuma simulação ainda. Rode uma simulação para ver os resultados.</div>
      </Card>
    );
  }

  const metrics = [
    { label: 'CAGR', value: (summary.cagr * 100).toFixed(2) + '%' },
    { label: 'Max Drawdown', value: (summary.maxDrawdown * 100).toFixed(2) + '%' },
    { label: 'Calmar', value: summary.calmar.toFixed(2) },
    { label: 'Sharpe', value: summary.sharpe.toFixed(2) },
    { label: 'Sortino', value: summary.sortino.toFixed(2) },
    { label: 'Profit Factor', value: isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : '∞' },
    { label: 'Expected Value ($)', value: summary.expectedValue.toFixed(2) },
    { label: 'Skewness', value: summary.skewness.toFixed(3) },
    { label: 'Kurtosis', value: summary.kurtosis.toFixed(3) },
    { label: 'Prob. Ruína', value: (summary.probRuin * 100).toFixed(2) + '%' },
    { label: 'Media final ($)', value: summary.avgFinal.toFixed(2) },
    { label: 'Mediana final ($)', value: summary.medianFinal.toFixed(2) },
  ];

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-3">Resumo da simulação</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="p-3 border rounded">
            <div className="text-sm text-muted">{m.label}</div>
            <div className="text-xl font-bold">{m.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
};
