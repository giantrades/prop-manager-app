// @apps/trading-journal/src/components/MonteCarloFinalEquityChart.tsx
import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Card } from '../Components/ui/Card';
import type { MonteCarloSummary } from '../types/monteCarlo';

type Props = {
    sampleRuns: any[] | null;
    summary: MonteCarloSummary | null;
    initialCapital?: number;
};

// 💥 NOVO HELPER: Função de densidade (Kernel Density Estimation - stub simplificado)
// Na prática, você usaria uma biblioteca real (como d3-array ou um worker dedicado)
// Mas para visualização, agrupamos os finais em 'bins' e plotamos a frequência.
function calculateDensity(finalEquities: number[], bins: number = 30) {
    if (!finalEquities.length) return [];
    
    const minVal = Math.min(...finalEquities);
    const maxVal = Math.max(...finalEquities);
    const range = maxVal - minVal;
    if (range === 0) return [];

    const binSize = range / bins;
    const data: { bin: string; count: number; x: number; }[] = [];
    
    for (let i = 0; i < bins; i++) {
        const lower = minVal + i * binSize;
        const upper = minVal + (i + 1) * binSize;
        const count = finalEquities.filter(f => f >= lower && f < upper).length;
        data.push({ 
            bin: `$${lower.toFixed(0)} - $${upper.toFixed(0)}`, 
            count,
            x: (lower + upper) / 2
        });
    }

    // Adiciona um ponto para o último bin se não foi incluído
    if (data[bins-1]) {
        const lower = minVal + (bins - 1) * binSize;
        const count = finalEquities.filter(f => f >= lower).length;
        data[bins-1].count = count;
    }
    
    return data;
}

export const MonteCarloFinalEquityChart: React.FC<Props> = ({ sampleRuns, summary, initialCapital }) => {
    const data = useMemo(() => {
        if (!sampleRuns || !summary) return [];
        // Coleta todos os valores finais
        const finalEquities = sampleRuns.map((r: any) => r.finalEquity);
        // Gera os dados de densidade (histograma agrupado)
        return calculateDensity(finalEquities, 50); // Usando 50 bins para suavidade
    }, [sampleRuns, summary]);

    if (!summary || data.length === 0) {
        return <Card className="p-4"><div className="text-muted">Rode uma simulação para ver a distribuição.</div></Card>;
    }

    return (
        <Card className="p-4 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#202633" />
                    <XAxis 
                        dataKey="x" 
                        type="number" 
                        tickFormatter={(v) => `$${v.toFixed(0)}`}
                        domain={['dataMin', 'dataMax']}
                        stroke="#a1a7b3"
                    />
                    <YAxis 
                        dataKey="count" 
                        stroke="#a1a7b3"
                        tickFormatter={(v) => (v / summary.totalRuns).toFixed(2)} // Mostra Frequência
                    />
                    <Tooltip 
                        contentStyle={{ background: '#151a23', border: '1px solid #7c5cff' }}
                        formatter={(value, name, props) => [`${(value as number).toFixed(0)} runs`, 'Frequência']}
                        labelFormatter={(label) => `Capital Final: $${(label as number).toFixed(0)}`}
                    />
                    
                    {/* 1. Área Sombreada: P25-P75 (A "Caixa") - Cor mais clara */}
                    <ReferenceLine x={summary.p25} stroke="#3498db" strokeDasharray="3 3" />
                    <ReferenceLine x={summary.p75} stroke="#3498db" strokeDasharray="3 3" />
                    <Area 
                        type="monotone" 
                        dataKey="count" 
                        fill="url(#colorDensity)" 
                        stroke="#7c5cff" 
                        activeDot={false}
                        isAnimationActive={false}
                        // Clip-path para destacar a área P25-P75 (Complexo em Recharts, mais fácil em CSS/SVG)
                    />
                    
                    {/* Definições de Gradiente (cores do seu tema) */}
                    <defs>
                        <linearGradient id="colorDensity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#7c5cff" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#7c5cff" stopOpacity={0.1}/>
                        </linearGradient>
                    </defs>

                    {/* 2. Referências para Percentis e Mediana (Os "Bigodes" e a Linha Central) */}
                    <ReferenceLine 
                        x={initialCapital} 
                        stroke="var(--yellow)" 
                        label={{ value: 'Capital Inicial', fill: 'var(--yellow)', position: 'top' }}
                    />
                    <ReferenceLine 
                        x={summary.medianFinal} 
                        stroke="var(--green)" 
                        strokeWidth={2} 
                        label={{ value: 'Mediana', fill: 'var(--green)', position: 'top' }}
                    />
                    <ReferenceLine x={summary.p05} stroke="var(--red)" strokeDasharray="5 5" />
                    <ReferenceLine x={summary.p95} stroke="var(--green)" strokeDasharray="5 5" />
                </AreaChart>
            </ResponsiveContainer>
        </Card>
    );
}

// NOTE: Para uma precisão idêntica ao exemplo, o cálculo da densidade (`calculateDensity`) precisa ser mais robusto,
// mas a estrutura AreaChart com ReferenceLines é a forma correta de replicar o visual.