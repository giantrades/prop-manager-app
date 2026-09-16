// Data Freshness — status e "idade" dos dados que o app depende: Quantower,
// preços (cache do priceService), câmbio USD/BRL e última sync de trades.
// Somente leitura; nenhum cálculo financeiro.
import React, { useEffect, useState } from 'react';
import { usePlatform, useFinance } from '@apps/state';
import { getFxUSD } from '@apps/lib/db';
import { RefreshCw, Wifi, WifiOff, LineChart, DollarSign, Clock } from 'lucide-react';

function age(iso) {
  if (!iso) return { text: '—', stale: true };
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { text: '—', stale: true };
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return { text: 'agora', stale: false };
  if (s < 3600) return { text: `há ${Math.round(s / 60)} min`, stale: s > 900 };
  if (s < 86400) return { text: `há ${Math.round(s / 3600)} h`, stale: s > 21600 };
  return { text: `há ${Math.round(s / 86400)} d`, stale: true };
}

export default function DataFreshness() {
  const { statuses, lastSync, refreshStatuses } = usePlatform();
  const finance = useFinance();
  const [fx, setFx] = useState(null);
  const [prices, setPrices] = useState(null);

  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const f = await getFxUSD(finance.ds);
        if (alive) setFx(f);
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [finance]);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('pricecache-v1') || '[]');
      const arr = Array.isArray(raw) ? raw : [];
      const newest = arr.map((q) => q.at).filter(Boolean).sort().pop() ?? null;
      setPrices({ count: arr.length, at: newest });
    } catch {
      setPrices({ count: 0, at: null });
    }
  }, []);

  const q = statuses.find((s) => s.platformId === 'quantower');
  const quantOk = !!q?.online;
  const syncAge = age(lastSync);
  const fxAge = age(fx?.at);
  const priceAge = age(prices?.at);

  const anyStale = (!quantOk && !!q) || syncAge.stale || fxAge.stale || priceAge.stale;

  const Item = ({ icon, label, value, sub, ok }) => (
    <span className="df-item">
      <span className={`df-ico ${ok == null ? '' : ok ? 'df-ok' : 'df-bad'}`}>{icon}</span>
      <span className="df-lbl">{label}</span>
      <span className="df-val">{value}</span>
      {sub && <span className={`df-sub ${sub.stale ? 'df-bad' : ''}`}>{sub.text}</span>}
    </span>
  );

  return (
    <div className="df-inline" role="status" aria-label="Frescor dos dados">
      <Item icon={q ? (quantOk ? <Wifi size={13} /> : <WifiOff size={13} />) : <WifiOff size={13} />} label="Bridge" value={q ? (quantOk ? 'conectado' : 'offline') : 'n/a'} ok={q ? quantOk : null} />
      <Item icon={<Clock size={13} />} label="Sync" value={lastSync ? 'ok' : '—'} sub={syncAge} ok={lastSync ? !syncAge.stale : null} />
      <Item icon={<LineChart size={13} />} label="Preços" value={prices ? `${prices.count}` : '—'} sub={priceAge} ok={prices && prices.count > 0 ? !priceAge.stale : null} />
      <Item icon={<DollarSign size={13} />} label="USD/BRL" value={fx ? `R$ ${fx.rate.toFixed(3)}` : '—'} sub={fxAge} ok={fx ? !fxAge.stale : null} />
      {anyStale && <span className="df-warn" title="Há dado possivelmente desatualizado">⚠</span>}
      <button className="df-refresh" onClick={() => refreshStatuses()} aria-label="Atualizar status"><RefreshCw size={12} /></button>
    </div>
  );
}

const DF_CSS = `
.df-inline { display: inline-flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 8px 14px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); font-size: 12px; }
.df-item { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.df-lbl { color: var(--muted, #a1a7b3); text-transform: uppercase; font-size: 10px; letter-spacing: 0.4px; }
.df-ico { display: inline-flex; align-items: center; color: var(--muted, #a1a7b3); }
.df-ico.df-ok { color: var(--green, #2ecc71); }
.df-ico.df-bad { color: var(--red, #e74c3c); }
.df-val { font-weight: 700; font-variant-numeric: tabular-nums; }
.df-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.df-sub.df-bad { color: var(--yellow, #e1b12c); }
.df-warn { color: var(--yellow, #e1b12c); font-weight: 800; }
.df-refresh { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); cursor: pointer; }
`;
if (typeof document !== 'undefined' && !document.getElementById('df-styles')) {
  const style = document.createElement('style');
  style.id = 'df-styles';
  style.textContent = DF_CSS;
  document.head.appendChild(style);
}
