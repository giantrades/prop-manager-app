// LIVE — motor do módulo Live (Setupboard, Intraday breadth, Alerts). READ-ONLY.
// Não faz gamma de dealer (exige feed de opções) — sem inventar dado.
// Reusa `fetchMarketQuotes`/`MarketQuote` de `marketData.ts`.
//
// Fonte: DOCS/10_MODULES/market/00-spec.md.

import type { MarketQuote } from './marketData';
import { SECTORS } from './marketData';

export interface LiveDef {
  symbol: string;
  label: string;
}

/** Universo do Setupboard (diário, range 1mo p/ SMA20). */
export const LIVE_SYMBOLS: string[] = [
  'SPY', 'QQQ', 'IWM', 'DIA',
  ...SECTORS.map((s) => s.etf),
  '^VIX', '^VIX3M', 'TLT', 'IEF', 'HYG', 'LQD', '^TNX', '^IRX',
  'DX-Y.NYB', 'GC=F', 'CL=F', 'BTC-USD', 'ETH-USD',
];

/** Universo do Intraday breadth (barras de 5 min). */
export const LIVE_BREADTH: LiveDef[] = [
  ...SECTORS.map((s) => ({ symbol: s.etf, label: s.short })),
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'IWM', label: 'Russell 2000' },
  { symbol: 'RSP', label: 'S&P equal-weight' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
  { symbol: 'ETH-USD', label: 'Ethereum' },
  { symbol: 'GC=F', label: 'Gold' },
  { symbol: 'CL=F', label: 'WTI crude' },
  { symbol: 'DX-Y.NYB', label: 'Dollar index' },
  { symbol: '^VIX', label: 'VIX' },
];

export const LIVE_BREADTH_SYMBOLS: string[] = LIVE_BREADTH.map((d) => d.symbol);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function get(quotes: Map<string, MarketQuote>, symbol: string): MarketQuote | undefined {
  return quotes.get(symbol.toUpperCase());
}

/** Média móvel simples dos últimos `n` closes da série. */
export function sma(series: Array<[number, number]> | undefined, n: number): number | null {
  if (!series) return null;
  const closes = series.map((p) => p[1]).filter((c) => Number.isFinite(c));
  if (closes.length < n) return null;
  const slice = closes.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / n;
}

/** Variação da sessão (1º → último close da série intraday). */
export function sessionChangePct(series: Array<[number, number]> | undefined): number | null {
  if (!series) return null;
  const closes = series.map((p) => p[1]).filter((c) => Number.isFinite(c));
  if (closes.length < 2) return null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  return first ? (last - first) / first : null;
}

function toneOf(delta: number | null, pos: number, neg: number): SignalTone {
  if (delta == null) return 'neu';
  if (delta >= pos) return 'pos';
  if (delta <= neg) return 'neg';
  return 'neu';
}

// ---------------------------------------------------------------------------
// Setupboard
// ---------------------------------------------------------------------------

export type SignalTone = 'pos' | 'neg' | 'neu';

export interface LiveSignal {
  id: string;
  label: string;
  reading: string;
  detail: string;
  tone: SignalTone;
  weight: number;
}

export interface Setupboard {
  score: number; // -1 (risk-off) .. +1 (risk-on)
  label: 'RISK-ON' | 'NEUTRAL' | 'RISK-OFF';
  signals: LiveSignal[];
  breadthPct: number | null; // fração de setores em alta
  vix: number | null;
  spyChange: number | null; // 1d
}

