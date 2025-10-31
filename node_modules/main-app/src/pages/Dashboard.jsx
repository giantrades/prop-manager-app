import React, { useEffect, useMemo, useState } from 'react'
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
function FiltersBar({ categories }) {
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
      map[cat] = getComputedStyle(span).backgroundColor
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
    <div className="filters sticky-filters">
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

      <div className="range">
        {['7','30','180','365','all'].map(r=>(
          <button key={r}
            className={'chip '+(timeRange===r?'active':'')}
            onClick={()=>setRange(r)}
          >
            {r==='7'?'7d':r==='30'?'30d':r==='180'?'180d':r==='365'?'1y':'All'}
          </button>
        ))}
      </div>
    </div>
  )
}

/* =========================================================
   2) Hook para filtrar contas/payouts e trazer firms
   ========================================================= */
function useFiltered() {
 const [accounts, setAccounts] = useState([])
  const [payouts, setPayouts] = useState([])
  const [firms, setFirms] = useState ([])
 
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

  const filteredAccounts = accounts.filter(a =>
    catSet.has(a.type) && new Date(a.dateCreated) >= start
  )

  const payoutBelongs = (p) => {
    const d = new Date(p.dateCreated || p.date)
    if (isNaN(+d) || d < start) return false
    const direct = p.type || p.category
    if (direct && catSet.has(direct)) return true
    if (Array.isArray(p.accountIds) && p.accountIds.some(id => catSet.has(accById[id]?.type))) return true
    if (p.accountId && catSet.has(accById[p.accountId]?.type)) return true
    if (Array.isArray(p.accounts) && p.accounts.some(n => catSet.has(accByName[n]?.type))) return true
    if (p.accountName && catSet.has(accByName[p.accountName]?.type)) return true
    return false
  }

  return {
    accounts: filteredAccounts,
    payouts: payouts.filter(payoutBelongs),
    allAccounts: accounts,
    firms,                // <-- agora disponível p/ FundingPerFirmChart e PayoutsPerFirmChart
    categorySet: catSet,
    timeRange
  }
}

/*========================================================= 3) Cards resumo ========================================================= */ 
function SummaryCards(){ 
  const { accounts, payouts, allAccounts, categorySet } = useFiltered() 
  const { currency, rate } = useCurrency() 
  const totalFunding = accounts.reduce((s,a)=> s + (a.currentFunding||0), 0) 
  const totalNetPayouts = payouts.reduce((s,p)=> s + (p.amountReceived||0), 0) 
  const roi = totalFunding>0 ? (totalNetPayouts / totalFunding) : 0 
  const relevantAccounts = allAccounts.filter(a=> categorySet.has(a.type)) 
  const activeCount = relevantAccounts.filter(a=> ['Funded','Challenge','Challenge Concluido','Live'].includes(a.status)).length 
  const standbyCount = relevantAccounts.filter(a=> a.status==='Standby').length 
  const fmt = (v)=> currency==='USD' ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0) : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)*rate) 
  return ( 
  <div className="grid cards"> 
  <div className="card accent1"><h3>💰 Payouts</h3><div className="stat">{fmt(totalNetPayouts)}</div></div> 
  <div className="card accent2"><h3>🏦 Funding</h3><div className="stat">{fmt(totalFunding)}</div></div> 
  <div className="card accent3"><h3>📈  %</h3><div className="stat">{(roi*100).toFixed(2)}%</div></div> 
  <div className="card accent4"> <h3>🧮 Contas</h3> <div style={{display:'flex',justifyContent:'center',gap:40}}> <div><div className="thin">Ativas</div><div className="stat center">{activeCount}</div></div> <div style={{width:1,background:'#ccc'}}/> <div><div className="thin">Standby</div><div className="stat center">{standbyCount}</div></div> </div> </div> </div> ) }
/* =========================================================
   4) (Gráficos e outros subcomponentes) – mantidos iguais,
       apenas com cores/estilo já modernizado no seu snippet
   ========================================================= */
// -- PatrimonioLine, FundingPerAccount, FundingPerCategory,
//    RecentPayouts, AccountsOverview
// (Cole exatamente os mesmos que você já tinha – não houve
//  mudança de lógica, apenas de estilo no seu passo 7.)

