import React, { useEffect, useMemo, useState } from 'react'
import { useData } from '../state/DashboardDataContext.jsx'
import { useCurrency } from '../state/CurrencyContext.jsx'
import { useFilters } from '../state/FiltersContext.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid } from 'recharts'

const CAT_COLORS = ['#7c5cff','#2ecc71','#3498db','#e1b12c','#e74c3c','#9b59b6']

const Chips = ({items, active, onToggle})=> (
  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
    {items.map((c,i)=>(
      <button key={c} className={'chip '+(active.includes(c)?'active':'')} onClick={()=>onToggle(c)}>{c}</button>
    ))}
  </div>
)


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

  const [catColors, setCatColors] = React.useState({})

  React.useEffect(() => {
    const map={}
    const list = ['Forex','Cripto','Futures','Personal', ...categories.filter(c=>!['Forex','Cripto','Futures','Personal'].includes(c))]
    for (const cat of list){
      const cls =
        cat==='Forex'   ? 'lavander' :
        cat==='Cripto'  ? 'orange'   :
        cat==='Futures' ? 'pink'     :
        cat==='Personal'? 'purple'   : 'gray'
      const temp = document.createElement('span')
      temp.className = `pill ${cls}`
      document.body.appendChild(temp)
      map[cat] = getComputedStyle(temp).backgroundColor
      document.body.removeChild(temp)
    }
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
          const isActive = sel.includes(item)
          return (
            <button
              key={item}
              className={`chip ${isActive?'active':''}`}
              style={chipStyle(item, isActive)}
              onClick={()=>toggleCategory(item)}
            >
              {isActive && <span style={{
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



function useFiltered(){
  const { accounts, payouts } = useData()
  const { categories: selCats, timeRange, isMarkAllActive } = useFilters()

  // início do range temporal
  const now = new Date()
  const start = timeRange === 'all'
    ? new Date('1970-01-01')
    : new Date(now.getTime() - parseInt(timeRange,10) * 86400000)
  start.setHours(0,0,0,0)

  // categorias efetivas (se nada selecionado ou "marcar todas", usa todas as presentes)
  const allCats = Array.from(new Set(accounts.map(a => a.type).filter(Boolean)))
  const effectiveCats = (!selCats?.length || isMarkAllActive) ? allCats : selCats
  const catSet = new Set(effectiveCats)

  // índices auxiliares
  const accById   = Object.fromEntries(accounts.map(a => [a.id, a]))
  const accByName = Object.fromEntries(accounts.map(a => [a.name, a]))

  // contas filtradas
  const filteredAccounts = accounts.filter(a =>
    catSet.has(a.type) && new Date(a.dateCreated) >= start
  )

  // payout pertence às categorias selecionadas?
  const payoutBelongs = (p) => {
    const d = new Date(p.dateCreated || p.date)
    if (isNaN(+d) || d < start) return false

    // 1) categoria direta no payout (se existir)
    const direct = p.type || p.category
    if (direct && catSet.has(direct)) return true

    // 2) accountIds (array ou único)
    if (Array.isArray(p.accountIds) && p.accountIds.some(id => catSet.has(accById[id]?.type))) return true
    if (p.accountId && catSet.has(accById[p.accountId]?.type)) return true

    // 3) por nome (se for esse seu modelo em alguns lançamentos)
    if (Array.isArray(p.accounts) && p.accounts.some(n => catSet.has(accByName[n]?.type))) return true
    if (p.accountName && catSet.has(accByName[p.accountName]?.type)) return true

    return false
  }

  const filteredPayouts = payouts.filter(payoutBelongs)

  return {
    accounts: filteredAccounts,
    payouts: filteredPayouts,
    allAccounts: accounts,
    categorySet: catSet,
    timeRange
  }
}


function SummaryCards(){
  const { accounts, payouts, allAccounts, categorySet } = useFiltered()
  const { currency, rate } = useCurrency()

  const totalFunding = accounts.reduce((s,a)=> s + (a.currentFunding||0), 0)
  const totalNetPayouts = payouts.reduce((s,p)=> s + (p.amountReceived||0), 0)
  const roi = totalFunding>0 ? (totalNetPayouts / totalFunding) : 0

  // Card 4: ignora o filtro de tempo (mas respeita categorias)
  const relevantAccounts = allAccounts.filter(a=> categorySet.has(a.type))
  const activeCount = relevantAccounts.filter(a=> ['Funded','Challenge','Live'].includes(a.status)).length
  const standbyCount = relevantAccounts.filter(a=> a.status==='Standby').length

  const fmt = (v)=> currency==='USD'
    ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0)
    : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((v||0)*rate)

  return (
    <div className="grid cards">
      <div className="card accent1">
        <h3>💰 Payouts (Net)</h3>
        <div className="stat">{fmt(totalNetPayouts)}</div>
      </div>
      <div className="card accent2">
        <h3>🏦 Funding (Atual)</h3>
        <div className="stat">{fmt(totalFunding)}</div>
      </div>
      <div className="card accent3">
        <h3>📈 Return on investment (ROI %)</h3>
        <div className="stat">{(roi*100).toFixed(2)}%</div>
        <div className="muted">Net / Funding atual</div>
      </div>
      <div className="card accent4">
  <h3>🧮 Contas</h3>
  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '40px'}}>
    <div style={{textAlign: 'center'}}>
      <div className="thin">Ativas</div>
      <div className="stat center">{activeCount}</div>
    </div>
    <div style={{width: '1px', backgroundColor: '#ccc', height: '60px'}}></div>
    <div style={{textAlign: 'center'}}>
      <div className="thin">Standby</div>
      <div className="stat center">{standbyCount}</div>
    </div>
  </div>
</div>
    </div>
  )
}


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
    const { payload, index, ...rest } = props;
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
  const { accounts } = useData(); // Assumindo que useData() é o gancho correto
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
              <td><span className={'pill '+(a.status==='Live'?'green':a.status==='Funded'?'blue':a.status==='Challenge'?'yellow':'gray')}>{a.status}</span></td>
              <td>${a.currentFunding.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Dashboard(){
    const { accounts, allAccounts } = useFiltered()
  const cats = useMemo(
    () => Array.from(new Set(allAccounts.map(a => a.type))),
    [allAccounts]
  )
  return (
    <div className="grid" style={{gap:20}}>
      <FiltersBar categories={cats} />
      <SummaryCards />
      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:16}}>
        <PatrimonioLine />
        <FundingPerCategory />
      </div>
      <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap:16}}>
        <FundingPerAccount />
        <RecentPayouts />
      </div>
      <AccountsOverview />
    </div>
  )
}
