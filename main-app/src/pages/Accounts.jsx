// main-app/src/pages/Accounts.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactDOM from 'react-dom'
import { useCurrency } from '@apps/state'
import { getAll, createAccount, updateAccount, deleteAccount, getAccountStats } from '@apps/lib/dataStore';

const statuses = ['Live', 'Funded', 'Challenge', 'Standby', 'Demo']
const types = ['Futures', 'Forex', 'Personal', 'Cripto']

// Componente de Dropdown customizado (igual ao filtro de status)
function CustomDropdown({ value, onChange, options, pillColors = {}, showLogos = false, renderValue }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const current = options.find(o => o.value === value);
  const pillColor = current?.color || null;
  const pillClass = pillColor ? '' : (pillColors[current?.label] || pillColors[value] || 'gray');

  // Calcular posição do menu com detecção de overflow
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, maxHeight: 320 });

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();

      // Calcular altura real do menu baseado no número de opções
      const itemHeight = 40;
      const menuPadding = 12;
      const idealHeight = Math.min(options.length * itemHeight + menuPadding, 320);

      const spaceBelow = window.innerHeight - rect.bottom - 10; // margem de segurança
      const spaceAbove = rect.top - 10;

      // Só abre para cima se NÃO couber embaixo E couber em cima
      const shouldOpenUpward = idealHeight > spaceBelow && spaceAbove > idealHeight;

      if (shouldOpenUpward) {
        // Abre para cima
        setMenuPosition({
          top: rect.top + window.scrollY - idealHeight - 4,
          left: rect.left + window.scrollX,
          maxHeight: Math.min(idealHeight, spaceAbove)
        });
      } else {
        // Abre para baixo (padrão)
        setMenuPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          maxHeight: Math.min(idealHeight, spaceBelow)
        });
      }
    }
  }, [open, options.length]);

  return (
    <>
      <div style={{ position: 'relative', display: 'inline-block' }} ref={btnRef}>
        <div
          className={`pill ${pillClass}`}
          onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
          style={{
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
            ...(pillColor ? { background: pillColor + '22', borderColor: pillColor + '66', color: pillColor } : {}),
          }}
        >
          {showLogos && current?.logo && (
            <img src={current.logo} alt={current.label} style={{ width: 20, height: 20, objectFit: 'contain' }} />
          )}
          {renderValue ? renderValue(current) : current?.label || '—'}
        </div>
      </div>

      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          className="custom-dropdown-menu"
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 99999,
            background: 'var(--card-bg, #1e1e2b)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            padding: '6px 0',
            boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
            minWidth: '180px',
            maxHeight: `${menuPosition.maxHeight || 320}px`,
            overflowY: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <div
              key={opt.value}
              className="custom-dropdown-item"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.15s ease',
                background: 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              {showLogos && opt.logo && (
                <img src={opt.logo} alt={opt.label} style={{ width: 24, height: 24, objectFit: 'contain' }} />
              )}
              <span className={`pill ${pillColors[opt.label] || pillColors[opt.value] || 'gray'}`}>
                {opt.label}
              </span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// Componente de Seleção Múltipla Moderno (estilo AccountPicker)
function ModernMultiSelect({ title, options, selectedValues, onChange, showLogos = false, pillColors = {} }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const isAllSelected = selectedValues.length === 0;
  const toggle = (val) => {
    if (selectedValues.includes(val)) onChange(selectedValues.filter(x => x !== val));
    else onChange([...selectedValues, val]);
  };
  const clear = (e) => { e.stopPropagation(); onChange([]); };

  return (
    <div style={{ position: 'relative', minWidth: 160, flex: '1 1 auto' }} ref={btnRef}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: open ? 'rgba(124,92,255,0.12)' : 'var(--chip-bg, #1b2130)', border: `1px solid ${open ? 'rgba(124,92,255,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, cursor: 'pointer', color: 'var(--text, #e7eaf0)', fontSize: 13, fontWeight: 500, transition: 'all 0.2s', width: '100%', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isAllSelected ? <span style={{ color: 'var(--muted, #a1a7b3)' }}>{title}: Todos</span> : <> <span style={{ color: 'var(--muted)' }}>{title}:</span> <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '2px 7px', fontSize: 12 }}>{selectedValues.length} sel.</span> </>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!isAllSelected && <span onClick={clear} title="Limpar" style={{ color: 'var(--muted)', fontSize: 14 }}>✕</span>}
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div ref={menuRef} className="account-picker-dropdown" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 99999, background: 'linear-gradient(180deg, #161b25 0%, #131825 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', minWidth: '100%', maxWidth: 360, overflow: 'hidden' }}>
          <div onClick={() => { onChange([]); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', cursor: 'pointer', background: isAllSelected ? 'rgba(124,92,255,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13, color: isAllSelected ? '#a78bfa' : 'var(--muted)', fontWeight: isAllSelected ? 600 : 400 }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isAllSelected ? '#a78bfa' : 'rgba(255,255,255,0.2)'}`, background: isAllSelected ? '#a78bfa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isAllSelected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
            </span>
            Todos
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {options.map(opt => {
              const checked = selectedValues.includes(opt.value);
              const pillClass = pillColors[opt.label] || pillColors[opt.value] || 'gray';
              return (
                <div key={opt.value} onClick={() => toggle(opt.value)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', background: checked ? 'rgba(124,92,255,0.08)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.03)' }} onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }} onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(124,92,255,0.08)' : 'transparent'; }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? '#7c5cff' : 'rgba(255,255,255,0.2)'}`, background: checked ? '#7c5cff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {checked && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                  </span>
                  {showLogos && opt.logo && <img src={opt.logo} alt={opt.label} style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />}
                  <span className={opt.label ? `pill ${pillClass}` : ''} style={{ fontSize: 12, fontWeight: 600 }}>{opt.label || opt.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([])
  const [firms, setFirms] = useState([])
  const [accountStatusFilter, setAccountStatusFilter] = useState(["Live", "Funded", "Challenge"]);
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [firmFilter, setFirmFilter] = useState([]);

  useEffect(() => {
    const data = getAll()
    setAccounts((data.accounts || []).filter(a => a.hidden !== true))
    setFirms(data.firms || [])
  }, [])

  const { currency, rate } = useCurrency()
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'dateCreated', direction: 'desc' })

  useEffect(() => {
    const sync = () => {
      const data = getAll()
      setAccounts((data.accounts || []).filter(a => a.hidden !== true))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const matchesSearch = (a.name || '').toLowerCase().includes(query.toLowerCase());
      const matchesStatus = accountStatusFilter.length === 0 ||
        accountStatusFilter.some(st => st.toLowerCase() === a.status?.toLowerCase());
      const matchesCategory = categoryFilter.length === 0 || categoryFilter.includes(a.type);
      const matchesFirm = firmFilter.length === 0 || firmFilter.includes(a.firmId);
      return matchesSearch && matchesStatus && matchesCategory && matchesFirm;
    });
  }, [accounts, query, accountStatusFilter, categoryFilter, firmFilter]);

  const sortedAccounts = useMemo(() => {
    if (!sortConfig.key) return filteredAccounts

    return [...filteredAccounts].sort((a, b) => {
      let aValue = a[sortConfig.key]
      let bValue = b[sortConfig.key]

      if (sortConfig.key === 'roi') {
        const aStats = getAccountStats(a.id) || { roi: 0 }
        const bStats = getAccountStats(b.id) || { roi: 0 }
        aValue = aStats.roi
        bValue = bStats.roi
      } else if (sortConfig.key === 'totalPayouts') {
        const aStats = getAccountStats(a.id) || { totalPayouts: 0 }
        const bStats = getAccountStats(b.id) || { totalPayouts: 0 }
        aValue = aStats.totalPayouts
        bValue = bStats.totalPayouts
      } else if (sortConfig.key === 'dateCreated') {
        aValue = new Date(aValue)
        bValue = new Date(bValue)
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredAccounts, sortConfig])

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ''
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

  const handleDelete = (e, accountId) => {
    e.stopPropagation();
    const acc = accounts.find(a => a.id === accountId);
    const confirmed = window.confirm(
      `⚠️ Are you sure you want to delete account "${acc?.name || 'unnamed'}"?\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    deleteAccount(accountId);
    setAccounts((getAll().accounts || []).filter(a => a.hidden !== true));
    if (selected === accountId) setSelected(null);
  };

  const fmt = (v) => currency === 'USD'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  const findFirm = (id) => firms.find(f => f.id === id) || null



  const accountStatuses = useMemo(() => {
    const all = (accounts || [])
      .map((a) => a.status?.toLowerCase() || "")
      .filter((s) => !!s);
    return Array.from(new Set(all));
  }, [accounts]);

  const [editedAccounts, setEditedAccounts] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const getFieldValue = (acc, field) =>
    editedAccounts[acc.id]?.[field] ?? acc[field];

  const editField = (accId, field, value) => {
    setEditedAccounts(prev => ({
      ...prev,
      [accId]: { ...prev[accId], [field]: value }
    }));
    setHasChanges(true);
  };

  const saveAllEdits = () => {
    const data = getAll().accounts;

    Object.entries(editedAccounts).forEach(([id, changes]) => {
      const original = data.find(a => a.id === id);
      updateAccount(id, { ...original, ...changes });
    });

    setEditedAccounts({});
    setHasChanges(false);
    setAccounts((getAll().accounts || []).filter(a => a.hidden !== true));
    window.dispatchEvent(new Event("storage"));
  };

  function InlineInput({ acc, field, type = "text" }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(getFieldValue(acc, field));

    useEffect(() => {
      setValue(getFieldValue(acc, field));
    }, [editedAccounts]);

    const commit = () => {
      editField(acc.id, field, type === "number" ? Number(value) : value);
      setEditing(false);
    };

    const cancel = () => {
      setValue(getFieldValue(acc, field));
      setEditing(false);
    };

    if (!editing) {
      return (
        <div
          className="acc-inline-display"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {field === "profitSplit"
            ? `${Math.round((value || 0) * 100)}%`
            : field === "dateCreated" && value
              ? value.split('-').reverse().join('/')
              : value || "—"}
        </div>
      );
    }

    return (
      <input
        autoFocus
        type={type}
        className="acc-inline-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // Componente para editar funding inline
  function InlineFunding({ acc, field }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(getFieldValue(acc, field));

    useEffect(() => {
      setValue(getFieldValue(acc, field));
    }, [editedAccounts]);

    const commit = () => {
      editField(acc.id, field, Number(value) || 0);
      setEditing(false);
    };

    const cancel = () => {
      setValue(getFieldValue(acc, field));
      setEditing(false);
    };

    if (!editing) {
      return (
        <div
          className="acc-inline-display"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {fmt(value || 0)}
        </div>
      );
    }

    return (
      <input
        autoFocus
        type="number"
        step="0.01"
        className="acc-inline-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 120 }}
      />
    );
  }

  return (
    <div className="accounts-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* CARDS DE RESUMO PREMIUM */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Card 1: Total Accounts */}
        <div style={{ flex: 1, minWidth: 260, background: 'rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }} className="hover-card">
          <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: 'radial-gradient(circle, rgba(124,92,255,0.15) 0%, transparent 70%)', borderRadius: '50%' }} />
          <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: 'var(--muted)' }}>Total Accounts</h4>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, marginBottom: 16 }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{filteredAccounts.length}</span>
            <span style={{ fontSize: 13, color: '#a78bfa' }}>active items</span>
          </div>
          <div style={{ display: 'flex', gap: 4, height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
            {statuses.map(s => {
              const count = filteredAccounts.filter(a => a.status === s).length;
              if (count === 0) return null;
              const pct = (count / filteredAccounts.length) * 100;
              const col = s === 'Live' ? '#10b981' : s === 'Funded' ? '#3b82f6' : s === 'Challenge' ? '#f59e0b' : '#6b7280';
              return <div key={s} style={{ width: `${pct}%`, background: col, transition: 'width 0.3s' }} title={`${s}: ${count}`} />;
            })}
          </div>
        </div>

        {/* Card 2: Categories */}
        <div style={{ flex: 1, minWidth: 260, background: 'rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }} className="hover-card">
          <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: 'radial-gradient(circle, rgba(249,115,22,0.1) 0%, transparent 70%)', borderRadius: '50%' }} />
          <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: 'var(--muted)', marginBottom: 16 }}>By Category</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {types.map(type => {
              const count = filteredAccounts.filter(a => a.type === type).length;
              if (count === 0) return null;
              const color = type === 'Forex' ? 'lavander' : type === 'Cripto' ? 'orange' : type === 'Futures' ? 'pink' : type === 'Personal' ? 'purple' : 'gray';
              return (
                <div key={type} className={`pill ${color}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 13, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontWeight: 700 }}>{count}</span>
                  <span style={{ opacity: 0.8 }}>{type}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Card 3: Capital */}
        <div style={{ flex: 1, minWidth: 260, background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.05) 100%)', backdropFilter: 'blur(10px)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden' }} className="hover-card">
          <div style={{ position: 'absolute', top: -20, right: -20, fontSize: 80, opacity: 0.05, transform: 'rotate(15deg)' }}></div>
          <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, color: '#34d399' }}>Assets Under Management (AUM)</h4>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginTop: 12, textShadow: '0 2px 10px rgba(16,185,129,0.2)' }}>
            {fmt(filteredAccounts.reduce((sum, a) => sum + (Number(a.currentFunding) || 0), 0))}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
            Total AUM
          </div>
        </div>
      </div>

      {/* MODAL */}
      {selected && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)' }} onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div style={{ maxWidth: 800, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', background: 'var(--card-bg)', borderRadius: 12, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', zIndex: 1001, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'background 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>×</button>

            {selected === 'new' ? (
              <NewAccountForm firms={firms} onCreate={(accountData) => { createAccount(accountData); setAccounts((getAll().accounts || []).filter(a => a.hidden !== true)); setSelected(null); }} onCancel={() => setSelected(null)} />
            ) : (
              <AccountDetail id={selected} update={updateAccount} getStats={getAccountStats} firms={firms} onClose={() => setSelected(null)} />
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div>
        <div className="toolbar" style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>

          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 200 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}></span>
            <input
              className="input"
              placeholder="Search for accounts..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: '100%', paddingLeft: 36, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

<ModernMultiSelect
            title="Status"
            options={statuses.map(s => ({ value: s, label: s }))}
            selectedValues={accountStatusFilter}
            onChange={setAccountStatusFilter}
            pillColors={{ Live: "green", Funded: "blue", Challenge: "yellow", Standby: "gray", Demo: "cyan", live: "green", funded: "blue", challenge: "yellow" }}
          />

          <ModernMultiSelect
            title="Category"
            options={types.map(t => ({ value: t, label: t }))}
            selectedValues={categoryFilter}
            onChange={setCategoryFilter}
            pillColors={{ Forex: "lavander", Cripto: "orange", Futures: "pink", Personal: "purple" }}
          />

          <ModernMultiSelect
            title="Firm"
            options={firms.map(f => ({ value: f.id, label: f.name, logo: f.logo }))}
            selectedValues={firmFilter}
            onChange={setFirmFilter}
            showLogos={true}
          />

          <button className="btn" onClick={() => setSelected('new')} style={{ flex: '0 0 auto' }}>+ Create Account</button>

          {hasChanges && (
            <button className="btn accent" onClick={saveAllEdits}>💾 Save Changes</button>
          )}
        </div>

        {/* TABLE */}
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort("dateCreated")}>Date Created {getSortIndicator("dateCreated")}</th>
                <th onClick={() => handleSort("name")}>Account {getSortIndicator("name")}</th>
                <th onClick={() => handleSort("type")}>Category {getSortIndicator("type")}</th>
                <th onClick={() => handleSort("firmId")}>Firm {getSortIndicator("firmId")}</th>
                <th onClick={() => handleSort("status")}>Status {getSortIndicator("status")}</th>
                <th onClick={() => handleSort("roi")}>ROI {getSortIndicator("roi")}</th>
                <th onClick={() => handleSort("profitSplit")}>Split {getSortIndicator("profitSplit")}</th>
                <th onClick={() => handleSort("totalPayouts")}>Payouts {getSortIndicator("totalPayouts")}</th>
                <th onClick={() => handleSort("initialFunding")}>Initial {getSortIndicator("initialFunding")}</th>
                <th onClick={() => handleSort("currentFunding")}>Current {getSortIndicator("currentFunding")}</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedAccounts.map((a) => {
                const acc = { ...a, ...(editedAccounts[a.id] || {}) };
                const s = getAccountStats(acc.id) || { roi: 0, totalPayouts: 0 };
                const roiPct = (s.roi * 100).toFixed(2);
                const roiClass = s.roi >= 0 ? "value-green" : "value-red";

                return (
                  <tr key={acc.id}>
                    <td data-label="Date Created">
                      <InlineInput acc={acc} field="dateCreated" type="date" />
                    </td>

                    <td data-label="Account">
                      <InlineInput acc={acc} field="name" />
                    </td>

                    <td data-label="Category" className="center">
                      <CustomDropdown
                        value={getFieldValue(acc, "type")}
                        onChange={(v) => editField(acc.id, "type", v)}
                        options={types.map(t => ({ label: t, value: t }))}
                        pillColors={{
                          Forex: "lavander",
                          Cripto: "orange",
                          Futures: "pink",
                          Personal: "purple"
                        }}
                      />
                    </td>

                    <td data-label="Firm" className="center">
                      <CustomDropdown
                        value={getFieldValue(acc, "firmId") || ""}
                        onChange={(v) => editField(acc.id, "firmId", v || null)}
                        options={[
                          { label: "None", value: "" },
                          ...firms.filter(f => f.type === acc.type).map(f => ({
                            label: f.name,
                            value: f.id,
                            logo: f.logo,
                            color: f.color
                          }))
                        ]}
                        showLogos={true}
                        pillColors={{ "None": "gray" }}
                      />
                    </td>

                    <td data-label="Status" className="center">
                      <CustomDropdown
                        value={getFieldValue(acc, "status")}
                        onChange={(v) => editField(acc.id, "status", v)}
                        options={statuses.map(s => ({ label: s, value: s }))}
                        pillColors={{
                          Live: "green",
                          Funded: "blue",
                          Challenge: "yellow",
                          Standby: "gray",
                          Demo: "orange"
                        }}
                      />
                    </td>

                    <td data-label="ROI" className={"center " + roiClass}>{roiPct}%</td>

                    <td data-label="Split" className="center">
                      <InlineInput acc={acc} field="profitSplit" type="number" />
                    </td>

                    <td data-label="Payouts" className="center">{fmt(s.totalPayouts)}</td>

                    <td data-label="Initial" className="center">
                      <InlineFunding acc={acc} field="initialFunding" />
                    </td>

                    <td data-label="Current" className="center">
                      <InlineFunding acc={acc} field="currentFunding" />
                    </td>

                    <td data-label="Actions" className="center">
                      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                        <button className="btn ghost" onClick={() => setSelected(acc.id)} title="Edit account" style={{ padding: "4px 8px", fontSize: 14 }}>✏️</button>
                        <button className="btn ghost" onClick={(e) => handleDelete(e, acc.id)} title="Delete account" style={{ padding: "4px 8px", fontSize: 14, color: "#e74c3c" }}>X</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function NewAccountForm({ onCreate, onCancel, firms = [] }) {
  const [form, setForm] = useState({
    name: 'New Account',
    type: 'Futures',
    firmId: null,
    status: 'Standby',
    dateCreated: new Date().toLocaleDateString('en-CA'),
    payoutFrequency: 'monthly',
    initialFunding: 0,
    currentFunding: 0,
    profitSplit: 0.8,
    defaultWeight: 1
  })

  const handleSubmit = () => {
    if (!form.name) return alert('Name is required')
    onCreate(form)
  }

  const selectedFirm = firms.find(f => f.id === form.firmId) || null

  return (
    <div className="card">
      <h3>➕ New Account</h3>
      <div className="field">
        <label>Name</label>
        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      </div>

      <div className="row">
        <div className="field">
          <label>Category</label>
          <select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, firmId: null })}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Firm</label>
          <select className="select" value={form.firmId || ''} onChange={e => setForm({ ...form, firmId: e.target.value || null })}>
            <option value=''>— None —</option>
            {firms.filter(f => f.type === form.type).map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {selectedFirm && selectedFirm.logo && (
            <div style={{ marginTop: 6 }}>
              <img src={selectedFirm.logo} alt={selectedFirm.name} style={{ width: 80, height: 36, objectFit: 'contain' }} />
            </div>
          )}
        </div>

        <div className="field">
          <label>Status</label>
          <select className="select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Date Created</label>
          <input type="date" className="input" value={form.dateCreated} onChange={e => setForm({ ...form, dateCreated: e.target.value })} />
        </div>
        <div className="field">
          <label>Payout Frequency</label>
          <select className="select" value={form.payoutFrequency} onChange={e => setForm({ ...form, payoutFrequency: e.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Initial Funding</label>
          <input type="number" className="input" value={form.initialFunding} onChange={e => { const value = parseFloat(e.target.value) || 0; setForm({ ...form, initialFunding: value, currentFunding: value }); }} />
        </div>

        <div className="field">
          <label>Current Funding</label>
          <input type="number" className="input" value={form.currentFunding} readOnly style={{ opacity: 0.7, cursor: 'not-allowed' }} />
        </div>
      </div>

      <div className="field">
        <label>Profit Split (%)</label>
        <input type="number" step="1" className="input" value={Math.round(form.profitSplit * 100) || 0} onChange={e => setForm({ ...form, profitSplit: parseFloat(e.target.value) / 100 || 0 })} style={{ flexGrow: 1 }} />
      </div>

      <div className="toolbar">
        <button className="btn" onClick={handleSubmit}>Save</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AccountDetail({ id, update, getStats, firms = [], onClose }) {
  const { currency, rate } = useCurrency();
  const navigate = useNavigate();
  const [local, setLocal] = useState(null);

  useEffect(() => {
    const data = getAll();
    const acc = data.accounts.find(a => a.id === id) || null;
    setLocal(acc);
  }, [id]);

  if (!local) return <div className="card">Account not found</div>;

  const s = getStats(id) || { roi: 0, totalPayouts: 0 };

  const fmt = (v) =>
    currency === "USD"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0)
      : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((v || 0) * rate);

  const save = () => {
    const payload = {
      ...local,
      initialFunding: Number(local.initialFunding) || 0,
      currentFunding: Number(local.currentFunding) || 0,
      profitSplit: Number(local.profitSplit) || 0,
    };

    updateAccount(id, payload);
    window.dispatchEvent(new Event("storage"));
    if (onClose) onClose();
  };

  const firmsForType = firms.filter((f) => f.type === (local.type || ""));

  return (
    <div className="card">
      <h3>📋 Account</h3>
      <div className="field">
        <label>Name</label>
        <input className="input" value={local.name || ""} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
      </div>

      <div className="row">
        <div className="field">
          <label>Category</label>
          <select className="select" value={local.type || ""} onChange={(e) => setLocal({ ...local, type: e.target.value, firmId: null })}>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Firm</label>
          <select className="select" value={local.firmId || ""} onChange={(e) => setLocal({ ...local, firmId: e.target.value || null })}>
            <option value="">— None —</option>
            {firmsForType.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          {local.firmId &&
            (() => {
              const fm = firms.find((x) => x.id === local.firmId);
              return fm ? (
                <div style={{ marginTop: 6 }}>
                  <img src={fm.logo} alt={fm.name} style={{ width: 80, height: 36, objectFit: "contain" }} />
                </div>
              ) : null;
            })()}
        </div>

        <div className="field">
          <label>Status</label>
          <select className="select" value={local.status || ""} onChange={(e) => setLocal({ ...local, status: e.target.value })}>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Date Created</label>
          <input type="date" className="input" value={local.dateCreated || ""} onChange={(e) => setLocal({ ...local, dateCreated: e.target.value })} />
        </div>
        <div className="field">
          <label>Payout Frequency</label>
          <select className="select" value={local.payoutFrequency || ""} onChange={(e) => setLocal({ ...local, payoutFrequency: e.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Initial Funding</label>
          <input type="number" step="0.01" className="input" value={local.initialFunding || 0} onChange={(e) => { const value = parseFloat(e.target.value) || 0; setLocal({ ...local, initialFunding: parseFloat(value.toFixed(2)) }); }} />
        </div>
        <div className="field">
          <label>Current Funding</label>
          <input type="number" step="0.01" className="input" value={local.currentFunding || 0} onChange={(e) => { const value = parseFloat(e.target.value) || 0; setLocal({ ...local, currentFunding: parseFloat(value.toFixed(2)) }); }} />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>Profit Split (%)</label>
          <input type="number" step="1" className="input" value={Math.round(local.profitSplit * 100) || 0} onChange={(e) => setLocal({ ...local, profitSplit: parseFloat(e.target.value) / 100 || 0 })} style={{ flexGrow: 1 }} />
        </div>
        <div className="field">
          <label>ROI (%)</label>
          <div className="input" style={{ opacity: 0.8 }} readOnly>
            {(s.roi * 100).toFixed(2)}%
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, marginBottom: 8 }}>

        <h4 style={{ margin: '6px 0' }}>📂 Payouts & Receipts</h4>

        {(() => {
          const allData = getAll();
          const accountPayouts = (allData.payouts || []).filter((p) =>
            (p.splitByAccount && p.splitByAccount[id]) ||
            (p.accountIds && p.accountIds.includes(id))
          );

          const totals = accountPayouts.reduce(
            (acc, p) => {
              const part = p.splitByAccount?.[id] || {};
              acc.gross += Number(part.gross ?? p.amountSolicited ?? 0);
              const partFee = Number(part.fee ?? ((part.gross ?? p.amountSolicited ?? 0) - (part.net ?? 0)));
              acc.fee += partFee;
              acc.net += Number(part.net ?? 0);
              return acc;
            },
            { gross: 0, fee: 0, net: 0 }
          );

          if (accountPayouts.length > 0) {
            var totalsCard = (
              <div style={{ background: 'var(--card-bg)', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                <strong>Total:</strong>
                <div style={{ marginTop: 6, fontSize: 13, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div><b>Gross:</b> {fmt(totals.gross || 0)}</div>
                  <div><b>Fee:</b> {fmt(totals.fee || 0)}</div>
                  <div>✅ <b>Net:</b> {fmt(totals.net || 0)}</div>
                </div>
              </div>
            );
          }

          if (accountPayouts.length === 0) {
            return (
              <div style={{ color: 'var(--muted)', padding: 8 }}>
                No payouts registered for this account.
              </div>
            );
          }

          return (
            <div style={{ display: 'grid', gap: 8 }}>
              {totalsCard}

              {accountPayouts.map((p) => {
                const part = p.splitByAccount?.[id] || {};
                const net = Number(part.net ?? 0);
                const gross = Number(part.gross ?? p.amountSolicited ?? 0);
                const fee = Number(part.fee ?? (gross - net));
                const formattedGross = fmt(gross || 0);
                const formattedFee = fmt(fee || 0);
                const formattedNet = fmt(net || 0);
                const rawDate = p.approvedDate || p.dateCreated || p.date || '';
                const formattedDate = rawDate ? new Date(rawDate).toLocaleDateString('en-US') : '';
                const displayName = `Payout: ${formattedNet} (${formattedDate})`;
                const attachment = p.attachments?.[id] || null;
                const openPayoutPage = () => {
                  localStorage.setItem('openPayoutId', p.id);
                  navigate('/payouts');
                };

                return (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 8, background: 'var(--card-bg)' }}>
                    <div>
                      <div style={{ fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }} onClick={openPayoutPage}>
                        {displayName}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Gross: {formattedGross} • Fee: {formattedFee}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {attachment ? (
                        <>
                          <button className="btn ghost small" onClick={() => window.open(attachment.url, '_blank', 'noopener,noreferrer')}>
                            📁 View
                          </button>
                          <a className="btn small" href={attachment.url} target="_blank" rel="noreferrer" download>
                            ⬇️ Download
                          </a>
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>No receipt</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div className="toolbar">
        <button className="btn" onClick={save}>Save</button>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}