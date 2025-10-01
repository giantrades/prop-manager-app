import React, { useState, useEffect } from 'react';
import { useJournal } from "@apps/journal-state";
import { v4 as uuidv4 } from 'uuid';
import { Strategy, StrategyCategory, DefaultRiskSettings } from '../types/strategy';

// 💥 CORREÇÃO 1: Definição do Tipo Props
type Props = {
    onClose: () => void;
    editing?: Strategy | null;
};

// --- Auxiliares de Tags e Categoria (necessários para TagsBuilder) ---
const categories: StrategyCategory[] = ['Futures', 'Forex', 'Cripto', 'Personal'];
const tagColors = ['blue', 'green', 'yellow', 'red', 'purple', 'pink', 'lavender'];
const getColorClass = (index: number) => `pill ${tagColors[index % tagColors.length]}`;

// 💥 CORREÇÃO 2: Redefinição do Componente TagsBuilder
const TagsBuilder: React.FC<{ tags: string[]; onChange: (list: string[]) => void }> = ({ tags, onChange }) => {
    const [newTag, setNewTag] = useState('');
    
    const handleAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = newTag.trim();
            // Garante que a tag não esteja vazia e não seja duplicada
            if (v && !tags.includes(v)) {
                onChange([...tags, v]);
                setNewTag('');
            }
        }
    };

    const handleRemove = (idx: number) => {
        onChange(tags.filter((_, i) => i !== idx));
    };

    return (
        <div>
            <div className="flex gap-2">
                <input
                    className="input flex-1"
                    placeholder="Adicionar tag de checklist (Pressione Enter)"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleAdd}
                />
            </div>
            <div className="flex gap-2 flex-wrap mt-2">
                {tags.map((tag, idx) => (
                    <div 
                        key={tag} 
                        className={`pill ${getColorClass(idx)} cursor-pointer`} 
                        onClick={() => handleRemove(idx)}
                    >
                        {tag} 
                        <span className="ml-1 opacity-70">x</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
// --------------------------------------------------------------------


export default function StrategyForm({ onClose, editing }: Props) {
    const { saveStrategy } = useJournal();

    // Estado inicial: Garante que o defaultRisk seja nulo ou indefinido para manter o form conciso
    const [form, setForm] = useState<Partial<Strategy>>(() => ({
        ...editing,
        // Limpamos o defaultRisk aqui e no momento de salvar
        defaultRisk: undefined, 
        tags: Object.keys(editing?.tags || {}),
    }));
    const [tags, setTags] = useState<string[]>(Object.keys(editing?.tags || {}));


    // Função SAVE
    const save = async () => {
        // Validação básica
        if (!form.name || !form.category) {
            alert("Nome e Categoria são obrigatórios!");
            return;
        }

          // Converte os valores R:R para números
          const defaultRisk: DefaultRiskSettings = {
            profitTargetR: Number(form.defaultRisk?.profitTargetR) || 0,
            stopLossR: Number(form.defaultRisk?.stopLossR) || 0,
            // Mantendo riskPerR opcional/removido se a tipagem final for só R:R
            // Se precisar reintroduzir o risco em %, use a correção anterior. 
            // Por agora, focamos em Target e Stop em R.
        };

         const finalForm: Strategy = {
            ...form,
            id: editing?.id || uuidv4(),
            description: form.description || '', // Adiciona Descrição
            defaultRisk: defaultRisk.profitTargetR || defaultRisk.stopLossR ? defaultRisk : undefined,
            tags: tags.reduce((acc, tag) => ({ ...acc, [tag]: true }), {}),
            createdAt: editing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        } as Strategy;

        try {
            await saveStrategy(finalForm);
            onClose();
        } catch (e) {
            console.error("Erro ao salvar a estratégia:", e);
        }
    };


    return (
        <div className="card p-6">
            <h3 className="text-xl font-semibold mb-4">{editing ? 'Editar' : 'Nova'} Estratégia</h3>
            
            {/* Seção 1: Nome e Categoria */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="form-label">Nome da Estratégia</label>
                    <input 
                        className="input" 
                        value={form.name || ''} 
                        onChange={e => setForm({...form, name: e.target.value})} 
                    />
                </div>
                <div>
                    <label className="form-label">Categoria</label>
                    <select 
                        className="input" 
                        value={form.category || ''} 
                        onChange={e => setForm({...form, category: e.target.value as StrategyCategory})}
                    >
                        <option value="">Selecione...</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* Seção 2: Checklist/Tags */}
            <div className="mt-4">
                <label className="form-label">Tags de Checklist</label>
                {/* 💥 TagsBuilder agora está definido e pode ser usado */}
                <TagsBuilder tags={tags} onChange={setTags} />
            </div>

              {/* 💥 NOVO: Descrição */}
            <div className="mt-4">
                <label className="form-label">Descrição</label>
                <textarea 
                    className="input h-20" 
                    value={form.description || ''} 
                    onChange={e => setForm({...form, description: e.target.value})} 
                    placeholder="Detalhes sobre a regra de entrada, saída e gerenciamento..."
                />
            </div>

          {/* Seção de Risco R:R */}
            <div className="mt-6">
                <h4 className="font-semibold text-sm mb-2 text-muted">Configurações Padrão R:R (Opcional)</h4>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="form-label">Alvo (R)</label>
                        <input 
                            type="number" step="0.1" className="input" 
                            value={form.defaultRisk?.profitTargetR || ''} 
                            onChange={e => setForm({...form, defaultRisk: {...form.defaultRisk, profitTargetR: e.target.value as any}})} 
                        />
                    </div>
                    <div>
                        <label className="form-label">Stop (R)</label>
                        <input 
                            type="number" step="0.1" className="input" 
                            value={form.defaultRisk?.stopLossR || ''} 
                            onChange={e => setForm({...form, defaultRisk: {...form.defaultRisk, stopLossR: e.target.value as any}})} 
                        />
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
                <button className="btn ghost" onClick={onClose}>Cancelar</button>
                <button className="btn" onClick={save}>
                    {editing ? 'Salvar Alterações' : 'Criar Estratégia'}
                </button>
            </div>
            
        </div>
    );
}