/** Painel de "setup": trend, breadth, vol, crédito, juros, dólar → risco agregado. */
export function buildSetupboard(quotes: Map<string, MarketQuote>): Setupboard {
  const spy = get(quotes, 'SPY');
  const spySma = sma(spy?.series, 20);
  const trendDiff = spy && spySma ? spy.price / spySma - 1 : null;

  const sectorQuotes = SECTORS.map((s) => get(quotes, s.etf)).filter((q): q is MarketQuote => !!q && q.changePct != null);
  const sectorUp = sectorQuotes.filter((q) => (q.changePct ?? 0) > 0).length;
  const breadthPct = sectorQuotes.length > 0 ? sectorUp / sectorQuotes.length : null;

  const vix = get(quotes, '^VIX');
  const vix3m = get(quotes, '^VIX3M');
  const vixRatio = vix && vix3m && vix3m.price ? vix.price / vix3m.price : null;

  const hyg = get(quotes, 'HYG');
  const ief = get(quotes, 'IEF');
  const credit = hyg?.changePct != null && ief?.changePct != null ? hyg.changePct - ief.changePct : null;

  const tnx = get(quotes, '^TNX');
  const dxy = get(quotes, 'DX-Y.NYB');

  const signals: LiveSignal[] = [
    {
      id: 'trend',
      label: 'Tendência',
      reading: trendDiff != null ? `SPY ${(trendDiff * 100).toFixed(1)}% vs SMA20` : 'sem série',
      detail: trendDiff == null ? 'dados insuficientes' : trendDiff >= 0 ? 'acima da média de 20 dias' : 'abaixo da média de 20 dias',
      tone: toneOf(trendDiff, 0.005, -0.005),
      weight: 1.5,
    },
    {
      id: 'breadth',
      label: 'Breadth',
      reading: breadthPct != null ? `${(breadthPct * 100).toFixed(0)}% setores em alta` : '—',
      detail: `${sectorUp}/${sectorQuotes.length} setores positivos`,
      tone: toneOf(breadthPct != null ? breadthPct - 0.5 : null, 0.1, -0.1),
      weight: 1.5,
    },
    {
      id: 'vol',
      label: 'Volatilidade',
      reading: vix ? `VIX ${vix.price.toFixed(1)}` : '—',
      detail: vixRatio != null ? (vixRatio < 1 ? 'contango (normal)' : 'backwardation (estresse)') : 'sem VIX3M',
      tone: vix == null ? 'neu' : vix.price < 18 ? 'pos' : vix.price > 24 ? 'neg' : 'neu',
      weight: 1,
    },
    {
      id: 'credit',
      label: 'Crédito',
      reading: credit != null ? `${(credit * 100).toFixed(2)}% HY vs Treasury` : '—',
      detail: 'HYG − IEF no dia',
      tone: toneOf(credit, 0.002, -0.002),
      weight: 1,
    },
    {
      id: 'rates',
      label: 'Juros',
      reading: tnx ? `10y ${tnx.price.toFixed(2)}% (${tnx.changePct != null ? `${tnx.changePct >= 0 ? '+' : ''}${(tnx.changePct * 100).toFixed(1)}%` : '—'})` : '—',
      detail: 'juro em alta = vento contra risco',
      tone: tnx == null || tnx.changePct == null ? 'neu' : tnx.changePct > 0.01 ? 'neg' : tnx.changePct < -0.01 ? 'pos' : 'neu',
      weight: 0.75,
    },
    {
      id: 'dollar',
      label: 'Dólar',
      reading: dxy ? `DXY ${dxy.changePct != null ? `${dxy.changePct >= 0 ? '+' : ''}${(dxy.changePct * 100).toFixed(2)}%` : '—'}` : '—',
      detail: 'dólar forte = vento contra risco',
      tone: dxy == null || dxy.changePct == null ? 'neu' : dxy.changePct > 0.005 ? 'neg' : dxy.changePct < -0.005 ? 'pos' : 'neu',
      weight: 0.75,
    },
  ];

  const totalWeight = signals.reduce((a, s) => a + s.weight, 0);
  const raw = signals.reduce((a, s) => a + (s.tone === 'pos' ? 1 : s.tone === 'neg' ? -1 : 0) * s.weight, 0);
  const score = totalWeight > 0 ? raw / totalWeight : 0;
  const label: Setupboard['label'] = score >= 0.2 ? 'RISK-ON' : score <= -0.2 ? 'RISK-OFF' : 'NEUTRAL';

  return { score, label, signals, breadthPct, vix: vix?.price ?? null, spyChange: spy?.changePct ?? null };
}

// ---------------------------------------------------------------------------
// Intraday breadth
// ---------------------------------------------------------------------------

export interface IntradayRow {
  symbol: string;
  label: string;
  changePct: number | null;
}

export interface IntradayBreadth {
  total: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  pctUp: number; // fração
  avgChangePct: number | null;
  rows: IntradayRow[];
}

