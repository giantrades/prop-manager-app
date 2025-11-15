import React, { useEffect, useMemo, useState, useRef } from 'react'
import { useCurrency } from '@apps/state'
import { useFilters } from '@apps/state'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid
} from 'recharts'
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import { getAllGoals } from '@apps/lib/dataStore';

/* =========================================================
   1) Barra de filtros (categorias + range)
   ========================================================= */
function FiltersBar({ 
  categories, 
  accountStatusFilter, 
  setAccountStatusFilter,
  statusDropdownOpen,
  setStatusDropdownOpen,
  statusDropdownRef,
  accountStatuses,
  dateFilter = {start:null,end:null},
  setDateFilter,
  showCalendar,
  setShowCalendar,
  calendarRef, 
}) {
  const {
    categories: sel,
    toggleCategory,
    markAll,
    clearCategories,
    timeRange,
    setRange,
    isMarkAllActive
  } = useFilters()

  const [catColors, setCatColors] = useState({})

  useEffect(() => {
    const map = {}
    const order = ['Forex','Cripto','Futures','Personal',
      ...categories.filter(c => !['Forex','Cripto','Futures','Personal'].includes(c))]
    order.forEach(cat => {
      const cls =
        cat==='Forex'   ? 'lavander' :
        cat==='Cripto'  ? 'orange'   :
        cat==='Futures' ? 'pink'     :
        cat==='Personal'? 'purple'   : 'gray'
      const span = document.createElement('span')
      span.className = `pill ${cls}`
      document.body.appendChild(span)
      map[cat] = getComputedStyle(span).color
      document.body.removeChild(span)
    })
    setCatColors(map)
  }, [categories])

  const chipStyle = (item, active) => ({
    borderColor: active ? (catColors[item] || 'var(--primary)') : 'var(--border)',
    backgroundColor: active ? (catColors[item] || 'var(--primary)')+'33' : 'transparent',
    color: active ? (catColors[item] || 'var(--primary)') : 'var(--text-secondary)'
  })

  return (
    <div className="filters sticky-filters" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap'
    }}>
      {/* ESQUERDA: Filtros de Categoria */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto' }}>
        <span>🔎 Filtros:</span>
        <div style={{ display:'inline-flex', gap:8, flexWrap:'wrap' }}>
          {categories.map(item=>{
            const active = sel.includes(item)
            return (
              <button key={item}
                className={`chip ${active?'active':''}`}
                style={chipStyle(item, active)}
                onClick={()=>toggleCategory(item)}
              >
                {active &&
                  <span style={{
                    display:'inline-block', width:8, height:8, borderRadius:'50%',
                    backgroundColor: catColors[item] || 'var(--primary)', marginRight:6
                  }}/>}
                {item}
              </button>
            )
          })}
        </div>

        <button
          className={`chip ${isMarkAllActive ? 'active' : ''}`}
          style={{
            borderColor:'var(--primary)',
            backgroundColor: isMarkAllActive ? 'var(--primary)20' : 'transparent',
            color:'var(--primary)'
          }}
          onClick={()=>markAll(categories)}
        >
          ✅ Marcar todas
        </button>

        <button className="chip" onClick={clearCategories}>🧹 Limpar</button>
      </div>

{/* ========== CENTRO: Filtro de Status de Conta ========== */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8,
        flex: '0 0 auto',
        justifyContent: 'center'
      }}>
        <div style={{ position: 'relative' }} ref={statusDropdownRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setStatusDropdownOpen(v => !v); }}
            className="input"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minWidth: 180,
              cursor: "pointer"
            }}
          >
            {accountStatusFilter && accountStatusFilter.length > 0
              ? `Status: ${accountStatusFilter.join(", ")}`
              : "Filtrar Status"}
            <span style={{ opacity: 0.7, marginLeft: 8 }}>▾</span>
          </button>

          {statusDropdownOpen && accountStatuses && accountStatuses.length > 0 && (
            <div
              className="card"
              style={{
                position: "absolute",
                top: "110%",
                left: 0,
                zIndex: 9999,
                background: "var(--card-bg, #1e1e2b)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: "8px 10px",
                boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
                minWidth: 200,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {accountStatuses.map((status) => {
                  const st = String(status || '');
                  const checked = accountStatusFilter.includes(st);
                  return (
                    <label
                      key={st}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "6px 4px",
                        cursor: "pointer",
                        fontSize: 14,
                        color: "#e6e6e9",
                        textTransform: "capitalize",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? Array.from(new Set([...accountStatusFilter, st]))
                            : accountStatusFilter.filter(s => s !== st);
                          setAccountStatusFilter(next);
                        }}
                        style={{ width: 16, height: 16 }}
                      />
                      <span>{st}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  className="btn ghost small"
                  style={{ flex: 1 }}
                  onClick={() => setAccountStatusFilter(["live", "funded"])}
                >
                  Resetar padrão
                </button>

                <button
                  className="btn ghost small"
                  style={{ flex: 1 }}
                  onClick={() => setAccountStatusFilter(accountStatuses.slice())}
                >
                  Marcar todos
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DIREITA: Filtros de Range Temporal */}
      <div className="range" style={{ 
        display: 'flex', 
        gap: 8,
        flex: '0 0 auto',
        justifyContent: 'flex-end'
      }}>
        {['7','30','180','365','all'].map(r=>(
          <button key={r}
            className={'chip '+(timeRange===r?'active':'')}
            onClick={()=>setRange(r)}
          >
            {r==='7'?'7d':r==='30'?'30d':r==='180'?'180d':r==='365'?'1y':'All'}
          </button>
        ))}
      </div>
      {/* Calendário */}
<div style={{ position: 'relative', flex: '0 0 auto' }} ref={calendarRef}>
  <button
    className={`calendar-btn ${(dateFilter.start || dateFilter.end) ? 'active' : ''}`}
    onClick={(e) => { e.stopPropagation(); setShowCalendar(v => !v); }}
    title="Filtrar por data"
  >
    <svg className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  </button>

  {showCalendar && (
    <div className="calendar-dropdown">
      <div className="calendar-header">
        <h4 style={{ margin: 0, fontSize: 14, color: 'var(--text)' }}>Filtrar por Data</h4>
        {(dateFilter.start || dateFilter.end) && (
          <button
            className="btn ghost small"
            onClick={() => setDateFilter({ start: null, end: null })}
            style={{ fontSize: 11 }}
          >
            Limpar
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="calendar-label">Data Início</div>
        <input
          type="date"
          className="calendar-input"
          value={dateFilter.start || ''}
          onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))}
        />
      </div>

      <div>
        <div className="calendar-label">Data Fim</div>
        <input
          type="date"
          className="calendar-input"
          value={dateFilter.end || ''}
          onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))}
        />
      </div>

      <div className="calendar-actions">
        <button
          className="btn ghost small"
          style={{ flex: 1 }}
          onClick={() => {
            const today = new Date().toISOString().split('T')[0];
            const lastMonth = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
            setDateFilter({ start: lastMonth, end: today });
          }}
        >
          Último mês
        </button>
        <button
          className="btn primary small"
          style={{ flex: 1 }}
          onClick={() => setShowCalendar(false)}
        >
          Aplicar
        </button>
      </div>
    </div>
  )}
</div>
    </div>
  )
}

