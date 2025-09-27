// src/pages/Firms.jsx
import React, { useState } from "react";
import { useData } from '@apps/state'

const TYPES = ['Futures','Forex','Cripto','Personal'];

export default function FirmsPage(){
  const { firms = [], createFirm, updateFirm, deleteFirm, getFirmStats } = useData();

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:'', type: 'Futures', logo: null });

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) { // limite sugerido para evitar arquivo muito grande
      alert('Logo muito grande. Recomendo < 300KB.');
    }
    const reader = new FileReader();
    reader.onload = () => setForm(prev => ({ ...prev, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    if (!form.name || !form.type) return alert('Nome e tipo são obrigatórios');
    if (editing) {
      await updateFirm(editing.id, form);
      setEditing(null);
    } else {
      await createFirm(form);
    }
    setForm({ name:'', type:'Futures', logo: null });
  };

  const onEdit = (f) => {
    setEditing(f);
    setForm({ name: f.name, type: f.type, logo: f.logo || null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const onDelete = async (id) => {
    if (!confirm('Excluir empresa? Contas associadas serão desvinculadas.')) return;
    await deleteFirm(id);
  }

  return (
    <div style={{display:'grid', gap:16}}>
      <div className="card">
        <h3>{editing ? 'Editar Empresa' : 'Nova Empresa'}</h3>
        <div className="field">
          <label>Nome</label>
          <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select value={form.type} onChange={e=>setForm({...form, type:e.target.value})}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Logo (PNG/JPG)</label>
          <input type="file" accept="image/*" onChange={handleFile}/>
          {form.logo && <div style={{marginTop:8}}><img src={form.logo} alt="logo" style={{width:120,height:50,objectFit:'contain',border:'1px solid #eee'}}/></div>}
        </div>
        <div style={{display:'flex', gap:8, marginTop:8}}>
          <button className="btn" onClick={onSave}>{editing ? 'Salvar' : 'Criar'}</button>
          {editing && <button className="btn ghost" onClick={()=>{ setEditing(null); setForm({name:'', type:'Futures', logo:null}) }}>Cancelar</button>}
        </div>
      </div>

      <div className="card">
        <h3>Empresas</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Logo</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Funding total</th>
              <th>Payouts total</th>
              <th>Contas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {firms.length===0 && <tr><td colSpan={7} className="muted">Nenhuma empresa cadastrada</td></tr>}
            {firms.map(f=>{
              const s = getFirmStats(f.id)
              return (
                <tr key={f.id}>
                  <td style={{width:110}}>
                    {f.logo ? <img src={f.logo} alt={f.name} style={{width:80,height:30,objectFit:'contain'}} /> : <span className="muted">—</span>}
                  </td>
                  <td>{f.name}</td>
                  <td>{f.type}</td>
                  <td>{new Intl.NumberFormat('pt-BR',{ style:'currency', currency:'BRL'}).format(s.totalFunding || 0)}</td>
                  <td>{new Intl.NumberFormat('pt-BR',{ style:'currency', currency:'BRL'}).format(s.totalPayouts || 0)}</td>
                  <td>{s.accountCount}</td>
                  <td style={{textAlign:'right'}}>
                    <button className="btn ghost small" onClick={()=>onEdit(f)}>Editar</button>
                    <button className="btn ghost small" onClick={()=>onDelete(f.id)}>Excluir</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
