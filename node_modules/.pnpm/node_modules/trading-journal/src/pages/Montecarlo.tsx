// @apps/trading-journal/src/pages/Montecarlo.tsx
// 💥 CORREÇÃO 1: Importa React, incluindo useCallback
import React, { useMemo, useState, useCallback, useEffect } from 'react'; 
import { MonteCarloConfigPanel } from '../Components/MonteCarloConfig';
import { MonteCarloCharts } from '../Components/MonteCarloCharts';
import { MonteCarloResults } from '../Components/MonteCarloResults';
import { MonteCarloHistoryTable } from '../Components/MonteCarloHistoryTable';
import { MonteCarloFinalEquityChart } from '../Components/MonteCarloFinalEquityChart';
import { useMonteCarlo } from '../hooks/useMonteCarlo';
import { exportHistoryCSV, listHistory, getHistoryItem, deleteHistoryItem } from '../services/monteCarloService';
import type { MonteCarloConfig } from '../types/monteCarlo';
import { Button } from '../Components/ui/Button';
import { Card } from '../Components/ui/Card';

// REMOVIDO: import { useJournal } from '@apps/journal-state'; 
// REMOVIDO: async function loadJournalStatsForStrategy...

export default function MonteCarloPage() {
    const { 
        running, progress, summary, sampleRuns, 
        runSimulation, stopSimulation, loadFromHistory
    } = useMonteCarlo();
    
    // Estados para o Histórico (assumindo que você precisa deles)
    const [history, setHistory] = useState<any[]>([]); 
    
    // 💥 CORREÇÃO 2: Define strategies e categories como arrays vazios.
    // Isso satisfaz o MonteCarloConfigPanel sem depender do useJournal.
    const strategies: string[] = []; 
    const categories: string[] = [];
    
    // Handlers (assumindo que você precisa deles)
    
    const refreshHistory = useCallback(async () => {
        const items = await listHistory();
        setHistory(items);
    }, []);

    useEffect(() => {
        refreshHistory();
    }, [refreshHistory]);


    const handleRun = useCallback((config: MonteCarloConfig) => {
        runSimulation(config).then(() => {
            setTimeout(refreshHistory, 500);
        });
    }, [runSimulation, refreshHistory]); 

    const handleViewHistory = useCallback(async (id: string) => {
        const item = await getHistoryItem(id);
        if (item) {
            loadFromHistory(item);
        }
    }, [loadFromHistory]);

    const handleDeleteHistory = useCallback(async (id: string) => {
        if (window.confirm("Tem certeza que deseja deletar este histórico?")) {
            await deleteHistoryItem(id);
            refreshHistory();
        }
    }, [refreshHistory]);


    return (
        <div className="space-y-8 p-4">
            <h1 className="text-3xl font-bold border-b border-soft pb-2 mb-4">Monte Carlo Simulation</h1>

            {/* 1. LINHA 1: Configuração (1/4) vs. Resultados (3/4) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-8 items-start">
                
                {/* COLUNA 1 (1/4): Configuração */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-xl font-semibold text-text">Configuração da Simulação</h3>
                    <MonteCarloConfigPanel
                        onRun={handleRun}
                        // Passando arrays vazios conforme solicitado
                        strategies={strategies} 
                        categories={categories}
                    />
                    
                    {/* Painel de status e Stop */}
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
                                    <Button variant="destructive" onClick={stopSimulation}>Parar</Button>
                                </>
                            ) : (
                                <div className="text-sm text-muted">Pronto para rodar</div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* COLUNA 2 (3/4): Resultados (Cards 3x4) */}
                <div className="lg:col-span-2 xl:col-span-3">
                    <h3 className="text-xl font-semibold border-b border-soft pb-2 mb-4 text-text">Resumo das Métricas (3 Filas x 4 Colunas)</h3>
                    <MonteCarloResults summary={summary} />
                </div>
            </div>

            {/* 2. LINHA 2: Gráfico 1 (Histograma Principal) - Largura Total */}
            <section className="mt-8">
                <h3 className="text-2xl font-semibold border-b border-soft pb-2 mb-4 text-text">Gráfico de Distribuição</h3>
                <MonteCarloFinalEquityChart 
                    sampleRuns={sampleRuns} 
                    summary={summary} 
                    initialCapital={10000} 
                />
            </section>

            {/* 3. LINHA 3/4: Gráfico 2 (Equity Curve), Gráfico 3 (DD Hist) e Gráfico 4 (Heatmap) */}
            <section className="mt-8">
                {/* MonteCarloCharts renderiza 2 gráficos lado a lado e o Heatmap abaixo (col-span-2) */}
                <MonteCarloCharts sampleRuns={sampleRuns} summary={summary} initialCapital={10000} />
            </section>


            {/* 4. LINHA 5: Histórico de Simulações - Largura Total */}
            <section className="mt-8">
                <h3 className="text-2xl font-semibold border-b border-soft pb-2 mb-4 text-text">📂 Histórico de Simulações</h3>
                <MonteCarloHistoryTable 
                    items={history} 
                    onView={handleViewHistory} 
                    onDelete={handleDeleteHistory} 
                    onExportCSV={() => exportHistoryCSV(history)} 
                />
            </section>
        </div>
    );
}