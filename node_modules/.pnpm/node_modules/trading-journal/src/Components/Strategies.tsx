import React, { useState, useMemo } from 'react';
import { useJournal } from "@apps/journal-state";
import { useCurrency } from "@apps/state";
import StrategyForm from '../Components/StrategyForm';
import { Strategy } from '../types/strategy';
import { Trade } from '../types/trade'; // Para filtragem de trades
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';


// -----------------------------------------------------------
// 💥 NOVO: Componente Tabela de Estratégias
// -----------------------------------------------------------
interface StrategyTableProps {
    strategies: Strategy[];
    onEdit: (s: Strategy) => void;
    onDelete: (id: string) => void;
}

const StrategyTable: React.FC<StrategyTableProps> = ({ strategies, onEdit, onDelete }) => {
    return (
        <div className="table-mini w-full"> {/* Reusa a classe table-mini do styles.css */}
            <table className="w-full">
                <thead className="text-sm text-muted">
                    <tr>
                        <th className="text-left">Nome</th>
                        <th className="text-left">Categoria</th>
                        <th className="text-left">R:R Padrão</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {strategies.map(s => (
                        <tr key={s.id} className="border-t">
                            <td className="font-medium">{s.name}</td>
                            <td><span className="pill green">{s.category}</span></td>
                            <td>
                                {s.defaultRisk ? `${s.defaultRisk.profitTargetR} / ${s.defaultRisk.stopLossR}` : '-'}
                            </td>
                            <td>
                                <div className="flex gap-1 justify-center">
                                    <button 
                                        className="btn ghost small" 
                                        onClick={() => onEdit(s)}
                                        title="Editar estratégia"
                                    >
                                        ✏️
                                    </button>
                                    <button 
                                        className="btn ghost small" 
                                        onClick={() => onDelete(s.id)}
                                        title="Excluir estratégia"
                                        style={{ color: '#e74c3c' }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
// -----------------------------------------------------------
// 💥 Strategies.tsx (Componente Principal)
// -----------------------------------------------------------

export default function StrategiesPage() { // Renomeado para evitar conflito com componente auxiliar
    const { strategies, deleteStrategy } = useJournal();
    // Você não precisa mais de `trades`, `currency` e `rate` se removermos StrategyCard
    
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

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta estratégia?")) {
            await deleteStrategy(id);
        }
    };

    return (
        <div className="container p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">📈 Gerenciamento de Estratégias</h2>
                <div>
                    <button className="btn" onClick={openNew}>➕ Nova Estratégia</button>
                </div>
            </div>

            {/* 💥 NOVO: Uso da Tabela */}
            {strategies && strategies.length > 0 ? (
                <StrategyTable 
                    strategies={strategies as Strategy[]} 
                    onEdit={handleEdit} 
                    onDelete={handleDelete}
                />
            ) : (
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