// @apps/trading-journal/src/components/MonteCarloCharts.tsx
import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid, AreaChart, Area, ScatterChart, Scatter } from 'recharts';
import type { MonteCarloSummary } from '../types/monteCarlo';
import { Card } from '../Components/ui/Card';

type Props = {
  sampleRuns: any[] | null;
  summary: MonteCarloSummary | null;
  initialCapital?: number;
};

function prepareEquityOverlay(sampleRuns: any[], initialCapital = 10000) {
  // sampleRuns: array of runs with equitySeries arrays
  const maxLen = Math.max(...sampleRuns.map(s => s.equitySeries.length));
  const series = Array.from({ length: maxLen }).map((_, idx) => {
    const values = sampleRuns.map((r) => (r.equitySeries[idx] ?? r.equitySeries[r.equitySeries.length - 1]));
    const avg = values.reduce((a,b) => a+b,0) / values.length;
    return { idx, avg, values };
  });
  return { series };
}

export const MonteCarloCharts: React.FC<Props> = ({ sampleRuns, summary, initialCapital = 10000 }) => {
  const eq = useMemo(() => {
    if (!sampleRuns || sampleRuns.length === 0) return null;
    return prepareEquityOverlay(sampleRuns, initialCapital);
  }, [sampleRuns]);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <h4 className="font-semibold mb-2">Equity Curves (amostra)</h4>
        <div style={{ height: 260 }}>
          {eq ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={eq.series}>
                <XAxis dataKey="idx" tickCount={6} />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip formatter={(value:any) => value && value.toFixed ? value.toFixed(2) : value} />
                {/* render many thin lines for sample runs */}
                {sampleRuns!.slice(0, 25).map((r, i) => (
                  <Line key={i} data={r.equitySeries.map((v: number, idx:number) => ({ idx, v }))} type="monotone" dataKey="v" strokeOpacity={0.1} dot={false} stroke="#8884d8" isAnimationActive={false} />
                ))}
                {/* render average line */}
                <Line data={eq.series} type="monotone" dataKey="avg" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-muted">Sem runs amostradas.</div>}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-3">
          <h4 className="font-semibold mb-2">Distribuição do equity final</h4>
          <div style={{ height: 240 }}>
            {summary ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'p05', value: summary.p05 },
                  { name: 'median', value: summary.medianFinal },
                  { name: 'p95', value: summary.p95 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#60a5fa" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-muted">Rode uma simulação</div>}
          </div>
        </Card>

        <Card className="p-3">
          <h4 className="font-semibold mb-2">Histograma de resultados finais</h4>
          <div style={{ height: 240 }}>
            {summary && sampleRuns ? (
              <ResponsiveContainer width="100%" height="100%">
                {/* Build histogram from sampleRuns finals */}
                <BarChart data={(() => {
                  const finals = sampleRuns.map(r => r.finalEquity);
                  // simple binning
                  const min = Math.min(...finals);
                  const max = Math.max(...finals);
                  const bins = 25;
                  const width = (max - min) / bins || 1;
                  const counts = Array.from({ length: bins }).map(() => 0);
                  finals.forEach((v) => {
                    let idx = Math.min(bins - 1, Math.floor((v - min) / width));
                    if (idx < 0) idx = 0;
                    counts[idx]++;
                  });
                  return counts.map((c, i) => ({ bin: i, x: (min + i * width), count: c }));
                })()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="x" tickFormatter={(v)=> Number(v).toFixed(0)} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#34d399"/>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-muted">Sem dados</div>}
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <h4 className="font-semibold mb-2">Heatmap: Drawdown vs Trade Index (scatter density)</h4>
        <div style={{ height: 280 }}>
          {sampleRuns && sampleRuns.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid />
                <XAxis dataKey="tradeIdx" name="Trade Index" />
                <YAxis dataKey="drawdown" name="Drawdown" tickFormatter={(v)=> (v*100).toFixed(0) + '%'} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }}/>
                <Scatter data={(() => {
                  // flatten drawdown points
                  const pts: { tradeIdx:number; drawdown:number }[] = [];
                  sampleRuns.forEach((r: any) => {
                    let peak = -Infinity;
                    r.equitySeries.forEach((v:number, idx:number) => {
                      if (v > peak) peak = v;
                      const dd = (peak - v) / peak;
                      pts.push({ tradeIdx: idx, drawdown: dd });
                    });
                  });
                  return pts;
                })()} fill="#f97316" />
              </ScatterChart>
            </ResponsiveContainer>
          ) : <div className="text-muted">Sem runs amostrados</div>}
        </div>
      </Card>
    </div>
  );
};