function PatrimonioLine(){
  const { accounts, payouts, allAccounts } = useFiltered()
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
      map[c] = getComputedStyle(el).backgroundColor
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


function FundingPerAccount(){
  const { accounts } = useFiltered()
  const { currency, rate } = useCurrency()
  
  const data = accounts.map((a, index) => ({ 
    name: a.name, 
    value: (currency === 'USD' ? a.currentFunding : a.currentFunding * rate),
    index: index,
    type: a.type
  }))

  // Get background-color from your actual CSS classes (.pill.lavander, etc.)
  const getTypeColor = (type) => {
    // Map account types to your exact CSS class names
    const cssClass = type === 'Forex' ? 'lavander'     // .pill.lavander
                   : type === 'Cripto' ? 'orange'      // .pill.orange
                   : type === 'Futures' ? 'pink'       // .pill.pink
                   : type === 'Personal' ? 'purple'    // .pill.purple
                   : 'gray';                           // .pill.gray
    
    // Create temporary element with your actual CSS classes
    const tempDiv = document.createElement('div');
    tempDiv.className = `pill ${cssClass}`;
    document.body.appendChild(tempDiv);
    const computedBgColor = window.getComputedStyle(tempDiv).backgroundColor;
    document.body.removeChild(tempDiv);
    
    if (computedBgColor && computedBgColor !== 'rgba(0, 0, 0, 0)' && computedBgColor !== 'transparent') {
      return computedBgColor;
    }
    
    // Fallback colors (shouldn't be needed if CSS is loaded)
    return type === 'Forex' ? '#5684a3'      // Your lavander color
         : type === 'Cripto' ? '#ffa500'     // Orange
         : type === 'Futures' ? '#ffc0cb'    // Pink  
         : type === 'Personal' ? '#800080'   // Purple
         : '#808080';                        // Gray
  };

  // Get darker version by reducing opacity or darkening the base color
  const getDarkerTypeColor = (type) => {
    const baseColor = getTypeColor(type);
    
    // If we got an RGB color, convert it to a darker version
    if (baseColor.startsWith('rgb')) {
      const matches = baseColor.match(/\d+/g);
      if (matches && matches.length >= 3) {
        const r = Math.floor(parseInt(matches[0]) * 0.8);
        const g = Math.floor(parseInt(matches[1]) * 0.8);
        const b = Math.floor(parseInt(matches[2]) * 0.8);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    
    // Fallback darker colors
    return type === 'Forex' ? '#456a85'
         : type === 'Cripto' ? '#cc8400'
         : type === 'Futures' ? '#cc9aa2'
         : type === 'Personal' ? '#660066'
         : '#666666';
  };

  // Format value for display
  const formatValue = (value) => {
    if (Math.abs(value) >= 1000) {
      return `${currency === 'USD' ? '$' : ''}${(value / 1000).toFixed(0)}k`;
    }
    return `${currency === 'USD' ? '$' : ''}${value.toFixed(0)}`;
  };

  // Custom tooltip with account type color border
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const accountData = payload[0].payload;
      const borderColor = getTypeColor(accountData.type);
      
      return (
        <div style={{
          background: '#0f1218',
          border: `2px solid ${borderColor}`,
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <p style={{ color: '#e7eaf0', fontSize: '14px', fontWeight: '600', margin: '0 0 4px 0' }}>
            {label}
          </p>
          <p style={{ color: '#94a3b8', fontSize: '11px', margin: '0 0 6px 0' }}>
            ({accountData.type})
          </p>
          <p style={{ color: borderColor, fontSize: '16px', fontWeight: '700', margin: 0 }}>
            {formatValue(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom bar shape with individual coloring
  const CustomBar = (props) => {
    const { payload, index, dataKey, tooltipPayload, tooltipPosition, ...rest } = props;
    if (!payload) return null;
    
    const accountType = payload.type;
    const color = getTypeColor(accountType);
    
    return (
      <rect 
        {...rest} 
        fill={color}
        rx={4} 
        ry={4}
      />
    );
  };

  // Calculate bar width based on number of accounts
  const getBarSize = () => {
    const count = data.length;
    if (count <= 3) return 80;
    if (count <= 5) return 60;
    if (count <= 10) return 40;
    if (count <= 20) return 25;
    return 15;
  };

  return (
    <div className="card">
      <h3 style={{ marginBottom: '16px' }}>📦 Funding por conta</h3>
      <div style={{height:240}}>
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
              horizontal={true}
              vertical={false}
            />
            
            <XAxis 
              dataKey="name" 
              hide 
              type="category"
            />
            
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{fill:'#94a3b8', fontSize: 11}}
              tickFormatter={formatValue}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            <Bar 
              dataKey="value" 
              shape={<CustomBar />}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Account indicators below the chart */}
      <div style={{ 
        marginTop: '12px', 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: '8px',
        justifyContent: 'center'
      }}>
        {data.map((account, index) => (
          <div 
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#94a3b8'
            }}
          >
            <div 
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                background: getTypeColor(account.type)
              }}
            />
            <span style={{ fontWeight: '500' }}>
              {account.name}
            </span>
            <span style={{ color: '#6b7280', fontSize: '10px' }}>
              ({account.type})
            </span>
            <span style={{ color: '#6b7280' }}>
              {formatValue(account.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FundingPerCategory(){
  const [accounts, setAccounts] = useState([])
   useEffect(() => {
   const data = getAll()
   setAccounts(data.accounts || [])
   }, [])
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
      const bg = getComputedStyle(temp).backgroundColor;
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
          border: `1px solid ${color}`, // Borda com a cor da categoria
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

function RecentPayouts(){
  const { payouts } = useFiltered()
  const { currency, rate } = useCurrency()
  const fmt = (v)=> currency==='USD'
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0)
    : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)*rate)
  const rows = payouts.sort((a,b)=> new Date(b.dateCreated) - new Date(a.dateCreated)).slice(0,6);
  return (
    <div className="card">
      <h3>🧾 Payouts recentes</h3>
      <table>
        <thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th>Net</th></tr></thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r.id}>
              <td>{r.dateCreated}</td>
              <td>{r.type}</td>
              <td><span className={'pill '+(r.status==='Completed'?'greenpayout':r.status==='Pending'?'yellowpayout':'gray')}>{r.status}</span></td>
              <td>{fmt(r.amountReceived)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FundingPerFirmChart() {
  const { accounts = [] } = useFiltered() || {};
  const { currency = 'USD', rate = 1 } = useCurrency() || {};
  const [firms, setFirms] = useState ([])
 
   useEffect(() => {
   const data = getAll()
   setFirms(data.firms || [])
   }, [])

  // === cores DENTRO do componente (pega from CSS .pill.<class>) ===
  const getTypeColor = React.useCallback((type) => {
    const cls =
      type === 'Forex'   ? 'lavander' :
      type === 'Cripto'  ? 'orange'   :
      type === 'Futures' ? 'pink'     :
      type === 'Personal'? 'purple'   :
                          'gray';
    const span = document.createElement('span');
    span.className = `pill ${cls}`;
    document.body.appendChild(span);
    const c = getComputedStyle(span).backgroundColor || '#888';
    document.body.removeChild(span);
    return c;
  }, []);
  // =============================================================

  // formatador de valores (recebe valor já convertido conforme currency)
  const fmt = (v) => {
    if (currency === 'USD')
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  };

  // monta os dados: soma currentFunding das contas que pertencem à firm
  const data = React.useMemo(() => {
    return firms.map(f => {
      const totalRaw = accounts
        .filter(a => a.firmId === f.id)
        .reduce((s, a) => s + (a.currentFunding || 0), 0);
      const total = currency === 'USD' ? totalRaw : totalRaw * rate;
      return {
        id: f.id,
        name: f.name,
        logo: f.logo,
        type: f.type || '',
        value: total
      };
    });
  }, [firms, accounts, currency, rate]);

  // Tooltip customizado (borda colorida pela categoria)
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const borderColor = getTypeColor(d.type);
    return (
      <div style={{
        background: '#0f1218',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        color: '#fff',
        minWidth: 160
      }}>
        {d.logo && <img src={d.logo} alt={d.name} style={{width:80,height:24,objectFit:'contain',display:'block',marginBottom:8}} />}
        <div style={{fontWeight:700, marginBottom:4}}>{d.name}</div>
        <div style={{color:'#94a3b8', fontSize:12, marginBottom:8}}>({d.type})</div>
        <div style={{color:borderColor, fontWeight:700}}>{fmt(d.value)}</div>
      </div>
    );
  };

  // Shape customizado: use apenas os props seguros para evitar warnings
  const CustomBar = (props) => {
    const { x, y, width, height, payload, tooltipPayload, dataKey, ...rest } = props;
    const color = getTypeColor(payload?.type);
    if (width <= 0 || height <= 0) return null;
    return <rect x={x} y={y} width={width} height={height} rx={6} ry={6} fill={color} />;
  };

  // adaptar tamanho das barras
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
          <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 20 }} maxBarSize={getBarSize()}>
            <CartesianGrid strokeDasharray="2 4" stroke="#374151" opacity={0.25} horizontal vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v)=> {
              // formatter que apresenta $50k / R$50k de forma compacta
              if (Math.abs(v) >= 1000) return (currency === 'USD' ? '$' : 'R$') + Math.round(v/1000) + 'k';
              return (currency === 'USD' ? '$' : 'R$') + Math.round(v);
            }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" shape={<CustomBar />} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* legenda customizada (logo + nome + tipo + valor) */}
      <div style={{
        marginTop: 12,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {data.map(d => (
          <div key={d.id || d.name} style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', minWidth:140 }}>
            <div style={{ width:12, height:12, borderRadius:2, background: getTypeColor(d.type) }} />
            {d.logo
              ? <img src={d.logo} alt={d.name} style={{ width:48, height:18, objectFit:'contain' }} />
              : <div style={{ width:48, height:18 }} />
            }
            <div style={{ display:'flex', flexDirection:'column' }}>
              <span style={{ color:'#fff', fontWeight:600 }}>{d.name}</span>
              <span style={{ fontSize:12, color:'#9aa4b2' }}>({d.type}) • {fmt(d.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayoutsPerFirmChart() {
  const { payouts = [], accounts = [] } = useFiltered() || {};
  const { currency = 'USD', rate = 1 } = useCurrency() || {};
  const [firms, setFirms] = useState ([])
   useEffect(() => {
   const data = getAll()
   setFirms(data.firms || [])
   }, [])

  // === cores DENTRO do componente ===
  const getTypeColor = React.useCallback((type) => {
    const cls =
      type === 'Forex'   ? 'lavander' :
      type === 'Cripto'  ? 'orange'   :
      type === 'Futures' ? 'pink'     :
      type === 'Personal'? 'purple'   :
                          'gray';
    const span = document.createElement('span');
    span.className = `pill ${cls}`;
    document.body.appendChild(span);
    const c = getComputedStyle(span).backgroundColor || '#888';
    document.body.removeChild(span);
    return c;
  }, []);
  // =================================================

  const fmt = (v) => {
    if (currency === 'USD')
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  };

  // soma payouts por firm através das contas associadas (robusto)
  const data = React.useMemo(() => {
    const totals = {}; // firmId => total (em currency já convertida)
    payouts.forEach(p => {
      const amountRaw = (p.amountReceived ?? p.amount ?? 0); // prefer amountReceived como usado na lista
      const amount = currency === 'USD' ? amountRaw : amountRaw * rate;

      // se payout tem firmId direto, some nele
      if (p.firmId) {
        totals[p.firmId] = (totals[p.firmId] || 0) + amount;
        return;
      }

      // se tem accountIds (array) some para cada conta -> firm
      if (Array.isArray(p.accountIds) && p.accountIds.length) {
        p.accountIds.forEach(accId => {
          const acc = accounts.find(a => a.id === accId);
          if (!acc) return;
          if (!acc.firmId) return;
          totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
        });
        return;
      }

      // se tem accountId individual
      if (p.accountId) {
        const acc = accounts.find(a => a.id === p.accountId);
        if (acc && acc.firmId) totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
        return;
      }

      // se tem accounts por nome (string array) ou accountName
      if (Array.isArray(p.accounts) && p.accounts.length) {
        p.accounts.forEach(name => {
          const acc = accounts.find(a => a.name === name);
          if (!acc || !acc.firmId) return;
          totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
        });
        return;
      }
      if (p.accountName) {
        const acc = accounts.find(a => a.name === p.accountName);
        if (acc && acc.firmId) totals[acc.firmId] = (totals[acc.firmId] || 0) + amount;
      }
    });

    // construir array de firms (mantendo ordem das firms)
    return firms.map(f => ({
      id: f.id,
      name: f.name,
      logo: f.logo,
      type: f.type || '',
      value: totals[f.id] || 0
    }));
  }, [payouts, accounts, firms, currency, rate]);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const borderColor = getTypeColor(d.type);
    return (
      <div style={{
        background: '#0f1218',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        color: '#fff',
        minWidth: 160
      }}>
        {d.logo && <img src={d.logo} alt={d.name} style={{width:80,height:24,objectFit:'contain',display:'block',marginBottom:8}} />}
        <div style={{fontWeight:700, marginBottom:4}}>{d.name}</div>
        <div style={{color:'#94a3b8', fontSize:12, marginBottom:8}}>({d.type})</div>
        <div style={{color:borderColor, fontWeight:700}}>{fmt(d.value)}</div>
      </div>
    );
  };

  const CustomBar = (props) => {
    const { x, y, width, height, payload } = props;
    const color = getTypeColor(payload?.type);
    if (width <= 0 || height <= 0) return null;
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
          <BarChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 20 }} maxBarSize={getBarSize()}>
            <CartesianGrid strokeDasharray="2 4" stroke="#374151" opacity={0.25} horizontal vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v)=>{
              if (Math.abs(v) >= 1000) return (currency === 'USD' ? '$' : 'R$') + Math.round(v/1000) + 'k';
              return (currency === 'USD' ? '$' : 'R$') + Math.round(v);
            }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" shape={<CustomBar />} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{
        marginTop: 12,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        {data.map(d => (
          <div key={d.id || d.name} style={{ display:'flex', alignItems:'center', gap:8, color:'#94a3b8', minWidth:140 }}>
            <div style={{ width:12, height:12, borderRadius:2, background: getTypeColor(d.type) }} />
            {d.logo
              ? <img src={d.logo} alt={d.name} style={{ width:48, height:18, objectFit:'contain' }} />
              : <div style={{ width:48, height:18 }} />
            }
            <div style={{ display:'flex', flexDirection:'column' }}>
              <span style={{ color:'#fff', fontWeight:600 }}>{d.name}</span>
              <span style={{ fontSize:12, color:'#9aa4b2' }}>({d.type}) • {fmt(d.value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function AccountsOverview(){
  const { accounts } = useFiltered()
  
  const recentAccounts = accounts
    .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))
    .slice(0, 5)
  
  return (
    <div className="card">
      <h3>🗂️ Visão geral das contas</h3>
      <table>
        <thead><tr><th>Conta</th><th>Categoria</th><th>Status</th><th>Funding</th></tr></thead>
        <tbody>
          {recentAccounts.map(a=>(
            <tr key={a.id}>
              <td>{a.name}</td>
              <td><span className={'pill ' +(a.type=== 'Forex' ? 'lavander':a.type === 'Cripto' ? 'orange': a.type === 'Futures' ? 'pink': a.type === 'Personal' ? 'purple' : 'gray')}>{a.type}</span></td>
              <td><span className={'pill '+(a.status==='Live'?'green':a.status==='Funded'?'blue':a.status==='Challenge'?'yellow':a.status==='Challenge Concluido'?'yellow':'gray')}>{a.status}</span></td>
              <td>${a.currentFunding.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* =========================================================
   5) Página principal
   ========================================================= */
export default function Dashboard(){
  const { allAccounts } = useFiltered()
  const cats = useMemo(
    () => Array.from(new Set(allAccounts.map(a => a.type))),
    [allAccounts]
  )

  return (
    <div className="grid" style={{gap:20}}>
      <FiltersBar categories={cats}/>
      <SummaryCards/>
      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:16}}>
        <PatrimonioLine/>
        <FundingPerCategory/>
        <GoalsDistributionChart />
      </div>
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
        <FundingPerAccount/>
        <RecentPayouts/>
      </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FundingPerFirmChart />
        <PayoutsPerFirmChart />
      </div>

      <AccountsOverview/>
    </div>
  )
}