/* =========================================================
   2) Hook para filtrar contas/payouts e trazer firms
   ========================================================= */
function useFiltered(accountStatusFilter = ["live", "funded"], dateFilter = {}) {
  const [accounts, setAccounts] = useState([])
  const [payouts, setPayouts] = useState([])
  const [firms, setFirms] = useState([])
 
  useEffect(() => {
    const data = getAll()
    setAccounts(data.accounts || [])
    setPayouts(data.payouts || [])
    setFirms(data.firms || [])
  }, [])

  const { categories: selCats, timeRange, isMarkAllActive } = useFilters()

  const now = new Date()
  const start = timeRange === 'all'
    ? new Date('1970-01-01')
    : new Date(now.getTime() - parseInt(timeRange,10)*86400000)
  start.setHours(0,0,0,0)

  const allCats = Array.from(new Set(accounts.map(a => a.type).filter(Boolean)))
  const effectiveCats = (!selCats?.length || isMarkAllActive) ? allCats : selCats
  const catSet = new Set(effectiveCats)

  const accById   = Object.fromEntries(accounts.map(a => [a.id, a]))
  const accByName = Object.fromEntries(accounts.map(a => [a.name, a]))

  // ✅ APLICAR todos os filtros de uma vez (categoria, timeRange, status E data)
  const filteredAccounts = accounts.filter(a => {
    const matchesCategory = catSet.has(a.type);
    const matchesTimeRange = new Date(a.dateCreated) >= start;
    const matchesStatus = !accountStatusFilter || accountStatusFilter.length === 0 || 
                         accountStatusFilter.includes(a.status?.toLowerCase());
    
    let matchesDateFilter = true;
    if (dateFilter?.start || dateFilter?.end) {
      const startDate = dateFilter.start ? new Date(dateFilter.start) : new Date('1970-01-01');
      const endDate = dateFilter.end ? new Date(dateFilter.end) : new Date();
      endDate.setHours(23, 59, 59, 999);
      
      const createdDate = new Date(a.dateCreated);
      matchesDateFilter = createdDate >= startDate && createdDate <= endDate;
    }
    
    return matchesCategory && matchesTimeRange && matchesStatus && matchesDateFilter;
  });

  const payoutBelongs = (p) => {
    const d = new Date(p.dateCreated || p.date)
    if (isNaN(+d) || d < start) return false
    
    // Filtro de data do calendário
    if (dateFilter?.start || dateFilter?.end) {
      const startDate = dateFilter.start ? new Date(dateFilter.start) : new Date('1970-01-01');
      const endDate = dateFilter.end ? new Date(dateFilter.end) : new Date();
      endDate.setHours(23, 59, 59, 999);
      
      if (d < startDate || d > endDate) return false;
    }
    
    const direct = p.type || p.category
    if (direct && catSet.has(direct)) {
      return true;
    }
    
    const checkAccountStatus = (acc) => {
      if (!acc) return false;
      const matchesStatus = !accountStatusFilter || accountStatusFilter.length === 0 || 
                           accountStatusFilter.includes(acc.status?.toLowerCase());
      return catSet.has(acc.type) && matchesStatus;
    };
    
    if (Array.isArray(p.accountIds) && p.accountIds.some(id => checkAccountStatus(accById[id]))) return true;
    if (p.accountId && checkAccountStatus(accById[p.accountId])) return true;
    
    if (Array.isArray(p.accounts)) {
      return p.accounts.some(n => checkAccountStatus(accByName[n]));
    }
    
    if (p.accountName && checkAccountStatus(accByName[p.accountName])) return true;
    
    return false;
  }

  return {
    accounts: filteredAccounts,
    payouts: payouts.filter(payoutBelongs),
    allAccounts: accounts,
    firms,
    categorySet: catSet,
    timeRange
  }
}

