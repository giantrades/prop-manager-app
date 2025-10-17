import React, { useState, useEffect } from "react";
import {
  getAll,
  createFirm,
  updateFirm,
  deleteFirm,
  getFirmStats,
} from "@apps/lib/dataStore";
import { useCurrency } from '@apps/state'


const TYPES = ["Futures", "Forex", "Cripto", "Personal"];

export default function FirmsPage() {
  const [firms, setFirms] = useState(() => getAll().firms || []);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Futures", logo: null });
  const { currency, rate } = useCurrency();
  const fmt = (v) =>
  currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate);

  useEffect(() => {
    setFirms(getAll().firms || []);
  }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      alert("Logo muito grande. Recomendo < 300KB.");
    }
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    if (!form.name || !form.type) return alert("Nome e tipo são obrigatórios");
    if (editing) {
      await updateFirm(editing.id, form);
      setEditing(null);
    } else {
      await createFirm(form);
    }
    setForm({ name: "", type: "Futures", logo: null });
    setFirms(getAll().firms || []);
  };

  const onEdit = (f) => {
    setEditing(f);
    setForm({ name: f.name, type: f.type, logo: f.logo || null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (id) => {
    if (!confirm("Excluir empresa? Contas associadas serão desvinculadas.")) return;
    await deleteFirm(id);
    setFirms(getAll().firms || []);
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #3a3a4a",
    borderRadius: "6px",
    backgroundColor: "#2a2a3a",
    color: "#e0e0e0",
    outline: "none",
    transition: "all 0.2s",
  };

  const labelStyle = {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "500",
    color: "#b0b0c0",
  };

  const buttonStyle = {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "500",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const primaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: "#6366f1",
    color: "white",
  };

  const ghostButtonStyle = {
    ...buttonStyle,
    backgroundColor: "transparent",
    border: "1px solid #3a3a4a",
    color: "#b0b0c0",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
{/* ==== RESUMO DE EMPRESAS ==== */}
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16,
  }}
>
  {/* CARD 1 - Total de Empresas */}
  <div className="card accent5">
    <h4
      style={{
        marginBottom: 8,
        fontWeight: 600,
        color: 'var(--text-muted, #b4b8c0)',
      }}
    >
      Total de Empresas
    </h4>
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        color: 'var(--text)',
      }}
    >
      {firms.length}
    </div>
  </div>

  {/* DEMAIS CARDS POR CATEGORIA */}
  {TYPES.map((type) => {
    const count = firms.filter((f) => f.type === type).length;
    const accentMap = {
      Futures: 'accent16',
      Forex: 'accent17',
      Cripto: 'accent14',
      Personal: 'accent15',
    };
    return (
      <div key={type} className={`card ${accentMap[type]}`}>
        <h4
          style={{
            marginBottom: 8,
            fontWeight: 600,
            color: 'var(--text-muted, #b4b8c0)',
          }}
        >
          {type}
        </h4>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: 'var(--text)',
          }}
        >
          {count}
        </div>
      </div>
    );
  })}
</div>
{/* ==== FIM DO RESUMO ==== */}


      <div className="card">
        <h3 style={{ marginBottom: "16px", color: "#e0e0e0" }}>
          {editing ? "Editar Empresa" : "Nova Empresa"}
        </h3>
        
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: "200px" }}>
            <label style={labelStyle}>Nome</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onFocus={(e) => e.target.style.borderColor = "#6366f1"}
              onBlur={(e) => e.target.style.borderColor = "#3a3a4a"}
            />
          </div>

          <div style={{ width: "150px" }}>
            <label style={labelStyle}>Tipo</label>
            <select
              style={inputStyle}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              onFocus={(e) => e.target.style.borderColor = "#6366f1"}
              onBlur={(e) => e.target.style.borderColor = "#3a3a4a"}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: "180px" }}>
            <label style={labelStyle}>Logo (PNG/JPG)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFile}
              style={{
                ...inputStyle,
                padding: "8px",
                cursor: "pointer",
              }}
            />
          </div>

          {form.logo && (
            <div style={{ padding: "8px 12px", backgroundColor: "#1a1a2a", borderRadius: "6px", border: "1px solid #3a3a4a", height: "42px", display: "flex", alignItems: "center" }}>
              <img
                src={form.logo}
                alt="logo"
                style={{
                  height: 26,
                  maxWidth: 80,
                  objectFit: "contain",
                }}
              />
            </div>
          )}

          <button
            style={primaryButtonStyle}
            onClick={onSave}
            onMouseEnter={(e) => e.target.style.backgroundColor = "#5558e3"}
            onMouseLeave={(e) => e.target.style.backgroundColor = "#6366f1"}
          >
            {editing ? "Salvar" : "Criar"}
          </button>
          
          {editing && (
            <button
              style={ghostButtonStyle}
              onClick={() => {
                setEditing(null);
                setForm({ name: "", type: "Futures", logo: null });
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = "#2a2a3a"}
              onMouseLeave={(e) => e.target.style.backgroundColor = "transparent"}
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: "20px", color: "#e0e0e0" }}>Empresas</h3>
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
            {firms.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Nenhuma empresa cadastrada
                </td>
              </tr>
            )}
            {firms.map((f) => {
              const s = getFirmStats(f.id);
              return (
                <tr key={f.id}>
                  <td style={{ width: 110 }}>
                    {f.logo ? (
                      <img
                        src={f.logo}
                        alt={f.name}
                        style={{ width: 80, height: 30, objectFit: "contain" }}
                      />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{f.name}</td>
                  <td>{f.type}</td>
                 <td>{fmt(s.totalFunding)}</td>
                <td>{fmt(s.totalPayouts)}</td>

                  <td>{s.accountCount}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn ghost small" onClick={() => onEdit(f)}>
                      Editar
                    </button>
                    <button className="btn ghost small" onClick={() => onDelete(f.id)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}