/** Breadth intraday: variação do open da sessão (barras 5m) por instrumento. */
export function buildIntradayBreadth(
  quotes: Map<string, MarketQuote>,
  defs: LiveDef[] = LIVE_BREADTH,
): IntradayBreadth {
  const rows: IntradayRow[] = defs.map((d) => {
    const q = get(quotes, d.symbol);
    const chg = q ? sessionChangePct(q.series) : null;
    return { symbol: d.symbol, label: d.label, changePct: chg };
  });

  const valid = rows.filter((r) => r.changePct != null) as (IntradayRow & { changePct: number })[];
  const advancers = valid.filter((r) => r.changePct > 0.0005).length;
  const decliners = valid.filter((r) => r.changePct < -0.0005).length;
  const unchanged = valid.length - advancers - decliners;
  const pctUp = valid.length > 0 ? advancers / valid.length : 0;
  const avgChangePct = valid.length > 0 ? valid.reduce((a, r) => a + r.changePct, 0) / valid.length : null;

  return {
    total: valid.length,
    advancers,
    decliners,
    unchanged,
    pctUp,
    avgChangePct,
    rows: [...rows].sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity)),
  };
}

// ---------------------------------------------------------------------------
// Alerts (derivados de regras objetivas — sem inventar notícia)
// ---------------------------------------------------------------------------

export type AlertSeverity = 'high' | 'med' | 'low';

export interface MarketAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  tone: 'pos' | 'neg' | 'neu';
}

const SEV_ORDER: Record<AlertSeverity, number> = { high: 0, med: 1, low: 2 };

/** Alertas objetivos: vol, breadth, curva, crédito, cripto, dólar. */
export function buildAlerts(quotes: Map<string, MarketQuote>): MarketAlert[] {
  const out: MarketAlert[] = [];
  const vix = get(quotes, '^VIX');
  const hyg = get(quotes, 'HYG');
  const ief = get(quotes, 'IEF');
  const btc = get(quotes, 'BTC-USD');
  const dxy = get(quotes, 'DX-Y.NYB');
  const tnx = get(quotes, '^TNX');
  const irx = get(quotes, '^IRX');

  if (vix?.changePct != null) {
    if (vix.changePct >= 0.08) {
      out.push({ id: 'vix-spike', severity: 'high', title: 'Vol spike', detail: `VIX ${(vix.changePct * 100).toFixed(1)}% no dia (${vix.price.toFixed(1)}).`, tone: 'neg' });
    } else if (vix.changePct <= -0.08) {
      out.push({ id: 'vix-calm', severity: 'med', title: 'Vol em queda', detail: `VIX ${(vix.changePct * 100).toFixed(1)}% no dia.`, tone: 'pos' });
    }
  }

  const sectorQuotes = SECTORS.map((s) => get(quotes, s.etf)).filter((q): q is MarketQuote => !!q && q.changePct != null);
  if (sectorQuotes.length > 0) {
    const up = sectorQuotes.filter((q) => (q.changePct ?? 0) > 0).length / sectorQuotes.length;
    if (up >= 0.75) out.push({ id: 'breadth-up', severity: 'med', title: 'Breadth thrust', detail: `${(up * 100).toFixed(0)}% dos setores em alta.`, tone: 'pos' });
    else if (up <= 0.25) out.push({ id: 'breadth-down', severity: 'med', title: 'Venda ampla', detail: `${(up * 100).toFixed(0)}% dos setores em alta.`, tone: 'neg' });
  }

  if (tnx && irx && tnx.price < irx.price) {
    out.push({ id: 'curve-inverted', severity: 'med', title: 'Curva invertida', detail: `10y ${tnx.price.toFixed(2)}% < 3M ${irx.price.toFixed(2)}%.`, tone: 'neg' });
  }

  if (hyg?.changePct != null && ief?.changePct != null && hyg.changePct <= -0.01 && ief.changePct >= 0.005) {
    out.push({ id: 'credit-stress', severity: 'high', title: 'Estresse de crédito', detail: `HYG ${(hyg.changePct * 100).toFixed(1)}% com Treasury subindo.`, tone: 'neg' });
  }

  if (btc?.changePct != null && Math.abs(btc.changePct) >= 0.05) {
    out.push({
      id: 'btc-move',
      severity: btc.changePct < 0 ? 'high' : 'low',
      title: btc.changePct >= 0 ? 'Bitcoin em alta forte' : 'Bitcoin em queda forte',
      detail: `BTC ${(btc.changePct * 100).toFixed(1)}% no dia.`,
      tone: btc.changePct >= 0 ? 'pos' : 'neg',
    });
  }

  if (dxy?.changePct != null && dxy.changePct >= 0.007) {
    out.push({ id: 'dollar-bid', severity: 'med', title: 'Dólar forte', detail: `DXY +${(dxy.changePct * 100).toFixed(2)}% no dia.`, tone: 'neg' });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}
