// @apps/trading-journal/src/components/MonteCarloHistoryTable.tsx

import React, { useState, useMemo } from 'react';
import type { MonteCarloHistoryItem } from '../types/monteCarlo';
import { Button } from '../Components/ui/Button';
import { Card } from '../Components/ui/Card';

type Props = {
  items: MonteCarloHistoryItem[];
  onView: (id: string) => void;
  onDelete: (id: string) => void; // 💥 Propriedade onDelete
  onExportCSV: () => void;
};

const PAGE_SIZE = 10; 

export const MonteCarloHistoryTable: React.FC<Props> = ({ items, onView, onDelete, onExportCSV }) => {
  const [currentPage, setCurrentPage] = useState(1);
  
  // Implementação da Paginação
  const paginatedItems = useMemo(() => {
    // Garante que o histórico mais recente aparece primeiro
    const sortedItems = items.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()); 
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return sortedItems.slice(start, end);
  }, [items, currentPage]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const isFinite = (v: number) => Number.isFinite(v);

  return (
    <Card className="p-4 border-soft shadow-lg bg-card">
      <div className="flex justify-between items-center mb-4 border-b border-soft pb-2">
        <h4 className="font-semibold text-lg text-text">Histórico de Simulações Salvas</h4>
        <div>
          {items.length > 0 && (
              <Button variant="outline" size="sm" onClick={onExportCSV} className="mr-2">📥 Exportar CSV</Button>
          )}
        </div>
      </div>
      
      <div className="overflow-auto max-h-[400px] border border-soft rounded-lg"> 
        <table className="min-w-full table-fixed text-left border-collapse">
          {/* ... (cabeçalho da tabela) ... */}
          <thead className="text-xs text-muted bg-panel/70 sticky top-0 uppercase tracking-wider"> 
            <tr>
              <th className="p-3 font-medium w-[150px]">Data</th>
              <th className="p-3 font-medium w-[120px]">WinRate/R</th>
              <th className="p-3 font-medium text-center w-[60px]">Runs</th>
              <th className="p-3 font-medium text-right w-[100px]">Média Final</th>
              <th className="p-3 font-medium text-right w-[80px]">CAGR</th>
              <th className="p-3 font-medium text-right w-[80px]">Max DD</th>
              <th className="p-3 font-medium text-right w-[80px]">Sharpe</th>
              <th className="p-3 font-medium w-[120px]">Ações</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map(it => ( // 💥 Usando itens paginados
              <tr key={it.id} className="border-t border-soft/50 hover:bg-soft/20 transition-colors">
                <td className="p-3 text-sm">{new Date(it.createdAt!).toLocaleDateString()} {new Date(it.createdAt!).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td className="p-3 text-sm">
                    {`${(it.config.winProb * 100).toFixed(1)}% / ${it.config.expectancyR.toFixed(2)}R`}
                </td>
                <td className="p-3 text-sm text-center">{it.summary.totalRuns.toLocaleString()}</td>
                <td className="p-3 text-sm text-right font-semibold text-emerald-300">${it.summary.avgFinal.toFixed(0)}</td>
                <td className={`p-3 text-sm text-right ${it.summary.cagr > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(it.summary.cagr * 100).toFixed(2)}%
                </td>
                <td className="p-3 text-sm text-right text-red-400">
                    {(it.summary.maxDrawdown * 100).toFixed(1)}%
                </td>
                <td className={`p-3 text-sm text-right ${it.summary.sharpe > 0.5 ? 'text-blue-400' : 'text-muted'}`}>
                    {it.summary.sharpe.toFixed(2)}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onView(it.id)}>👁️ Ver</Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(it.id)}>🗑️</Button> {/* 💥 Botão Excluir */}
                  </div>
                </td>
              </tr>
            ))}
            {paginatedItems.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-muted text-center italic">Nenhuma simulação encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Controles de Paginação */}
      {items.length > PAGE_SIZE && (
        <div className="flex justify-end items-center gap-3 mt-4 text-sm">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentPage(c => Math.max(1, c - 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <span className="text-muted">
            Página {currentPage} de {totalPages}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))}
            disabled={currentPage === totalPages}
          >
            Próximo
          </Button>
        </div>
      )}

    </Card>
  );
};