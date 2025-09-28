import React, { useState, useEffect } from 'react';
import { useJournal } from "@apps/journal-state";
import { v4 as uuidv4 } from 'uuid';
import { Strategy, StrategyCategory } from '../types/strategy';

const categories: StrategyCategory[] = ['Futures', 'Forex', 'Cripto', 'Personal'];
const tagColors = ['blue', 'green', 'yellow', 'red', 'purple', 'pink', 'lavender'];
const getColorClass = (index: number) => `pill ${tagColors[index % tagColors.length]}`;
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
          className="input"
          placeholder="Adicionar tag de checklist (Pressione Enter)"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleAdd}
        />
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {/* Renderiza tags como pílulas coloridas */}
        {tags.map((tag, idx) => (
          <span key={idx} className={`${getColorClass(idx)} text-sm flex items-center`}>
            {tag}
            <button
              className="btn ghost tiny ml-2"
              onClick={() => handleRemove(idx)}
              title="Remover tag"
            >
              x
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};

interface Props {
  onClose: () => void;
  editing?: Strategy | null;
}

// Componente para o construtor de Checklist
const ChecklistBuilder: React.FC<{ checklist: string[]; onChange: (list: string[]) => void }> = ({ checklist, onChange }) => {
  const [newItem, setNewItem] = useState('');

  const handleAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = newItem.trim();
      if (v) {
        onChange([...checklist, v]);
        setNewItem('');
      }
    }
  };

  const handleRemove = (idx: number) => {
    onChange(checklist.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Adicionar item (Pressione Enter)"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleAdd}
        />
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {checklist.map((c, idx) => (
          <span key={idx} className="px-2 py-1 rounded bg-[#0f1724] text-sm flex items-center">
            {c}
            <button
              className="btn ghost tiny ml-2"
              onClick={() => handleRemove(idx)}
              title="Remover item"
            >
              x
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};


export default function StrategyForm({ onClose, editing }: Props) {
  const { addStrategy, updateStrategy } = useJournal() as any;
  const isEditing = !!editing;

  const [form, setForm] = useState<Strategy>(() => 
    editing ? editing : {
      id: uuidv4(),
      name: '',
      description: '',
      category: 'Futures',
      checklist: [],
      tags: [],
      defaultRisk: { riskPerR: 0, profitTargetR: 0, stopLossR: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );

  const save = () => {
    // Validação básica
    if (!form.name || form.name.length < 3) return alert('O nome da estratégia é obrigatório.');
    
    const payload = { 
        ...form,
        updatedAt: new Date().toISOString(),
        defaultRisk: {
            ...form.defaultRisk,
            riskPerR: parseFloat(String(form.defaultRisk.riskPerR)) || 0,
            profitTargetR: parseFloat(String(form.defaultRisk.profitTargetR)) || 0,
            stopLossR: parseFloat(String(form.defaultRisk.stopLossR)) || 0,
        }
    };
    
    if (isEditing) {
      updateStrategy(form.id, payload);
    } else {
      addStrategy(payload);
    }
    onClose();
  };

  return (
    // Modal padrão (fixed inset-0)
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="bg-black/60 absolute inset-0" onClick={onClose} />
      <div className="relative z-10 bg-card rounded-2xl p-6 w-full max-w-2xl overflow-y-auto max-h-[90vh]">
        
        <h3 className="text-xl font-semibold mb-4">{isEditing ? '✏️ Editar Estratégia' : '➕ Nova Estratégia'}</h3>

        <div className="grid grid-cols-2 gap-4">
          {/* Nome e Categoria */}
          <div>
            <label className="form-label">Nome</label>
            <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="form-label">Categoria</label>
            <select className="select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as StrategyCategory })}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Descrição */}
          <div className="col-span-2">
            <label className="form-label">Descrição</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

           {/* Checklist/Tags Builder */}
            <div className="col-span-2">
                <label className="form-label">Tags do Checklist de Entrada</label>
                <TagsBuilder 
                    tags={form.checklist} 
                    onChange={(list) => setForm({ ...form, checklist: list })} 
                />
            </div>
          
          {/* Default Risk Settings */}
          <div className="col-span-2">
            <h4 className="font-medium mt-3 mb-2">Configurações Padrão de Risco</h4>
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className="form-label">Risco por R ($)</label>
                    <input type="number" step="1" className="input" value={form.defaultRisk.riskPerR} onChange={e => setForm({...form, defaultRisk: {...form.defaultRisk, riskPerR: e.target.value as any}})} />
                </div>
                <div>
                    <label className="form-label">Alvo (R)</label>
                    <input type="number" step="0.1" className="input" value={form.defaultRisk.profitTargetR} onChange={e => setForm({...form, defaultRisk: {...form.defaultRisk, profitTargetR: e.target.value as any}})} />
                </div>
                <div>
                    <label className="form-label">Stop (R)</label>
                    <input type="number" step="0.1" className="input" value={form.defaultRisk.stopLossR} onChange={e => setForm({...form, defaultRisk: {...form.defaultRisk, stopLossR: e.target.value as any}})} />
                </div>
            </div>
            <div className="muted text-xs mt-1">Esses valores podem ser usados para pré-preencher o TradeForm.</div>
          </div>
          
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  );
}