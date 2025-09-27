// @apps/trading-journal/src/components/MonteCarloHistoryTable.tsx
import React from 'react';
import type { MonteCarloHistoryItem } from '../types/monteCarlo';
import { Button } from '../Components/ui/Button';
import { Card } from '../Components/ui/Card';

type Props = {
  items: MonteCarloHistoryItem[];
  onView: (id: string) => void;
  onExportCSV: () => void;
};

export const MonteCarloHistoryTable: React.FC<Props> = ({ items, onView, onExportCSV }) => {
  return (
    <Card className="p-3">
      <div className="flex between items-center mb-3">
        <h4 className="font-semibold">Histórico de Simulações</h4>
        <div>
          <Button variant="ghost" onClick={onExportCSV}>Export CSV</Button>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full table-auto">
          <thead className="text-sm text-muted">
            <tr>
              <th>Data</th>
              <th>Estratégia</th>
              <th>#Runs</th>
              <th>#Trades</th>
              <th>Capital</th>
              <th>CAGR</th>
              <th>Max DD</th>
              <th>PF</th>
              <th>Sharpe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id} className="border-t">
                <td>{new Date(it.createdAt).toLocaleString()}</td>
                <td>{it.config.strategy ?? it.config.category ?? '-'}</td>
                <td>{it.config.simulations}</td>
                <td>{it.config.maxTradesPerRun}</td>
                <td>${it.config.initialCapital.toFixed(0)}</td>
                <td>{(it.summary.cagr * 100).toFixed(2)}%</td>
                <td>{(it.summary.maxDrawdown * 100).toFixed(1)}%</td>
                <td>{isFinite(it.summary.profitFactor) ? it.summary.profitFactor.toFixed(2) : '∞'}</td>
                <td>{it.summary.sharpe.toFixed(2)}</td>
                <td>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => onView(it.id)}>Visualizar</Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={10} className="p-4 text-muted">Nenhum histórico salvo</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
