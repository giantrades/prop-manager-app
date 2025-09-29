// @apps/trading-journal/src/components/MonteCarloCharts.tsx
import React, { useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, AreaChart, Area } from 'recharts';
import type { MonteCarloSummary, MonteCarloRun } from '../types/monteCarlo'; 
import { Card } from '../Components/ui/Card';

type Props = {
  sampleRuns: MonteCarloRun[] | null; 
  summary: MonteCarloSummary | null;
  initialCapital?: number;
};

function prepareEquityOverlay(sampleRuns: MonteCarloRun[], initialCapital = 10000) {
    const maxLen = Math.max(...sampleRuns.map(s => s.equitySeries.length));
    const series = Array.from({ length: maxLen }).map((_, idx) => {
      const values = sampleRuns.map((r) => (r.equitySeries[idx] ?? r.equitySeries[r.equitySeries.length - 1]));
      const avg = values.reduce((a,b) => a+b,0) / values.length;
      const sqDiffs = values.map(v => Math.pow(v - avg, 2));
      const variance = sqDiffs.reduce((a, b) => a + b, 0) / values.length;
      const stdDev = Math.sqrt(variance);
      return { idx, avg, lower: avg - stdDev, upper: avg + stdDev };
    });
    return { series };
}


export const MonteCarloCharts: React.FC<Props> = ({ sampleRuns, summary, initialCapital = 10000 }) => {
  const eq = useMemo(() => {
    if (!sampleRuns || sampleRuns.length === 0) return null;
    return prepareEquityOverlay(sampleRuns, initialCapital);
  }, [sampleRuns, initialCapital]);

  const finalEquities = useMemo(() => {
    if (!sampleRuns) return [];
    return sampleRuns.map(r => r.finalEquity);
  }, [sampleRuns]);
  
  
  const histogramData = useMemo(() => {
    // 💥 CORREÇÃO DO BUG: Cláusula de guarda para array vazio.
    if (finalEquities.length === 0) return []; 
    
    const min = Math.min(...finalEquities);
    const max = Math.max(...finalEquities);
    const range = max - min;
    
    // Se min e max são iguais (range é 0), tratamos como um único bin
    if (range === 0) {
        return [{ name: `$${min.toFixed(0)}`, count: finalEquities.length, center: min }];
    }

    const numBins = 15;
    const binSize = range / numBins;

    const bins = Array(numBins).fill(0).map((_, i) => ({ 
      name: `$${(min + i * binSize).toFixed(0)}`, 
      count: 0,
      center: min + i * binSize + binSize/2
    }));

    finalEquities.forEach(equity => {
      let binIndex = Math.floor((equity - min) / binSize);
      if (binIndex >= numBins) binIndex = numBins - 1;
      if (binIndex < 0) binIndex = 0;
      
      // bins[binIndex] sempre existirá aqui, mas adicionamos um cheque extra
      if (bins[binIndex]) {
          bins[binIndex].count += 1;
      }
    });

    return bins;
  }, [finalEquities]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      
      {/* 1. EQUITY CURVE (Amostras + Média) */}
      <Card className="p-4 shadow-xl bg-card">
        <h4 className="font-semibold mb-3 text-text">Projeção do Patrimônio (Equity Curve)</h4>
        <div style={{ height: 350 }}>
          {!eq ? (
             <div className="text-muted text-center pt-20">Rode a simulação para gerar os gráficos.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={eq.series} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                <XAxis dataKey="idx" name="Trades" stroke="#a0aec0" />
                <YAxis dataKey="avg" name="Capital ($)" stroke="#a0aec0" tickFormatter={(v) => `$${v.toFixed(0)}`} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1a202c', border: '1px solid #4a5568', color: '#fff' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Capital Médio']}
                />
                
                <Area type="monotone" dataKey="upper" stroke="none" fill="#4a5568" fillOpacity={0.2} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#1a202c" fillOpacity={1} />
                <Line type="monotone" dataKey="avg" stroke="#34d399" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
      
      {/* 2. HISTOGRAMA DE RESULTADOS FINAIS */}
      <Card className="p-4 shadow-xl bg-card">
        <h4 className="font-semibold mb-3 text-text">Distribuição do Capital Final</h4>
        <div style={{ height: 350 }}>
          {histogramData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                <XAxis dataKey="name" name="Faixa ($)" stroke="#a0aec0" />
                <YAxis name="Contagem" stroke="#a0aec0" />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1a202c', border: '1px solid #4a5568', color: '#fff' }}
                    formatter={(value: number, name: string, props: any) => [value.toLocaleString(), 'Simulações']}
                />
                <Bar dataKey="count" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-muted text-center pt-20">Rode a simulação para gerar os gráficos.</div>}
        </div>
        <div className="text-xs text-muted mt-2">P5: ${summary?.p05.toFixed(0)} | P95: ${summary?.p95.toFixed(0)}</div>
      </Card>
      
 {/* 💥 3. NOVO: HEATMAP DE DRAWDOWN VS TRADE INDEX */}
      <Card className="lg:col-span-2 p-4 shadow-xl bg-card">
        <h4 className="font-semibold mb-3 text-text">Heatmap: Drawdown vs. Trade Index</h4>
        <div style={{ height: 350 }}>
          {sampleRuns && sampleRuns.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                <XAxis 
                    dataKey="tradeIdx" 
                    name="Trade Index" 
                    type="number" 
                    stroke="#a0aec0"
                    label={{ value: 'Trade Index', position: 'bottom', fill: '#a0aec0' }}
                />
                <YAxis 
                    dataKey="drawdown" 
                    name="Drawdown" 
                    type="number" 
                    stroke="#a0aec0" 
                    tickFormatter={(v: number) => (v * 100).toFixed(0) + '%'} 
                    label={{ value: 'Drawdown (DD)', angle: -90, position: 'left', fill: '#a0aec0' }}
                />
                <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    contentStyle={{ backgroundColor: '#1a202c', border: '1px solid #4a5568', color: '#fff' }}
                    formatter={(value: number, name: string, props: any) => {
                        if (name === 'Drawdown') return [(value * 100).toFixed(2) + '%', name];
                        return [value.toFixed(0), name];
                    }}
                />
                <Scatter data={(() => {
                  // Prepara os dados: ponto (tradeIdx, Drawdown) para cada trade em cada run
                  const pts: { tradeIdx:number; drawdown:number }[] = [];
                  sampleRuns.forEach((r: any) => {
                    let peak = -Infinity;
                    r.equitySeries.forEach((v:number, idx:number) => {
                      if (v > peak) peak = v;
                      const dd = (peak - v) / peak;
                      // Adiciona pontos de drawdown apenas se o DD for > 0
                      if (dd > 0) {
                        pts.push({ tradeIdx: idx, drawdown: dd });
                      }
                    });
                  });
                  return pts;
                })()} fill="#f97316" shape="circle" opacity={0.5} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : <div className="text-muted text-center pt-20">Rode a simulação para gerar o Heatmap.</div>}
        </div>
        <div className="text-xs text-muted mt-2">Cada ponto é o drawdown em um trade de todas as simulações. Concentração indica pontos de alto risco de DD.</div>
      </Card>


    </div>
  );
};