import React, { useState, useMemo } from 'react';
import { useJournal } from "@apps/journal-state";
import { useCurrency } from "@apps/state";
import StrategyForm from '../Components/StrategyForm';
import { Strategy, StrategyStats } from '../types/strategy';
import { Trade } from '../types/trade'; // Importa o Trade base
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';


// --- COMPONENTE AUXILIAR: StrategyCard para a lista ---
// Normalmente estaria em src/components/strategies/StrategyCard.tsx
interface StrategyCardProps {
    strategy: Strategy;
    trades: Trade[];
    onEdit: (s: Strategy) => void;
    onDelete: (id: string) => void;
    currency: string;
    rate: number;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, trades, onEdit, onDelete, currency, rate }) => {
    // 1. Cálculos de Análise (MUITO mais eficientes do que no original)
    const stats: StrategyStats = useMemo(() => {
        const linkedTrades = trades.filter((t: Trade) => t.strategyId === strategy.id);
        const totalPnLNet = linkedTrades.reduce((a, b) => a + (b.result_net || 0), 0);
        const totalR = linkedTrades.reduce((a, b) => a + (b.result_R || 0), 0);
        const wins = linkedTrades.filter((t: Trade) => (t.result_net || 0) > 0).length;

        const avgR = linkedTrades.length ? totalR / linkedTrades.length : 0;
        const winrate = linkedTrades.length ? Math.round((wins / linkedTrades.length) * 1000) / 10 : 0;
        
        const largestWin = linkedTrades.reduce((max, t) => Math.max(max, t.result_net || 0), 0);
        const largestLoss = linkedTrades.reduce((min, t) => Math.min(min, t.result_net || 0), 0);

        return { 
            linkedTradesCount: linkedTrades.length,
            totalPnLNet,
            avgR,
            winrate,
            largestWin,
            largestLoss
        } as StrategyStats;
    }, [strategy.id, trades]);

    // Formatador de moeda
    const fmt = (v: number) => {
        const value = currency === 'USD' ? (v || 0) : (v || 0) * rate;
        const locale = currency === 'USD' ? 'en-US' : 'pt-BR';
        const curr = currency === 'USD' ? 'USD' : 'BRL';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: curr }).format(value);
    };

    const pillClass = {
        'Futures': 'pink',
        'Forex': 'lavander',
        'Cripto': 'orange',
        'Personal': 'purple'
    }[strategy.category] || 'gray';

    const pnlClass = stats.totalPnLNet >= 0 ? 'value-green' : 'value-red';

    return (
        <div className="card p-4 flex flex-col justify-between" key={strategy.id}>
            <div>
                <div className="flex items-start justify-between">
                    <div>
                        <h4 className="font-medium text-lg">{strategy.name}</h4>
                        <span className={`pill ${pillClass}`}>{strategy.category}</span>
                    </div>
                    <div className="text-right">
                        <div className={`text-2xl font-bold ${pnlClass}`}>{fmt(stats.totalPnLNet)}</div>
                        <div className="muted text-sm">P&L Total</div>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>Trades: <span className="font-semibold">{stats.linkedTradesCount}</span></div>
                    <div>Winrate: <span className="font-semibold">{stats.winrate}%</span></div>
                    <div>**Expectancy (Avg R):** <span className="font-semibold">{stats.avgR.toFixed(2)} R</span></div>
                    <div>Maior Ganho: <span className="value-green">{fmt(stats.largestWin)}</span></div>
                    <div>Maior Perda: <span className="value-red">{fmt(stats.largestLoss)}</span></div>
                </div>
            </div>

            <div className="mt-4 flex gap-2 justify-start">
                <button className="btn ghost small" onClick={() => onEdit(strategy)}>
                    Editar
                </button>
                <button className="btn ghost negative small" onClick={() => onDelete(strategy.id)}>
                    Deletar
                </button>

                
            </div>
        </div>
    );
};
// --- FIM StrategyCard ---


export default function StrategiesPage() {
    const { strategies, trades, removeStrategy } = useJournal() as any;
    const { currency, rate } = useCurrency();
    const [open, setOpen] = useState(false);
    const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

    const openNew = () => {
        setEditingStrategy(null);
        setOpen(true);
    };

    const handleEdit = (s: Strategy) => {
        setEditingStrategy(s);
        setOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm('Tem certeza que deseja deletar esta estratégia? Todos os trades vinculados permanecerão.')) {
            removeStrategy(id);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">📈 Gerenciamento de Estratégias</h2>
                <div>
                    <button className="btn" onClick={openNew}>➕ Nova Estratégia</button>
                </div>
            </div>

            {/* Listagem de Estratégias (StrategiesTable) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(strategies as Strategy[] || []).map((s) => (
                    <StrategyCard
                        key={s.id}
                        strategy={s}
                        trades={trades as Trade[] || []}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        currency={currency}
                        rate={rate}
                    />
                ))}
            </div>
            
            {(strategies || []).length === 0 && (
                <div className="card p-6 text-center text-muted">
                    Nenhuma estratégia cadastrada. Clique em "Nova Estratégia" para começar a traquear seu edge.
                </div>
            )}


            {/* Modal for create/edit */}
            {open && (
                <StrategyForm
                    editing={editingStrategy}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}