/*========================================================= 3) Cards resumo ========================================================= */ 
function SummaryCards({ accountStatusFilter = [], dateFilter = {} }) {
  const { accounts, payouts, allAccounts } = useFiltered(accountStatusFilter, dateFilter)
  const { currency, rate } = useCurrency()

  const totalFunding = accounts.reduce((s, a) => s + (a.currentFunding || 0), 0)
  const totalNetPayouts = payouts.reduce((s, p) => s + (p.amountReceived || 0), 0)
  const roi = totalFunding > 0 ? (totalNetPayouts / totalFunding) : 0

  const fmt = (v) =>
    currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate)

  // ✅ Todos os status possíveis (com base no que realmente existe nas contas)
  const allPossibleStatuses = Array.from(new Set(allAccounts.map(a => a.status?.toLowerCase()).filter(Boolean)))

  // ✅ Nenhum status marcado = filtro vazio = mostrar 0 contas
  const noStatusSelected = accountStatusFilter.length === 0

  // ✅ Todos os status possíveis selecionados = "Todas as contas"
  const allSelected =
    accountStatusFilter.length > 0 &&
    accountStatusFilter.length === allPossibleStatuses.length &&
    allPossibleStatuses.every(s => accountStatusFilter.includes(s))

  return (
    <div className="grid cards">
      <div className="card accent1"><h3>💰 Payouts</h3><div className="stat">{fmt(totalNetPayouts)}</div></div>
      <div className="card accent2"><h3>🏦 Funding</h3><div className="stat">{fmt(totalFunding)}</div></div>
      <div className="card accent3"><h3>📈 %</h3><div className="stat">{(roi * 100).toFixed(2)}%</div></div>

      <div className="card accent4">
        <h3>🧮 Contas Ativas</h3>
        <div className="stat center">{noStatusSelected ? 0 : accounts.length}</div>

        <div className="muted" style={{ fontSize: 12, marginTop: 4, textAlign: 'center' }}>
          {noStatusSelected
            ? 'Nenhum status selecionado'
            : allSelected
              ? 'Todas as contas'
              : `Filtradas: ${accountStatusFilter.join(', ')}`}
        </div>
      </div>
    </div>
  )
}


