import React, { useState, useEffect } from "react";
import {
  getAll,
  createFirm,
  updateFirm,
  deleteFirm,
  getFirmStats,
} from "@apps/lib/dataStore";
import { useCurrency } from '@apps/state';

const TYPES = ["Futures", "Forex", "Cripto", "Personal"];

// Estilo Glassmorphism BASE idêntico à página Accounts
const glassBase = {
  background: "rgba(255, 255, 255, 0.02)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: "1px solid rgba(255, 255, 255, 0.05)",
  borderRadius: "16px",
};

export default function FirmsPage() {
  const [firms, setFirms] = useState(() => getAll().firms || []);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", type: "Futures", logo: null, color: "#6366f1" });
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
    setForm({ name: "", type: "Futures", logo: null, color: "#6366f1" });
    setFirms(getAll().firms || []);
  };

  const onEdit = (f) => {
    setEditing(f);
    setForm({ name: f.name, type: f.type, logo: f.logo || null, color: f.color || "#6366f1" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDelete = async (id) => {
    if (!confirm("Excluir empresa? Contas associadas serão desvinculadas.")) return;
    await deleteFirm(id);
    setFirms(getAll().firms || []);
  };

  const typeColors = {
    Futures: 'pink',
    Forex: 'lavander',
    Cripto: 'orange',
    Personal: 'purple'
  };

  // Usamos HEX puro aqui para permitir mesclar com opacidade (ex: adicionando "26" para 15% de transparência)
  const typeHexOnly = {
    Futures: '#ec4899', // pink
    Forex: '#8b5cf6', // lavander
    Cripto: '#f97316', // orange
    Personal: '#a855f7', // purple
    Total: '#06b6d4' // turquoise/cyan
  };

  const statusPillClasses = {
    live: 'green',
    funded: 'blue',
    challenge: 'yellow',
    'challenge concluido': 'yellow',
    standby: 'gray'
  };

  return (
    <div className="firms-page" style={{ display: "grid", gap: 20 }}>

      {/* ==== RESUMO DE EMPRESAS ==== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        {/* CARD TOTAL */}
        <div className="hover-card" style={{ ...glassBase, position: 'relative', overflow: 'hidden', padding: '20px 24px' }}>
          {/* Luz Ambiente Radial (Efeito do Accounts.jsx) */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: `radial-gradient(circle, ${typeHexOnly.Total}33 0%, transparent 70%)`, borderRadius: '50%' }} />

          <h4 style={{ position: 'relative', zIndex: 1, margin: '0 0 8px 0', fontWeight: 600, color: 'var(--muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Total de Empresas
          </h4>
          <div style={{ position: 'relative', zIndex: 1, fontSize: 36, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
            {firms.length}
          </div>
        </div>

        {/* CARDS POR CATEGORIA */}
        {TYPES.map((type) => {
          const count = firms.filter((f) => f.type === type).length;
          const hexColor = typeHexOnly[type];

          return (
            <div key={type} className="hover-card" style={{ ...glassBase, position: 'relative', overflow: 'hidden', padding: '20px 24px' }}>
              {/* Luz Ambiente Radial na cor da Categoria */}
              <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: `radial-gradient(circle, ${hexColor}33 0%, transparent 70%)`, borderRadius: '50%' }} />

              <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className={`pill ${typeColors[type]}`} style={{ width: 8, height: 8, padding: 0, borderRadius: '50%', display: 'inline-block' }} />
                <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--muted)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {type}
                </h4>
              </div>
              <div style={{ position: 'relative', zIndex: 1, fontSize: 36, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
                {count}
              </div>
            </div>
          );
        })}
      </div>


      {/* ==== FORMULÁRIO DE CRIAR/EDITAR ==== */}
      <div style={{ ...glassBase, padding: "24px" }}>
        <h3 style={{ marginBottom: "16px", fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>
          {editing ? "✏️ Editar Empresa" : "➕ Nova Empresa"}
        </h3>

        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: "200px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px", fontSize: "12px" }}>Nome</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </div>

          <div style={{ width: "150px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px", fontSize: "12px" }}>Tipo</label>
            <select
              className="select"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              style={{ background: 'rgba(0,0,0,0.2)' }}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: "140px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px", fontSize: "12px" }}>Cor</label>
            <div className="input" style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px", height: 42, background: "rgba(0,0,0,0.2)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ position: 'relative', width: 20, height: 20, borderRadius: '50%', background: form.color || "#6366f1", border: "1px solid rgba(255,255,255,0.2)", overflow: 'hidden', flexShrink: 0 }}>
                <input
                  type="color"
                  value={form.color || "#6366f1"}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  style={{
                    position: "absolute",
                    top: "-50%", left: "-50%", width: "200%", height: "200%",
                    opacity: 0, cursor: "pointer"
                  }}
                />
              </div>
              <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "monospace" }}>{form.color || "#6366f1"}</span>
            </div>
          </div>

          <div style={{ width: "180px" }}>
            <label className="muted" style={{ display: "block", marginBottom: "6px", fontSize: "12px" }}>Logo (PNG/JPG)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="input"
              style={{ padding: "8px", cursor: "pointer", background: 'rgba(0,0,0,0.2)' }}
            />
          </div>

          {form.logo && (
            <div style={{ padding: "8px 12px", backgroundColor: "rgba(0,0,0,0.2)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", height: "42px", display: "flex", alignItems: "center" }}>
              <img
                src={form.logo}
                alt="logo"
                style={{ height: 26, maxWidth: 80, objectFit: "contain" }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, height: "42px", alignItems: "center" }}>
            <button className="btn accent" onClick={onSave} style={{ height: "100%" }}>
              {editing ? "Salvar" : "Criar"}
            </button>

            {editing && (
              <button
                className="btn ghost"
                style={{ height: "100%" }}
                onClick={() => {
                  setEditing(null);
                  setForm({ name: "", type: "Futures", logo: null, color: "#6366f1" });
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>


      {/* ==== SEÇÃO DE EMPRESAS ==== */}
      <div style={{ display: "grid", gap: 12 }}>
        <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Empresas</h3>

        {firms.length === 0 ? (
          <div style={{ ...glassBase, textAlign: "center", padding: "32px", color: "var(--muted)" }}>
            Nenhuma empresa cadastrada
          </div>
        ) : (
          firms.map((f) => {
            const s = getFirmStats(f.id);
            return (
              <div
                key={f.id}
                style={{
                  ...glassBase,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 24px',
                  gap: '24px',
                  flexWrap: 'wrap',
                  position: 'relative',
                  overflow: 'hidden',
                  // Removemos a sombra interna estática e trocamos pelo glow real
                }}
              >
                {/* 1. LUZ AMBIENTE DA COR DA EMPRESA ESPALHANDO PELO CARD */}
                <div style={{
                  position: 'absolute',
                  top: -60,
                  left: -60,
                  width: 200,
                  height: 200,
                  background: `radial-gradient(circle, ${f.color || '#6366f1'}25 0%, transparent 70%)`,
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  zIndex: 0
                }} />

                {/* 2. DETALHE EM "L" SUAVIZADO NA BORDA */}
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, bottom: 0,
                  width: '15%',
                  borderLeft: `4px solid ${f.color || 'var(--brand)'}`,
                  borderTop: `4px solid ${f.color || 'var(--brand)'}`,
                  borderTopLeftRadius: '16px',
                  pointerEvents: 'none',
                  boxSizing: 'border-box',
                  zIndex: 0
                }} />

                {/* --- CONTEÚDO (Z-Index 1 para ficar acima das luzes/bordas) --- */}

                {/* Bloco de Identidade (Logo, Nome e Categoria) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '220px', flex: '1.2', position: 'relative', zIndex: 1 }}>
                  <div style={{ width: '80px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {f.logo ? (
                      <img src={f.logo} alt={f.name} style={{ width: '100%', height: '100%', objectFit: "contain" }} />
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.5px' }}>NO LOGO</span>
                    )}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>{f.name}</h4>
                    <span className={`pill ${typeColors[f.type] || 'gray'}`} style={{ marginTop: '4px', display: 'inline-block', fontSize: '11px' }}>
                      {f.type}
                    </span>
                  </div>
                </div>

                {/* Bloco Financeiro (Funding e Payouts) */}
                <div style={{ display: 'flex', gap: '40px', minWidth: '240px', position: 'relative', zIndex: 1 }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Funding Total</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>{fmt(s.totalFunding)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Payouts Total</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--green)' }}>{fmt(s.totalPayouts)}</div>
                  </div>
                </div>

                {/* Bloco de Contas Ativas */}
                <div style={{ flex: '1', minWidth: '220px', position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Contas Vinculadas</div>
                  {(() => {
                    if (s.accountCount === 0) return <span className="muted" style={{ fontSize: '13px' }}>Nenhuma conta</span>;

                    const allAccounts = getAll().accounts || [];
                    const firmAccounts = allAccounts.filter(a => a.firmId === f.id);

                    const statusCounts = {
                      Live: firmAccounts.filter(a => a.status?.toLowerCase() === 'live').length,
                      Funded: firmAccounts.filter(a => a.status?.toLowerCase() === 'funded').length,
                      Challenge: firmAccounts.filter(a => a.status?.toLowerCase() === 'challenge').length,
                      'Ch. Concluido': firmAccounts.filter(a => a.status?.toLowerCase() === 'challenge concluido').length,
                      Standby: firmAccounts.filter(a => a.status?.toLowerCase() === 'standby').length,
                    };

                    const activeStatuses = Object.entries(statusCounts).filter(([_, count]) => count > 0);

                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '16px', color: 'var(--text)' }}>{s.accountCount}</strong>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {activeStatuses.map(([status, count]) => (
                            <span
                              key={status}
                              className={`pill ${statusPillClasses[status.toLowerCase()] || 'gray'}`}
                              style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px' }}
                            >
                              {status}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Ações Rápidas */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', position: 'relative', zIndex: 1 }}>
                  <button className="btn ghost small" onClick={() => onEdit(f)}>Editar</button>
                  <button className="btn ghost small" style={{ color: 'var(--red)' }} onClick={() => onDelete(f.id)}>Excluir</button>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}