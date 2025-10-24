import React, { useState, useMemo } from 'react';
import { useJournal } from "@apps/journal-state";
import { useCurrency } from "@apps/state";
import StrategyForm from '../Components/StrategyForm';
import { Strategy } from '../types/strategy';
import { Trade } from '../types/trade';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type ConsistencyItem = {
  title: string;
  percent: number | null;
  trueCount: number;
  totalCount: number;
};

type Consistency = {
  byItem: Record<string, ConsistencyItem>;
  overall: number | null;
};
function computeConsistency(checklist: { id: string; title: string }[] = [], linkedTrades: Trade[] = []): Consistency {
  const byItem: Record<string, ConsistencyItem> = {};
  checklist.forEach(it => {
    byItem[it.id] = { title: it.title, percent: null, trueCount: 0, totalCount: 0 };
  });

  for (const t of linkedTrades) {
    if (!t.checklistResults) continue;
    Object.keys(t.checklistResults).forEach(cid => {
      if (!byItem[cid]) byItem[cid] = { title: cid, percent: null, trueCount: 0, totalCount: 0 };
      byItem[cid].totalCount += 1;
      if (t.checklistResults[cid]) byItem[cid].trueCount += 1;
    });
  }

  const percents: number[] = [];
  Object.values(byItem).forEach(it => {
    if (it.totalCount === 0) {
      it.percent = null;
    } else {
      it.percent = (it.trueCount / it.totalCount) * 100;
      percents.push(it.percent);
    }
  });

  const overall = percents.length === 0 ? null : percents.reduce((s, v) => s + v, 0) / percents.length;
  return { byItem, overall };
}

const categoryColors = {
  Futures: 'pink',
  Forex: 'lavander',
  Cripto: 'orange',
  Personal: 'purple',
  Todos:'white',
  gray: 'gray'
};

const pillClass = {
  'Futures': 'pink',
  'Forex': 'lavander',
  'Cripto': 'orange',
  'Personal': 'purple',
  'Todos': 'white'
};


export const StrategyCard = ({ strategy, trades = [], onEdit, onDelete, currency, rate }) => {
  const linkedTrades = trades.filter(t => t.strategyId === strategy.id);

  const fmt = (v: number) => {
    const value = currency === 'USD' ? (v || 0) : (v || 0) * rate;
    const locale = currency === 'USD' ? 'en-US' : 'pt-BR';
    const curr = currency === 'USD' ? 'USD' : 'BRL';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: curr }).format(value);
  };

  const stats = useMemo(() => {
    const totalPnLNet = linkedTrades.reduce((s, t) => s + (Number(t.result_net) || 0), 0);
    const totalR = linkedTrades.reduce((s, t) => s + (Number(t.result_R) || 0), 0);
    const validTrades = linkedTrades.filter(t => !t.isBreakeven);
    const wins = validTrades.filter(t => (Number(t.result_net) || 0) > 0).length;
    const breakevens = linkedTrades.filter(t => t.isBreakeven).length;
    const avgR = validTrades.length ? totalR / validTrades.length : 0;
    const winrate = validTrades.length ? Math.round((wins / validTrades.length) * 1000) / 10 : 0;

    return {
      linkedTradesCount: linkedTrades.length,
      totalPnLNet,
      avgR,
      winrate,
      breakevens
    };
  }, [JSON.stringify(linkedTrades)]);

const equitySeries = useMemo(() => {
  const safeNumber = (n: any) =>
    typeof n === "number" && !isNaN(n) ? n : Number(n) || 0;

  const sorted = (linkedTrades || [])
    .filter((t: any) => t && t.date)
    .sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

  let cumulativePnL = 0;
  const result = sorted.map((t: any) => {
    cumulativePnL += safeNumber(t.result_net);
    return {
      entry_datetime: new Date(t.date).toLocaleDateString("pt-BR"),
      pnl: +cumulativePnL.toFixed(2),
    };
  });

  return result;
}, [linkedTrades]);


  const tagsArray: string[] = Array.isArray(strategy.tags)
    ? strategy.tags
    : Object.keys(strategy.tags || {});

  const catColor = categoryColors[strategy.category] || categoryColors.gray;

const consistency = computeConsistency(strategy.checklist || [], linkedTrades);

  return (
    <div
      className="card strategy-card border-soft"
      style={{
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        borderTop: `3px solid var(--${pillClass[strategy.category] || 'gray'})`,
        background: 'linear-gradient(180deg, rgba(12,18,28,0.8), rgba(6,8,12,0.8))'
      }}
    >
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h4 style={{ margin: 0 }}>{strategy.name}</h4>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>Mercado:
            <span className={`pill ${pillClass[strategy.category]}`}>{strategy.category}</span>

          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost small" onClick={() => onEdit(strategy)}>Editar</button>
          <button className="btn ghost negative small" onClick={() => onDelete(strategy.id)}>Deletar</button>
        </div>
      </div>

      {/* Corpo */}
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flex: 1 }}>
        {/* Bloco 1 - Stats */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: stats.totalPnLNet >= 0 ? '#10B981' : '#F87171' }}>
            {fmt(stats.totalPnLNet)}
          </div>
          <div className="muted">P&L Total</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div>
              <div className="muted text-xs">Trades</div>
              <div>{stats.linkedTradesCount}</div>
            </div>
            <div>
              <div className="muted text-xs">Winrate</div>
              <div>{stats.winrate}%</div>
            </div>
            <div>
              <div className="muted text-xs">Avg R</div>
              <div>{stats.avgR.toFixed(2)} R</div>
            </div>
            <div>
              <div className="muted text-xs">Break-evens</div>
              <div>{stats.breakevens}</div>
            </div>
          </div>
        </div>

