// @apps/trading-journal/src/components/MonteCarloResults.tsx
import React from 'react';
import type { MonteCarloSummary } from '../types/monteCarlo';
// Importação de Card não é necessária se você usar a div 'card'
// import { Card } from '../Components/ui/Card'; 

type Props = {
  summary: MonteCarloSummary | null;
};

// 💥 Replicando a estrutura de Card do seu dashboard
const StatCard = ({ title, value, accent = 1, size = 'lg' }: any) => (
  <div className={`card accent${accent} p-4 flex flex-col justify-between h-full`}>
    <div className="muted small font-medium">{title}</div>
    {/* Ajustamos o tamanho da fonte para o grid de 12 cards */}
    <div 
      className={`stat mt-1 ${accent > 4 ? 'text-lg' : 'text-xl'}`} 
      style={{ fontSize: size === 'lg' ? 26 : size === 'md' ? 22 : 18 }}
    >
        {value}
    </div>
  </div>
);

export const MonteCarloResults: React.FC<Props> = ({ summary }) => {
  if (!summary) {
    return (
      <div className="card p-4 shadow-lg">
        <div className="text-muted text-center py-6">Nenhuma simulação ainda. Rode uma simulação para ver os resultados.</div>
      </div>
    );
  }

  const fmt = (v: number) => Number.isFinite(v) ? v.toFixed(2) : '∞';
  const fmtPct = (v: number) => Number.isFinite(v) ? (v * 100).toFixed(2) + '%' : '∞';
  const fmtDol = (v: number) => `$${Number.isFinite(v) ? v.toFixed(0) : '∞'}`;


  const metrics = [
    // Fila 1: Retorno e Risco Geral (Accent 1-4, Grande)
    { title: 'Média Final', value: fmtDol(summary.avgFinal), accent: 1, size: 'lg' },
    { title: 'CAGR (Anual)', value: fmtPct(summary.cagr), accent: 2, size: 'lg' },
    { title: 'Prob. Ruína', value: fmtPct(summary.probRuin), accent: 3, size: 'lg' },
    { title: 'Max Drawdown', value: fmtPct(summary.maxDrawdown), accent: 4, size: 'lg' },
    
    // Fila 2: Relação Risco/Retorno (Accent 5-8, Médio)
    { title: 'Sharpe Ratio', value: fmt(summary.sharpe), accent: 5, size: 'md' },
    { title: 'Calmar Ratio', value: fmt(summary.calmar), accent: 6, size: 'md' },
    { title: 'Sortino Ratio', value: fmt(summary.sortino), accent: 7, size: 'md' },
    { title: 'Profit Factor', value: fmt(summary.profitFactor), accent: 8, size: 'md' },

    // Fila 3: Estatísticas de Distribuição (Accent 9-12, Pequeno)
    { title: 'Mediana Final', value: fmtDol(summary.medianFinal), accent: 9, size: 'sm' },
    { title: 'P95 (Melhor Caso)', value: fmtDol(summary.p95), accent: 10, size: 'sm' },
    { title: 'P05 (Pior Caso)', value: fmtDol(summary.p05), accent: 11, size: 'sm' },
    { title: 'Expected Value ($)', value: fmt(summary.expectedValue), accent: 12, size: 'sm' },
  ];

  return (
    // 💥 Usa o grid 3 fileiras x 4 colunas (grid-cols-4)
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <StatCard 
          key={index}
          title={metric.title}
          value={metric.value}
          accent={metric.accent}
          size={metric.size}
        />
      ))}
    </div>
  );
};