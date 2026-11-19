// MARKET — cestas (Themes / Factors / ETF map). Universos curados + builders puros.
// Reusa o MESMO fetch do módulo (`marketData.ts`): os símbolos das cestas entram em
// `MARKET_FULL_SYMBOLS`, então as abas Environment/Heatmap/Movers/Breadth/Themes/
// Factors/ETF map compartilham uma única chamada em cache.
//
// Fonte: DOCS/10_MODULES/market/00-spec.md.

import { MARKET_ALL_SYMBOLS, type MarketQuote } from './marketData';

// ---------------------------------------------------------------------------
// Universos
// ---------------------------------------------------------------------------

export interface BasketDef {
  id: string;
  label: string;
  symbols: string[];
}

/** Temas (cestas temáticas). Símbolos podem extrapolar o S&P (SMH, cripto etc.). */
export const THEMES: BasketDef[] = [
  { id: 'semis', label: 'Semiconductors', symbols: ['NVDA', 'AMD', 'AVGO', 'MU', 'AMAT', 'LRCX', 'KLAC', 'TSM', 'ASML', 'ARM'] },
  { id: 'software', label: 'Software & Cloud', symbols: ['MSFT', 'CRM', 'NOW', 'ADBE', 'ORCL', 'INTU', 'PANW', 'CRWD'] },
  { id: 'aiinfra', label: 'AI Infrastructure', symbols: ['NVDA', 'AVGO', 'SMCI', 'DELL', 'ANET', 'VRT', 'MU', 'TSM'] },
  { id: 'memory', label: 'Memory & Storage', symbols: ['MU', 'WDC', 'STX', 'NTAP', 'SNDK'] },
  { id: 'cyber', label: 'Cybersecurity', symbols: ['PANW', 'CRWD', 'FTNT', 'ZS', 'OKTA', 'S'] },
  { id: 'biotech', label: 'Biotech', symbols: ['AMGN', 'GILD', 'VRTX', 'REGN', 'MRNA', 'BIIB', 'ILMN'] },
  { id: 'genomics', label: 'Genomics', symbols: ['ILMN', 'CRSP', 'NTLA', 'BEAM', 'VRTX'] },
  { id: 'quantum', label: 'Quantum', symbols: ['IONQ', 'RGTI', 'QBTS', 'IBM'] },
  { id: 'nuclear', label: 'Nuclear & Power', symbols: ['CEG', 'VST', 'NEE', 'OKLO', 'SMR', 'NNE'] },
  { id: 'defense', label: 'Defense', symbols: ['LMT', 'RTX', 'NOC', 'GD', 'LHX', 'BA'] },
  { id: 'cleanenergy', label: 'Clean Energy', symbols: ['ENPH', 'FSLR', 'RUN', 'PLUG', 'BE'] },
  { id: 'robotics', label: 'Robotics & Automation', symbols: ['ISRG', 'ROK', 'TER', 'SYM', 'ABB'] },
  { id: 'chinatech', label: 'China Tech', symbols: ['BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'TCEHY'] },
  { id: 'crypto', label: 'Crypto Equities', symbols: ['COIN', 'MSTR', 'MARA', 'RIOT', 'HOOD'] },
  { id: 'banks', label: 'Banks', symbols: ['JPM', 'BAC', 'WFC', 'C', 'GS', 'MS'] },
  { id: 'homebuilders', label: 'Homebuilders', symbols: ['DHI', 'LEN', 'NVR', 'PHM', 'TOL'] },
  { id: 'goldminers', label: 'Gold Miners', symbols: ['NEM', 'AEM', 'GOLD', 'FNV'] },
  { id: 'oilsvcs', label: 'Oil Services', symbols: ['SLB', 'HAL', 'BKR', 'FTI'] },
  { id: 'airlines', label: 'Airlines', symbols: ['DAL', 'UAL', 'AAL', 'LUV'] },
  { id: 'retail', label: 'Retail', symbols: ['WMT', 'COST', 'TGT', 'HD', 'LOW', 'AMZN'] },
];

/** Fatores (cestas de ETFs de estilo/fator). */
export const FACTORS: BasketDef[] = [
  { id: 'growth', label: 'Growth', symbols: ['IWF', 'VUG', 'IWO', 'SCHG'] },
  { id: 'value', label: 'Value', symbols: ['IWD', 'VTV', 'IVE', 'SCHV'] },
  { id: 'momentum', label: 'Momentum', symbols: ['MTUM', 'SPMO', 'JMOM'] },
  { id: 'quality', label: 'Quality', symbols: ['QUAL', 'DGRW', 'SPHQ'] },
  { id: 'size', label: 'Size (small)', symbols: ['IWM', 'IJR', 'VB', 'MDY'] },
  { id: 'lowvol', label: 'Low Volatility', symbols: ['USMV', 'SPLV', 'SPHD'] },
  { id: 'dividend', label: 'Dividend', symbols: ['SCHD', 'VYM', 'DVY', 'HDV'] },
  { id: 'equal', label: 'Equal Weight', symbols: ['RSP', 'EQAL'] },
];

export interface EtfDef {
  symbol: string;
  label: string;
  weight: number; // AUM aproximado ($B) — só p/ dimensionar o tile
}

export interface EtfCategory {
  id: string;
  label: string;
  etfs: EtfDef[];
}

/** ETF map: ETFs por categoria, ponderados por AUM aproximado. */
export const ETF_CATEGORIES: EtfCategory[] = [
  {
    id: 'broad',
    label: 'Broad Market',
    etfs: [
      { symbol: 'SPY', label: 'S&P 500', weight: 600 },
      { symbol: 'VTI', label: 'Total Market', weight: 430 },
      { symbol: 'QQQ', label: 'Nasdaq 100', weight: 300 },
      { symbol: 'IWM', label: 'Russell 2000', weight: 65 },
      { symbol: 'RSP', label: 'S&P 500 equal', weight: 60 },
      { symbol: 'DIA', label: 'Dow 30', weight: 35 },
    ],
  },
  {
    id: 'sectors',
    label: 'Sectors',
    etfs: [
      { symbol: 'XLK', label: 'Technology', weight: 70 },
      { symbol: 'XLF', label: 'Financials', weight: 45 },
      { symbol: 'XLV', label: 'Health Care', weight: 40 },
      { symbol: 'XLE', label: 'Energy', weight: 35 },
      { symbol: 'XLY', label: 'Cons. Disc.', weight: 20 },
      { symbol: 'XLC', label: 'Comm. Svcs', weight: 20 },
      { symbol: 'XLI', label: 'Industrials', weight: 20 },
      { symbol: 'XLU', label: 'Utilities', weight: 18 },
      { symbol: 'XLP', label: 'Cons. Staples', weight: 15 },
      { symbol: 'XLB', label: 'Materials', weight: 7 },
      { symbol: 'XLRE', label: 'Real Estate', weight: 7 },
    ],
  },
  {
    id: 'style',
    label: 'Style',
    etfs: [
      { symbol: 'IWF', label: 'Russell 1000 Growth', weight: 90 },
      { symbol: 'IWD', label: 'Russell 1000 Value', weight: 55 },
      { symbol: 'VUG', label: 'Vanguard Growth', weight: 120 },
      { symbol: 'VTV', label: 'Vanguard Value', weight: 110 },
      { symbol: 'MTUM', label: 'Momentum', weight: 10 },
      { symbol: 'QUAL', label: 'Quality', weight: 40 },
      { symbol: 'USMV', label: 'Min Vol', weight: 20 },
      { symbol: 'SCHD', label: 'Dividend', weight: 60 },
    ],
  },
  {
    id: 'bonds',
    label: 'Bonds & Rates',
    etfs: [
      { symbol: 'AGG', label: 'US Aggregate', weight: 110 },
      { symbol: 'BND', label: 'Total Bond', weight: 110 },
      { symbol: 'TLT', label: '20Y+ Treasury', weight: 50 },
      { symbol: 'LQD', label: 'IG Credit', weight: 35 },
      { symbol: 'IEF', label: '7–10Y Treasury', weight: 30 },
      { symbol: 'SHY', label: '1–3Y Treasury', weight: 30 },
      { symbol: 'TIP', label: 'TIPS', weight: 20 },
      { symbol: 'HYG', label: 'HY Credit', weight: 18 },
    ],
  },
  {
    id: 'commodities',
    label: 'Commodities',
    etfs: [
      { symbol: 'GLD', label: 'Gold', weight: 70 },
      { symbol: 'SLV', label: 'Silver', weight: 15 },
      { symbol: 'GDX', label: 'Gold Miners', weight: 15 },
      { symbol: 'DBC', label: 'Broad Commodities', weight: 2 },
      { symbol: 'USO', label: 'Oil', weight: 1 },
      { symbol: 'UNG', label: 'Nat Gas', weight: 1 },
    ],
  },
  {
    id: 'intl',
    label: 'International',
    etfs: [
      { symbol: 'VWO', label: 'Emerging Markets', weight: 70 },
      { symbol: 'EFA', label: 'EAFE (developed)', weight: 50 },
      { symbol: 'EEM', label: 'EM (iShares)', weight: 18 },
      { symbol: 'EWJ', label: 'Japan', weight: 12 },
      { symbol: 'INDA', label: 'India', weight: 10 },
      { symbol: 'FXI', label: 'China Large-Cap', weight: 6 },
    ],
  },
  {
    id: 'crypto',
    label: 'Crypto ETFs',
    etfs: [
      { symbol: 'IBIT', label: 'iShares Bitcoin', weight: 40 },
      { symbol: 'GBTC', label: 'Grayscale Bitcoin', weight: 20 },
      { symbol: 'FBTC', label: 'Fidelity Bitcoin', weight: 15 },
      { symbol: 'ETHA', label: 'iShares Ethereum', weight: 8 },
      { symbol: 'BITO', label: 'Bitcoin Futures', weight: 2 },
    ],
  },
  {
    id: 'thematic',
    label: 'Thematic',
    etfs: [
      { symbol: 'SMH', label: 'Semiconductors', weight: 25 },
      { symbol: 'SOXX', label: 'Semis (iShares)', weight: 12 },
      { symbol: 'XBI', label: 'Biotech equal', weight: 7 },
      { symbol: 'ARKK', label: 'ARK Innovation', weight: 7 },
      { symbol: 'ITA', label: 'Aerospace & Defense', weight: 6 },
      { symbol: 'ICLN', label: 'Clean Energy', weight: 3 },
      { symbol: 'JETS', label: 'Airlines', weight: 3 },
      { symbol: 'XME', label: 'Metals & Mining', weight: 2 },
    ],
  },
];

/** Símbolos extras trazidos pelas cestas (além do core Environment+heatmap). */
export const BASKET_SYMBOLS: string[] = [
  ...new Set([
    ...THEMES.flatMap((t) => t.symbols),
    ...FACTORS.flatMap((f) => f.symbols),
    ...ETF_CATEGORIES.flatMap((c) => c.etfs.map((e) => e.symbol)),
  ]),
];

/** Universo completo do módulo (core + cestas) — 1 fetch compartilhado p/ todas as abas. */
export const MARKET_FULL_SYMBOLS: string[] = [
  ...new Set([...MARKET_ALL_SYMBOLS, ...BASKET_SYMBOLS]),
];

// ---------------------------------------------------------------------------
// Builders puros
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

export interface BasketScore {
  id: string;
  label: string;
  n: number;
  avgChangePct: number;
  breadth: number; // 0..1 (fração em alta)
  relToBench: number; // avg - benchmark
  members: { symbol: string; changePct: number }[];
}

function scoreBaskets(defs: BasketDef[], quotes: Map<string, MarketQuote>, benchmark: string): BasketScore[] {
  const bench = quotes.get(benchmark.toUpperCase())?.changePct ?? 0;
  return defs
    .map((d) => {
      const members: { symbol: string; changePct: number }[] = [];
      for (const s of d.symbols) {
        const q = quotes.get(s.toUpperCase());
        if (q && q.changePct != null) members.push({ symbol: s, changePct: q.changePct });
      }
      const changes = members.map((m) => m.changePct);
      const avg = mean(changes);
      const breadth = members.length ? members.filter((m) => m.changePct > 0).length / members.length : 0;
      return {
        id: d.id,
        label: d.label,
        n: members.length,
        avgChangePct: avg,
        breadth,
        relToBench: avg - bench,
        members: members.sort((a, b) => b.changePct - a.changePct),
      };
    })
    .filter((b) => b.n > 0)
    .sort((a, b) => b.avgChangePct - a.avgChangePct);
}

/** Pontuação dos temas (breadth + variação média + relativo ao benchmark). */
export function buildThemes(quotes: Map<string, MarketQuote>, benchmark = 'SPY'): BasketScore[] {
  return scoreBaskets(THEMES, quotes, benchmark);
}

/** Pontuação dos fatores. */
export function buildFactors(quotes: Map<string, MarketQuote>, benchmark = 'SPY'): BasketScore[] {
  return scoreBaskets(FACTORS, quotes, benchmark);
}

export interface EtfTile {
  symbol: string;
  label: string;
  weight: number;
  price: number;
  changePct: number;
}

export interface EtfMapCategory {
  id: string;
  label: string;
  weight: number;
  avgChangePct: number;
  advancers: number;
  decliners: number;
  tiles: EtfTile[];
}

/** ETF map: categorias → ETFs (tamanho ≈ AUM, cor = variação do dia). */
export function buildEtfMap(quotes: Map<string, MarketQuote>): EtfMapCategory[] {
  return ETF_CATEGORIES.map((c) => {
    const tiles: EtfTile[] = [];
    let weight = 0;
    let advancers = 0;
    let decliners = 0;
    for (const e of c.etfs) {
      const q = quotes.get(e.symbol.toUpperCase());
      if (!q || q.changePct == null) continue;
      if (q.changePct > 0) advancers += 1;
      else if (q.changePct < 0) decliners += 1;
      weight += e.weight;
      tiles.push({ symbol: e.symbol, label: e.label, weight: e.weight, price: q.price, changePct: q.changePct });
    }
    return {
      id: c.id,
      label: c.label,
      weight,
      avgChangePct: mean(tiles.map((t) => t.changePct)),
      advancers,
      decliners,
      tiles: tiles.sort((a, b) => b.weight - a.weight),
    };
  })
    .filter((c) => c.tiles.length > 0)
    .sort((a, b) => b.weight - a.weight);
}
