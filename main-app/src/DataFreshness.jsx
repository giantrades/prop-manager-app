// Data Freshness — status e "idade" dos dados que o app depende: Quantower,
// preços (cache do priceService), câmbio USD/BRL e última sync de trades.
// Somente leitura; nenhum cálculo financeiro.
import React, { useEffect, useState } from 'react';
import { usePlatform, useFinance } from '@apps/state';
import { getFxUSD } from '@apps/lib/db';
import { Activity, RefreshCw, Wifi, WifiOff, LineChart, DollarSign, Clock } from 'lucide-react';

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

function StatusRow({ icon, label, value, sub, ok }) {
  return (
    <div className="df-row">
      <span className={`df-ico ${ok == null ? '' : ok ? 'df-ok' : 'df-bad'}`}>{icon}</span>
      <span className="df-name">{label}</span>
      <span className="df-val">{value}</span>
      {sub && <span className={`df-sub ${sub.stale ? 'df-bad' : ''}`}>{sub.text}</span>}
    </div>
  );
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

  return (
    <div className="dash-section df-root">
      <div className="dash-title">
        <span><Activity size={14} /> Frescor dos dados</span>
        <button className="cmd-refresh" onClick={() => refreshStatuses()} aria-label="Atualizar status">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      <StatusRow
        icon={q ? (quantOk ? <Wifi size={14} /> : <WifiOff size={14} />) : <WifiOff size={14} />}
        label="Quantower / bridge"
        value={q ? (quantOk ? 'conectado' : 'offline') : 'não configurado'}
        ok={q ? quantOk : null}
      />
      <StatusRow
        icon={<Clock size={14} />}
        label="Última sync de trades"
        value={lastSync ? 'ok' : '—'}
        sub={syncAge}
        ok={lastSync ? !syncAge.stale : null}
      />
      <StatusRow
        icon={<LineChart size={14} />}
        label="Preços"
        value={prices ? `${prices.count} cotação(ões)` : '—'}
        sub={priceAge}
        ok={prices && prices.count > 0 ? !priceAge.stale : null}
      />
      <StatusRow
        icon={<DollarSign size={14} />}
        label="USD/BRL"
        value={fx ? `R$ ${fx.rate.toFixed(4)}` : '—'}
        sub={fxAge}
        ok={fx ? !fxAge.stale : null}
      />

      {anyStale && (
        <div className="df-warn" role="status">
          Há dado possivelmente desatualizado. Atualize o bridge/preços em Sistema.
        </div>
      )}
    </div>
  );
}

const DF_CSS = `
.df-root { gap: 4px; }
.df-row { display: grid; grid-template-columns: 26px 1fr auto auto; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.df-row:last-of-type { border-bottom: none; }
.df-ico { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(255,255,255,0.04); color: var(--muted, #a1a7b3); }
.df-ico.df-ok { color: var(--green, #2ecc71); }
.df-ico.df-bad { color: var(--red, #e74c3c); }
.df-name { font-weight: 600; }
.df-val { font-variant-numeric: tabular-nums; color: var(--muted, #a1a7b3); }
.df-sub { font-size: 11px; color: var(--muted, #a1a7b3); min-width: 64px; text-align: right; }
.df-sub.df-bad { color: var(--yellow, #e1b12c); }
.df-warn { margin-top: 6px; font-size: 12px; color: var(--yellow, #e1b12c); }
`;
if (typeof document !== 'undefined' && !document.getElementById('df-styles')) {
  const style = document.createElement('style');
  style.id = 'df-styles';
  style.textContent = DF_CSS;
  document.head.appendChild(style);
}