{/* Block 2 - descrição + tags + alvo/stop (em coluna) */}
<div style={{ flex: 1, display:'flex', flexDirection:'column', gap:12 }}> 
{/* Checklist - percentuais compactos lado a lado */}
{Object.values(consistency.byItem || {}).length > 0 && (
  <div style={{ marginBottom: 10 }}>
    <div className="muted text-xs" style={{ marginBottom: 4 }}>Checklist:</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {Object.values(consistency.byItem).map((it, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 13,
            color: '#ddd',
            gap: 40,
          }}
        >
          <span>{it.title}</span>
          <span style={{ color: '#9CA3AF' }}>
            {it.percent === null ? '—' : `${Math.round(it.percent)}%`}
          </span>
        </div>
      ))}
    </div>
  </div>
)}


  <div>
    <div style={{ fontWeight:600 }} className="muted">Descrição</div>
    <div style={{ marginTop:6, lineHeight:1.4 }}>{strategy.description || '—'}</div>
  </div>

  {/* tags abaixo da descrição */}
  <div>
    <div className="muted text-xs" style={{ marginBottom: 6 }}>Tags</div>
    <div className="flex flex-wrap gap-2">
      { (Array.isArray(strategy.tags) ? strategy.tags : Object.keys(strategy.tags || {})).map((tag:string, i:number) => (
        <span key={i} className={`pill ${pillClass[strategy.category] || 'gray'}`}>
          {tag}
        </span>
      )) }
    </div>
  </div>

  {/* alvo / stop mais abaixo */}
  <div style={{ marginTop: 'auto' }}>
    <div className="muted text-xs">R:R</div>
    <div style={{ display:'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
      <div>
        <div className="muted text-xs">Alvo</div>
        <div style={{ fontWeight:700 }}>{strategy.defaultRisk?.profitTargetR ? `${strategy.defaultRisk.profitTargetR}R` : '—'}</div>
      </div>
      <div>
        <div className="muted text-xs">Stop</div>
        <div style={{ fontWeight:700 }}>{strategy.defaultRisk?.stopLossR ? `${strategy.defaultRisk.stopLossR}R` : '—'}</div>
      </div>
    </div>
  </div>
</div>


        {/* Bloco 3 - Gráfico */}
<div style={{ flex: 1, minWidth: 220 }}>
  {equitySeries.length > 0 ? (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={equitySeries}
        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
      >
        <defs>
          <linearGradient id={`gradStrategy-${strategy.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* 🟢 Grid leve igual ao da Dashboard */}
        <CartesianGrid
          stroke="#1f2937"
          strokeDasharray="3 3"
          opacity={0.3}
        />

        {/* Eixo X / Y no mesmo estilo limpo */}
        <XAxis
          dataKey="entry_datetime"
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => fmt(v)}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />

        {/* Tooltip customizado, coerção numérica */}
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload?.length) {
              const p = payload[0];
              const val = Number(p.value ?? 0);
              return (
                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "6px 10px",
                    color: "#f3f4f6",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {p.payload.entry_datetime}
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: val >= 0 ? "#4ade80" : "#ef4444",
                    }}
                  >
                    {fmt(val)}
                  </div>
                </div>
              );
            }
            return null;
          }}
        />

        {/* Área principal */}
        <Area
          type="monotoneX"
          dataKey="pnl"
          stroke="#22c55e"
          strokeWidth={2}
          fill={`url(#gradStrategy-${strategy.id})`}
          dot={false}
          isAnimationActive
          animationDuration={700}
        />
      </AreaChart>
    </ResponsiveContainer>
  ) : (
    <div
      className="muted"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
      }}
    >
      Sem dados
    </div>
  )}
</div>
      </div>
    </div>
  );
};

// --- Página ---
export default function StrategiesPage() {
  const { strategies, trades, removeStrategy } = useJournal() as any;
  const { currency, rate } = useCurrency();
  const [open, setOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  const handleEdit = (s: Strategy) => {
    setEditingStrategy(s);
    setOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta estratégia?')) {
      removeStrategy(id);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">📈 Gerenciamento de Estratégias</h2>
        <button className="btn" onClick={() => { setEditingStrategy(null); setOpen(true); }}>
          ➕ Nova Estratégia
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(strategies as Strategy[] || []).map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            trades={trades as Trade[] || []}
            onEdit={handleEdit}
            onDelete={handleDelete}
            currency={currency}
            rate={rate}
          />
        ))}
      </div>

      {(!strategies || strategies.length === 0) && (
        <div className="card p-6 text-center text-muted">
          Nenhuma estratégia cadastrada.
        </div>
      )}

      {open && (
        <StrategyForm
          key={editingStrategy?.id || 'new'}
          editing={editingStrategy}
          onClose={() => { setOpen(false); setEditingStrategy(null); }}
        />
      )}
    </div>
  );
}