function PatrimonioLine({ accountStatusFilter = ["live", "funded"], dateFilter = {} }){
  const { accounts, payouts, allAccounts } = useFiltered(accountStatusFilter, dateFilter)
  const { currency, rate } = useCurrency()
  const { categories: selected, timeRange } = useFilters()

  // util
  const cur  = (v)=> currency==='USD' ? v : v*rate
  const dStr = (d)=> new Date(d).toISOString().slice(0,10)

  // range do período (X-axis obedece ao filtro)
  const range = React.useMemo(()=>{
    const end = new Date()
    let start
    if (timeRange==='7')       start = new Date(end.getTime() - 6*86400000)
    else if (timeRange==='30') start = new Date(end.getTime() - 29*86400000)
    else if (timeRange==='180')start = new Date(end.getTime() - 179*86400000)
    else if (timeRange==='365')start = new Date(end.getTime() - 364*86400000)
    else {
      const min = allAccounts.length
        ? Math.min(...allAccounts.map(a=>+new Date(a.dateCreated)))
        : +end
      start = new Date(min)
    }
    start.setHours(0,0,0,0); end.setHours(23,59,59,999)
    return { start, end, startKey: dStr(start), endKey: dStr(end) }
  }, [allAccounts, timeRange])

  // categorias existentes
  const ALL_CATS = React.useMemo(
    ()=> Array.from(new Set(allAccounts.map(a=>a.type))),
    [allAccounts]
  )

  // "Total" quando nenhuma ou todas selecionadas
  const showTotalOnly = selected.length===0 || selected.length===ALL_CATS.length
  const activeCats    = showTotalOnly ? ALL_CATS : selected

  // pega cores direto do CSS .pill
  const [catColors, setCatColors] = React.useState({})
  React.useEffect(()=>{
    const cls = (c)=> c==='Forex'?'lavander':c==='Cripto'?'orange':c==='Futures'?'pink':c==='Personal'?'purple':'gray'
    const map = {}
    for (const c of ALL_CATS){
      const el = document.createElement('span')
      el.className = `pill ${cls(c)}`
      document.body.appendChild(el)
      map[c] = getComputedStyle(el).color
      document.body.removeChild(el)
    }
    setCatColors(map)
  }, [ALL_CATS])

  const colorFor = (k)=> k==='Total' ? '#34d399' : (catColors[k] || '#94a3b8')

  // ---------- EVENTOS (APENAS DIAS COM MUDANÇA) ----------
  // funding: evento no dia de criação da conta (soma currentFunding da conta)
  const fundingEvents = React.useMemo(()=>{
    const ev = new Map() // dateKey -> {cat -> delta}
    for (const a of accounts){
      if (!activeCats.includes(a.type)) continue
      const key = dStr(a.dateCreated)
      if (new Date(key) < range.start || new Date(key) > range.end) continue
      const m = ev.get(key) || {}
      m[a.type] = (m[a.type]||0) + (+a.currentFunding||0)
      ev.set(key, m)
    }
    return ev
  }, [accounts, activeCats, range])

  // payouts: para cada payout, soma amountReceived em TODAS as contas linkadas,
  // e credita na categoria de cada conta (duplicando quando várias contas compartilham o payout)
  const payoutEvents = React.useMemo(()=>{
    const ev = new Map() // dateKey -> {cat -> delta}
    for (const p of payouts){
      const key = dStr(p.dateCreated)
      if (new Date(key) < range.start || new Date(key) > range.end) continue
      const ids = p.accountIds || []
      if (!ids.length) continue
      let bucket = ev.get(key) || {}
      for (const id of ids){
        const acc = accounts.find(a=>a.id===id) || allAccounts.find(a=>a.id===id)
        if (!acc) continue
        if (!activeCats.includes(acc.type)) continue
        bucket[acc.type] = (bucket[acc.type]||0) + (+p.amountReceived||0)
      }
      ev.set(key, bucket)
    }
    return ev
  }, [payouts, accounts, allAccounts, activeCats, range])

  // ---------- BUILDER STEP (flat entre eventos) ----------
  function buildStepSeries(eventsMap){
    const dates = Array.from(eventsMap.keys()).sort()
    const cumByCat = Object.create(null)
    const rows = []

    // ponto inicial (início do range)
    if (showTotalOnly){
      rows.push({ date: range.startKey, Total: cur(0) })
    } else {
      const row = { date: range.startKey }
      for (const c of activeCats) row[c] = cur(0)
      rows.push(row)
    }

    for (const key of dates){
      const deltas = eventsMap.get(key) || {}
      // aplica deltas do dia
      for (const [cat,inc] of Object.entries(deltas)){
        cumByCat[cat] = (cumByCat[cat]||0) + inc
      }
      // adiciona ponto APÓS mudança (stepAfter)
      if (showTotalOnly){
        const total = Object.values(cumByCat).reduce((s,v)=>s+v,0)
        rows.push({ date: key, Total: cur(total) })
      } else {
        const row = { date: key }
        for (const c of activeCats) row[c] = cur(cumByCat[c] || 0)
        rows.push(row)
      }
    }

    // força último ponto no fim do range (mantém flat até o fim)
    if (rows.length===0 || rows[rows.length-1].date !== range.endKey){
      const last = rows[rows.length-1] || (showTotalOnly ? {Total:cur(0)} : Object.fromEntries(activeCats.map(c=>[c,cur(0)])))
      rows.push({ ...last, date: range.endKey })
    }
    return rows
  }

  const fundingData = React.useMemo(()=> buildStepSeries(fundingEvents), [fundingEvents, showTotalOnly, activeCats, currency, rate])
  const payoutData  = React.useMemo(()=> buildStepSeries(payoutEvents),  [payoutEvents,  showTotalOnly, activeCats, currency, rate])

  const keys = showTotalOnly ? ['Total'] : activeCats.slice()

  // ------- formatadores iguais ao resto do app -------
  const fmtTick = (v)=>
    timeRange==='all'
      ? new Date(v).toLocaleDateString('pt-BR',{month:'short', year:'2-digit'})
      : new Date(v).toLocaleDateString('pt-BR',{day:'2-digit', month:'short'})

  const fmtVal = (v)=>{
    if (v==null) return ''
    const abs = Math.abs(v)
    const sign = v<0 ? '-' : ''
    const sym = currency==='USD' ? '$' : ''
    return abs>=1000 ? `${sign}${sym}${(abs/1000).toFixed(0)}k` : `${sign}${sym}${abs.toFixed(0)}`
  }

  const Tip = ({active,payload,label})=>{
    if (!active || !payload?.length) return null
    return (
      <div style={{background:'#0f1218',border:'1px solid #2a3246',borderRadius:8,padding:'8px 12px'}}>
        <div style={{color:'#94a3b8',fontSize:12,marginBottom:4}}>
          {new Date(label).toLocaleDateString('pt-BR')}
        </div>
        {payload.map((p,i)=>(
          <div key={i} style={{color:p.color,fontWeight:600}}>
            {p.dataKey}: {fmtVal(p.value)}
          </div>
        ))}
      </div>
    )
  }

  const AxisXProps = { dataKey:'date', axisLine:false, tickLine:false, tick:{fill:'#94a3b8',fontSize:11}, tickFormatter:fmtTick }
  const AxisYProps = { axisLine:false, tickLine:false, tick:{fill:'#94a3b8',fontSize:11}, tickFormatter:fmtVal }

  const renderChart = (title, data) => (
    <div className="card" style={{ paddingBottom: 16, marginBottom: 20 }}>
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      <div style={{height:300}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 15, right: 15, left: 40, bottom: 25 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#374151" opacity={0.3} horizontal vertical={false}/>
            <XAxis {...AxisXProps} />
            <YAxis {...AxisYProps} />
            <Tooltip content={<Tip/>} />
            <Legend wrapperStyle={{ color:'#94a3b8', fontSize:12 }} />
            {keys.map(k=>(
            <Line
  key={k+title}
  type="monotone"              // agora linha fluida
  dataKey={k}
  stroke={colorFor(k)}
  strokeWidth={2.5}
  dot={(props) => {
    // só desenhar bolinha se for evento real
    const { cx, cy, payload } = props
    const isEvent =
      (title.includes("Funding")  && fundingEvents.has(payload.date)) ||
      (title.includes("Payouts") && payoutEvents.has(payload.date))
    if (!isEvent) return null
    return (
      <circle
        key={`${payload.date}-${payload.dataKey}`} 
        cx={cx}
        cy={cy}
        r={5}
        stroke="#0f1218"
        strokeWidth={2}
        fill={colorFor(k)}
      />
    )
  }}
  activeDot={{ r: 6, stroke: '#0f1218', strokeWidth: 2 }}
  name={k}
  isAnimationActive={false}
/>

            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  return (
    <>
      {renderChart('💸 Payouts acumulados ao longo do tempo', payoutData)}
      {renderChart('💰 Funding acumulado ao longo do tempo', fundingData)}
    </>
  )
}


function FundingPerAccount({ accountStatusFilter = ["live", "funded"], dateFilter = {} }) {
  const { accounts } = useFiltered(accountStatusFilter, dateFilter);
  const { currency, rate } = useCurrency();

  const [firms, setFirms] = React.useState([]);

  React.useEffect(() => {
    const data = getAll();
    setFirms(data.firms || []);
  }, []);

  // pega cor da empresa da conta
  const getFirmColor = React.useCallback((firmId) => {
    const f = firms.find((x) => x.id === firmId);
    return f?.color || "#6b7280"; // fallback cinza
  }, [firms]);

  // monta dados
  const data = accounts.map((a, index) => ({
    name: a.name,
    value: currency === "USD" ? a.currentFunding : a.currentFunding * rate,
    firmId: a.firmId || null,
  }));

  const formatValue = (value) => {
    if (Math.abs(value) >= 1000) {
      return `${currency === "USD" ? "$" : ""}${(value / 1000).toFixed(0)}k`;
    }
    return `${currency === "USD" ? "$" : ""}${value.toFixed(0)}`;
  };

  // Tooltip com cor da empresa
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const d = payload[0].payload;
    const borderColor = getFirmColor(d.firmId);

    return (
      <div
        style={{
          background: "#0f1218",
          border: `2px solid ${borderColor}`,
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          color: "#fff",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        <div style={{ color: borderColor, fontWeight: 700, fontSize: 16 }}>
          {formatValue(payload[0].value)}
        </div>
      </div>
    );
  };

  // barra usando a cor da empresa
  const CustomBar = (props) => {
    const { payload, ...rest } = props;
    if (!payload) return null;

    const color = getFirmColor(payload.firmId);

    return <rect {...rest} fill={color} rx={4} ry={4} />;
  };

  const getBarSize = () => {
    const c = data.length;
    if (c <= 3) return 80;
    if (c <= 5) return 60;
    if (c <= 10) return 40;
    if (c <= 20) return 25;
    return 15;
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: "16px" }}>📦 Funding por conta</h3>

      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 20, left: 0, bottom: 20 }}
            maxBarSize={getBarSize()}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="#374151"
              opacity={0.3}
              horizontal
              vertical={false}
            />

            <XAxis dataKey="name" hide type="category" />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={formatValue}
            />

            <Tooltip content={<CustomTooltip />} />

            <Bar dataKey="value" shape={<CustomBar />} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* legenda */}
      <div
        style={{
          marginTop: "12px",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          justifyContent: "center",
        }}
      >
        {data.map((acc, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "#94a3b8",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "2px",
                background: getFirmColor(acc.firmId),
              }}
            />

            <span style={{ fontWeight: "500" }}>{acc.name}</span>

            <span style={{ color: "#6b7280" }}>
              {formatValue(acc.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


function FundingPerCategory({ accountStatusFilter = ["live", "funded"], dateFilter = {} }){
  // ✅ Usar useFiltered em vez de getAll() manual
  const { accounts } = useFiltered(accountStatusFilter, dateFilter);
  const { currency, rate } = useCurrency();
  const [categoryColors, setCategoryColors] = useState({});

  // Pega cores do CSS
  useEffect(() => {
    const categories = ['Forex', 'Cripto', 'Futures', 'Personal'];
    const colors = {};
    categories.forEach(cat => {
      const className = cat === 'Forex' ? 'lavander'
                      : cat === 'Cripto' ? 'orange'
                      : cat === 'Futures' ? 'pink'
                      : cat === 'Personal' ? 'purple'
                      : 'gray';
      const temp = document.createElement('span');
      temp.className = `pill ${className}`;
      document.body.appendChild(temp);
      const bg = getComputedStyle(temp).color;
      document.body.removeChild(temp);
      colors[cat] = bg;
    });
    setCategoryColors(colors);
  }, []);

  const byCat = useMemo(() => {
    const calculated = {};
    for (const a of accounts){
      calculated[a.type] = (calculated[a.type] || 0) + (currency === 'USD' ? a.currentFunding : a.currentFunding * rate);
    }
    return calculated;
  }, [accounts, currency, rate]);

  const data = useMemo(() => {
    return Object.entries(byCat).map(([name, value]) => ({ name, value }));
  }, [byCat]);

  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Componente de Tooltip personalizado (agora aninhado)
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const valueFormatted = currency === 'USD'
        ? `$${dataPoint.value.toLocaleString()}`
        : `R$${dataPoint.value.toLocaleString()}`;
      const percentage = ((dataPoint.value / total) * 100).toFixed(1);
      const color = categoryColors[dataPoint.name] || 'gray';
      
      return (
        <div style={{
          background: '#0f1218',
          border: `1px solid ${color}`,
          color: '#e7eaf0',
          padding: '10px',
          borderRadius: '4px'
        }}>
          <p style={{ fontWeight: 'bold' }}>{dataPoint.name}</p>
          <p style={{ color: color }}>{`${valueFormatted} (${percentage}%)`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card">
      <h3>🧭 Funding por categoria</h3>
      <div style={{height:280}}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={100}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={categoryColors[entry.name] || 'gray'} />
              ))}
            </Pie>
            <Legend />
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela redesenhada com divs e flexbox */}
      <div style={{
        width:'100%',
        marginTop:'1rem',
        fontSize:'1rem'
      }}>
        {data.map((row) => {
          const valueFormatted = currency === 'USD'
            ? `$${row.value.toLocaleString()}`
            : `R$${row.value.toLocaleString()}`;
          const percentage = ((row.value / total) * 100).toFixed(1);

          return (
            <div key={row.name} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '16px 0',
              borderTop: '1px solid #2a3246',
              color: '#e7eaf0'
            }}>
              {/* Categoria */}
              <div style={{
                flexGrow: 1,
                display: 'flex',
                alignItems: 'center',
                fontWeight: 'bold'
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: categoryColors[row.name] || 'gray',
                  marginRight: '8px'
                }}></span>
                <span>{row.name}</span>
              </div>
              {/* Valor e porcentagem */}
              <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
                <div style={{ fontSize: '1rem' }}>{valueFormatted}</div>
                <div style={{ fontSize: '0.9rem', color: '#999', marginTop: '4px' }}>{percentage}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function GoalsDistributionChart() {
  const [goals, setGoals] = useState([])

  useEffect(() => {
    const data = getAllGoals({ includeArchived: true })
    const normalized = data.map(g => ({
      ...g,
      status:
        g.status === "in-progress" ? "inProgress" :
        g.status === "not-started" ? "notStarted" :
        g.status === "completed" ? "completed" :
        g.status === "archived" ? "archived" : g.status
    }))
    setGoals(normalized)
  }, [])

const stats = {
  total: goals.filter(g => !g.archived).length, // só metas ativas
  concluido: goals.filter(g => g.completed && !g.archived).length,
  emProgresso: goals.filter(g => !g.completed && !g.archived).length,
  arquivado: goals.filter(g => g.archived).length,
}


  const chartData = [
    { name: "Concluídos", value: stats.concluido },
    { name: "Em Progresso", value: stats.emProgresso },
    { name: "Arquivados", value: stats.arquivado },
  ]

  const colors = ["#10B981", "#8B5CF6", "#475569"]

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const { name, value } = payload[0]
      return (
        <div
          style={{
            backgroundColor: "#1c1f26",
            color: "#e7eaf0",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #8B5CF6",
            boxShadow: "0 0 10px rgba(139, 92, 246, 0.4)"
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>{name}</strong>: {value}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="card">
      <h3>🎯 Goals por Status</h3>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              outerRadius={100}
              innerRadius={50}
              // ⛔ removido label para tirar os “1” e “0”
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={colors[index]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: "1rem", fontSize: "1rem" }}>
        {chartData.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              borderTop: "1px solid #2a3246",
              color: "#e7eaf0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: colors[i],
                  marginRight: 8,
                }}
              />
              {row.name}
            </div>
            <div>{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentPayouts({ accountStatusFilter = ["live", "funded"], dateFilter = {} }) {
  const { payouts } = useFiltered(accountStatusFilter, dateFilter);
  const { currency, rate } = useCurrency();

  const fmt = (v) =>
    currency === 'USD'
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((v || 0) * rate);

  const rows = payouts
    .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
    .slice(0, 6);

  // formatar DD/MM/YYYY
  const fmtDate = (d) => {
    if (!d) return "--";
    const dt = new Date(d);
    return dt.toLocaleDateString("pt-BR");
  };

  const navigateToPayout = (id) => {
    window.location.href = `/payouts?id=${id}`;
  };

  return (
    <div className="card">
      <h3>🧾 Payouts recentes</h3>

      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Status</th>
            <th>Net</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => navigateToPayout(r.id)}
              style={{
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td>{fmtDate(r.dateCreated)}</td>

              {/* TYPE como pill */}
              <td>
                <span
                  className={
                    "pill " +
                    (r.type === "Forex"
                      ? "lavander"
                      : r.type === "Cripto"
                      ? "orange"
                      : r.type === "Futures"
                      ? "pink"
                      : r.type === "Personal"
                      ? "purple"
                      : "gray")
                  }
                >
                  {r.type || "--"}
                </span>
              </td>

              {/* STATUS existente */}
              <td>
                <span
                  className={
                    "pill " +
                    (r.status === "Completed"
                      ? "greenpayout"
                      : r.status === "Pending"
                      ? "yellowpayout"
                      : "gray")
                  }
                >
                  {r.status}
                </span>
              </td>

              {/* NET verde com + */}
              <td style={{ color: "#22c55e", fontWeight: 600 }}>
                +{fmt(r.amountReceived || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



function FundingPerFirmChart({ accountStatusFilter = ["live", "funded"], dateFilter = {} }) {
  const { accounts = [] } = useFiltered(accountStatusFilter, dateFilter) || {};
  const { currency = "USD", rate = 1 } = useCurrency() || {};

  const [firms, setFirms] = React.useState([]);

  React.useEffect(() => {
    const data = getAll();
    setFirms(data.firms || []);
  }, []);

  // pega cor da empresa
  const getFirmColor = React.useCallback(
    (firmId) => {
      const f = firms.find((x) => x.id === firmId);
      return f?.color || "#6b7280";
    },
    [firms]
  );

  const fmt = (v) => {
    if (currency === "USD")
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v || 0);

    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v || 0);
  };

  // monta os dados por empresa
  const data = React.useMemo(() => {
    return firms.map((f) => {
      const totalRaw = accounts
        .filter((a) => a.firmId === f.id)
        .reduce((s, a) => s + (a.currentFunding || 0), 0);

      const total = currency === "USD" ? totalRaw : totalRaw * rate;

      return {
        id: f.id,
        name: f.name,
        type: f.type || "",
        logo: f.logo,
        color: f.color,    // <- ESSENCIAL
        value: total,
      };
    });
  }, [firms, accounts, currency, rate]);

  // Tooltip usando firm.color
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const d = payload[0].payload;
    const borderColor = getFirmColor(d.id);

    return (
      <div
        style={{
          background: "#0f1218",
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
          color: "#fff",
          minWidth: 160,
        }}
      >
        {d.logo && (
          <img
            src={d.logo}
            alt={d.name}
            style={{
              width: 80,
              height: 24,
              objectFit: "contain",
              display: "block",
              marginBottom: 8,
            }}
          />
        )}

        <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
        <div style={{ color: borderColor, fontWeight: 700 }}>{fmt(d.value)}</div>
      </div>
    );
  };

  // barra usando cor da empresa
  const CustomBar = (props) => {
    const { payload, x, y, width, height } = props;
    if (!payload || width <= 0 || height <= 0) return null;

    const color = getFirmColor(payload.id);

    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        ry={6}
        fill={color}
      />
    );
  };

  const getBarSize = () => {
    const c = data.length;
    if (c <= 3) return 80;
    if (c <= 5) return 60;
    if (c <= 10) return 40;
    if (c <= 20) return 25;
    return 15;
  };

  return (
    <div className="card">
      <h3>💰 Fundings por Empresa</h3>

      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 16, left: 0, bottom: 20 }}
            maxBarSize={getBarSize()}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="#374151"
              opacity={0.25}
              horizontal
              vertical={false}
            />

            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(v) => {
                if (Math.abs(v) >= 1000)
                  return (currency === "USD" ? "$" : "R$") + Math.round(v / 1000) + "k";
                return (currency === "USD" ? "$" : "R$") + Math.round(v);
              }}
            />

            <Tooltip content={<CustomTooltip />} />

            <Bar dataKey="value" shape={<CustomBar />} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* legenda */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {data.map((d) => (
          <div
            key={d.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#94a3b8",
              minWidth: 140,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: getFirmColor(d.id),
              }}
            />

            {d.logo ? (
              <img
                src={d.logo}
                alt={d.name}
                style={{ width: 48, height: 18, objectFit: "contain" }}
              />
            ) : (
              <div style={{ width: 48, height: 18 }} />
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#fff", fontWeight: 600 }}>{d.name}</span>
              <span style={{ fontSize: 12, color: "#9aa4b2" }}>
                {fmt(d.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function PayoutsPerFirmChart({ accountStatusFilter = ["live", "funded"], dateFilter = {} }) {
  const { payouts = [], accounts = [] } = useFiltered(accountStatusFilter, dateFilter) || {};
  const { currency = "USD", rate = 1 } = useCurrency() || {};
  const [firms, setFirms] = React.useState([]);

  React.useEffect(() => {
    const data = getAll();
    setFirms(data.firms || []);
  }, []);

  // PEGAR cor da empresa pelo firmId
  const getFirmColor = React.useCallback(
    (firmId) => {
      const f = firms.find((x) => x.id === firmId);
      return f?.color || "#6b7280"; // fallback cinza
    },
    [firms]
  );

  // formatador
  const fmt = (v) => {
    if (currency === "USD")
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
  };

  // soma payouts para cada firm
  const data = React.useMemo(() => {
    const totals = {};

    payouts.forEach((p) => {
      const amountRaw = p.amountReceived ?? p.amount ?? 0;
      const amount = currency === "USD" ? amountRaw : amountRaw * rate;

      // 1 — payout já vem com firmId direto
      if (p.firmId) {
        totals[p.firmId] = (totals[p.firmId] || 0) + amount;
        return;
      }

      // 2 — lista de accountIds
      if (Array.isArray(p.accountIds)) {
        p.accountIds.forEach((accId) => {
          const acc = accounts.find((a) => a.id === accId);
          if (acc?.firmId) {
            totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
          }
        });
        return;
      }

      // 3 — accountId único
      if (p.accountId) {
        const acc = accounts.find((a) => a.id === p.accountId);
        if (acc?.firmId) {
          totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
        }
        return;
      }

      // 4 — payouts antigos por nome
      if (Array.isArray(p.accounts)) {
        p.accounts.forEach((name) => {
          const acc = accounts.find((a) => a.name === name);
          if (acc?.firmId) {
            totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
          }
        });
        return;
      }

      if (p.accountName) {
        const acc = accounts.find((a) => a.name === p.accountName);
        if (acc?.firmId) {
          totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
        }
      }
    });

    return firms.map((f) => ({
      id: f.id,
      name: f.name,
      logo: f.logo,
      type: f.type,
      color: f.color, // adicionar para facilitar
      value: totals[f.id] || 0,
    }));
  }, [payouts, accounts, firms, currency, rate]);

  // Tooltip com cor da firm
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;

    const borderColor = getFirmColor(d.id);

    return (
      <div
        style={{
          background: "#0f1218",
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
          color: "#fff",
          minWidth: 160,
        }}
      >
        {d.logo && (
          <img
            src={d.logo}
            alt={d.name}
            style={{
              width: 80,
              height: 24,
              objectFit: "contain",
              display: "block",
              marginBottom: 8,
            }}
          />
        )}

        <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>
          ({d.type})
        </div>
        <div style={{ color: borderColor, fontWeight: 700 }}>{fmt(d.value)}</div>
      </div>
    );
  };

  // Barra usa firm.color
  const CustomBar = (props) => {
    const { x, y, width, height, payload } = props;
    if (width <= 0 || height <= 0) return null;

    const color = getFirmColor(payload?.id);

    return <rect x={x} y={y} width={width} height={height} rx={6} ry={6} fill={color} />;
  };

  const getBarSize = () => {
    const c = data.length;
    if (c <= 3) return 80;
    if (c <= 5) return 60;
    if (c <= 10) return 40;
    if (c <= 20) return 25;
    return 15;
  };

  return (
    <div className="card">
      <h3>🧾 Payouts por Empresa</h3>

      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 16, left: 0, bottom: 20 }}
            maxBarSize={getBarSize()}
          >
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="#374151"
              opacity={0.25}
              horizontal
              vertical={false}
            />

            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(v) => {
                if (Math.abs(v) >= 1000)
                  return (currency === "USD" ? "$" : "R$") + Math.round(v / 1000) + "k";
                return (currency === "USD" ? "$" : "R$") + Math.round(v);
              }}
            />

            <Tooltip content={<CustomTooltip />} />

            <Bar dataKey="value" shape={<CustomBar />} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* legenda */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {data.map((d) => (
          <div
            key={d.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#94a3b8",
              minWidth: 140,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: getFirmColor(d.id),
              }}
            />

            {d.logo ? (
              <img
                src={d.logo}
                alt={d.name}
                style={{ width: 48, height: 18, objectFit: "contain" }}
              />
            ) : (
              <div style={{ width: 48, height: 18 }} />
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#fff", fontWeight: 600 }}>{d.name}</span>
              <span style={{ fontSize: 12, color: "#9aa4b2" }}>
                ({d.type}) • {fmt(d.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AccountsOverview({ accountStatusFilter = ["live", "funded"], dateFilter = {} }) {
  const { accounts } = useFiltered(accountStatusFilter, dateFilter);

  const [firms, setFirms] = React.useState([]);

  React.useEffect(() => {
    const data = getAll();
    setFirms(data.firms || []);
  }, []);

  const recentAccounts = accounts
    .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
    .slice(0, 5);

  const getFirm = (firmId) => firms.find((f) => f.id === firmId) || null;

  return (
    <div className="card">
      <h3>🗂️ Visão geral das contas</h3>

      <table>
        <thead>
          <tr>
            <th>Conta</th>
            <th>Categoria</th>
            <th>Firm</th> {/* ← NOVA COLUNA */}
            <th>Status</th>
            <th>Funding</th>
          </tr>
        </thead>

        <tbody>
          {recentAccounts.map((a) => {
            const firm = getFirm(a.firmId);

            return (
              <tr key={a.id}>
                <td>{a.name}</td>

                {/* Categoria */}
                <td>
                  <span
                    className={
                      "pill " +
                      (a.type === "Forex"
                        ? "lavander"
                        : a.type === "Cripto"
                        ? "orange"
                        : a.type === "Futures"
                        ? "pink"
                        : a.type === "Personal"
                        ? "purple"
                        : "gray")
                    }
                  >
                    {a.type}
                  </span>
                </td>

                {/* NOVA COLUNA: FIRM */}
                <td>
                  {firm ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {/* Logo pequena */}
                      {firm.logo ? (
                        <img
                          src={firm.logo}
                          alt={firm.name}
                          style={{
                            width: 22,
                            height: 14,
                            objectFit: "contain",
                            opacity: 0.9,
                          }}
                        />
                      ) : null}

                      {/* Nome pequeno */}
                      <span style={{ fontSize: 12, color: "#cbd5e1" }}>
                        {firm.name}
                      </span>
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>

                {/* Status */}
                <td>
                  <span
                    className={
                      "pill " +
                      (a.status === "Live"
                        ? "green"
                        : a.status === "Funded"
                        ? "blue"
                        : a.status === "Challenge"
                        ? "yellow"
                        : a.status === "Challenge Concluido"
                        ? "yellow"
                        : "gray")
                    }
                  >
                    {a.status}
                  </span>
                </td>

                <td>${a.currentFunding.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


/* =========================================================
   5) Página principal
   ========================================================= */
export default function Dashboard(){
  // ✅ PASSO 1: Estados para filtro de status de conta
  const [accountStatusFilter, setAccountStatusFilter] = useState(["live", "funded"]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
// Logo após accountStatusFilter
const [dateFilter, setDateFilter] = useState({ start: null, end: null });
const [showCalendar, setShowCalendar] = useState(false);
const calendarRef = useRef(null);
  // Pega todas as contas para montar os filtros
  const [allAccountsData, setAllAccountsData] = useState([]);
  
  useEffect(() => {
    const data = getAll();
    setAllAccountsData(data.accounts || []);
  }, []);

  const cats = useMemo(
    () => Array.from(new Set(allAccountsData.map(a => a.type))),
    [allAccountsData]
  );

  // ✅ Obter todos os status disponíveis (SEM type annotation)
  const accountStatuses = useMemo(() => {
    const all = (allAccountsData || [])
      .map((a) => a.status?.toLowerCase() || "")
      .filter((s) => !!s); // remove o ": s is string"
    return Array.from(new Set(all));
  }, [allAccountsData]);

  // ✅ Fechar dropdown ao clicar fora
  useEffect(() => {
    function onDocClick(e) { // remove type annotation
      if (!statusDropdownRef.current) return;
      if (!statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    }
    if (statusDropdownOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [statusDropdownOpen]);
// Logo após o useEffect do statusDropdown
useEffect(() => {
  function onDocClick(e) {
    if (!calendarRef.current) return;
    if (!calendarRef.current.contains(e.target)) {
      setShowCalendar(false);
    }
  }
  if (showCalendar) document.addEventListener('mousedown', onDocClick);
  return () => document.removeEventListener('mousedown', onDocClick);
}, [showCalendar]);
  return (
    <div className="dashboard-page"  style={{ gap: 20 }}>
      <FiltersBar 
        categories={cats} 
        accountStatusFilter={accountStatusFilter}
        setAccountStatusFilter={setAccountStatusFilter}
        statusDropdownOpen={statusDropdownOpen}
        setStatusDropdownOpen={setStatusDropdownOpen}
        statusDropdownRef={statusDropdownRef}
        accountStatuses={accountStatuses}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        showCalendar={showCalendar}
        setShowCalendar={setShowCalendar}
        calendarRef={calendarRef}
      />
      <SummaryCards accountStatusFilter={accountStatusFilter} dateFilter={dateFilter} />
      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:16}}>
        <PatrimonioLine accountStatusFilter={accountStatusFilter} dateFilter={dateFilter} />
        <FundingPerCategory accountStatusFilter={accountStatusFilter} dateFilter={dateFilter} />
        <GoalsDistributionChart dateFilter={dateFilter} />
      </div>
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
        <FundingPerAccount accountStatusFilter={accountStatusFilter} dateFilter={dateFilter}/>
        <RecentPayouts accountStatusFilter={accountStatusFilter} dateFilter={dateFilter} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FundingPerFirmChart accountStatusFilter={accountStatusFilter} dateFilter={dateFilter}/>
        <PayoutsPerFirmChart accountStatusFilter={accountStatusFilter} dateFilter={dateFilter}/>
      </div>
      <AccountsOverview accountStatusFilter={accountStatusFilter} dateFilter={dateFilter} />
    </div>
  )
}
