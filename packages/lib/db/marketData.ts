// MARKET (vertical slice) — motor de dados de mercado da nova aba Market.
// Borda de mercado READ-ONLY: NUNCA escreve saldo/ledger. Fonte: Yahoo Finance
// via proxy serverless (`netlify/functions/yahoo-quote.ts`, batch) + Brapi/CoinGecko
// já usados no priceService para o universo B3/cripto.
//
// Aqui ficam: (1) o UNIVERSO curado (índices, setores, juros, FX, commodities,
// cripto e ~110 ações por setor p/ o heatmap); (2) o fetch em lote com cache
// offline-first; (3) os cálculos derivados (overview, heatmap, breadth, movers)
// — puros e testáveis. A UI só renderiza; nenhum número de mercado é calculado
// na tela (regra do DOCS/11_PAGE_MAP.md).
//
// Fonte: DOCS/10_MODULES/market/00-spec.md.

import type { Quote as PriceQuote } from './priceService';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface MarketQuote {
  symbol: string; // símbolo normalizado (upper)
  price: number; // > 0
  previousClose: number | null;
  change: number | null;
  changePct: number | null; // fração (0.01 = +1%)
  currency: string; // USD, BRL…
  name: string | null;
  exchange: string | null;
  volume: number | null;
  marketTime: number | null; // epoch ms
  series: Array<[number, number]>; // [[ts ms, close], ...]
  at: string; // ISO do fetch bem-sucedido
  stale?: boolean; // veio do cache (offline/falha)
}

export interface MarketFetchResult {
  quotes: Map<string, MarketQuote>;
  failed: string[];
  fromCache: string[];
  at: string;
}

// ---------------------------------------------------------------------------
// Universo curado
// ---------------------------------------------------------------------------

export interface UniverseItem {
  symbol: string;
  label: string;
}

export interface MarketGroup {
  id: string;
  label: string;
  items: UniverseItem[];
}

/** Categorias do painel Environment (cross-asset). */
export const MARKET_GROUPS: MarketGroup[] = [
  {
    id: 'indices',
    label: 'Índices & ETFs',
    items: [
      { symbol: 'SPY', label: 'S&P 500' },
      { symbol: 'QQQ', label: 'Nasdaq 100' },
      { symbol: 'DIA', label: 'Dow 30' },
      { symbol: 'IWM', label: 'Russell 2000' },
      { symbol: 'RSP', label: 'S&P 500 equal' },
      { symbol: 'MDY', label: 'S&P MidCap 400' },
      { symbol: '^VIX', label: 'VIX' },
    ],
  },
  {
    id: 'sectors',
    label: 'Setores (SPDR)',
    items: [
      { symbol: 'XLK', label: 'Technology' },
      { symbol: 'XLC', label: 'Comm. Services' },
      { symbol: 'XLY', label: 'Cons. Discretionary' },
      { symbol: 'XLP', label: 'Cons. Staples' },
      { symbol: 'XLF', label: 'Financials' },
      { symbol: 'XLV', label: 'Health Care' },
      { symbol: 'XLI', label: 'Industrials' },
      { symbol: 'XLE', label: 'Energy' },
      { symbol: 'XLB', label: 'Materials' },
      { symbol: 'XLU', label: 'Utilities' },
      { symbol: 'XLRE', label: 'Real Estate' },
    ],
  },
  {
    id: 'rates',
    label: 'Juros & Crédito',
    items: [
      { symbol: '^TNX', label: 'US 10Y yield' },
      { symbol: '^FVX', label: 'US 5Y yield' },
      { symbol: '^TYX', label: 'US 30Y yield' },
      { symbol: '^IRX', label: 'US 13W yield' },
      { symbol: 'TLT', label: '20Y+ Treasury' },
      { symbol: 'IEF', label: '7–10Y Treasury' },
      { symbol: 'LQD', label: 'IG credit' },
      { symbol: 'HYG', label: 'HY credit' },
      { symbol: 'TIP', label: 'TIPS' },
    ],
  },
  {
    id: 'fx',
    label: 'Câmbio',
    items: [
      { symbol: 'DX-Y.NYB', label: 'Dollar index' },
      { symbol: 'EURUSD=X', label: 'EUR/USD' },
      { symbol: 'USDJPY=X', label: 'USD/JPY' },
      { symbol: 'GBPUSD=X', label: 'GBP/USD' },
      { symbol: 'AUDUSD=X', label: 'AUD/USD' },
      { symbol: 'USDBRL=X', label: 'USD/BRL' },
    ],
  },
  {
    id: 'commodities',
    label: 'Commodities',
    items: [
      { symbol: 'GC=F', label: 'Gold' },
      { symbol: 'SI=F', label: 'Silver' },
      { symbol: 'CL=F', label: 'WTI crude' },
      { symbol: 'NG=F', label: 'Nat gas' },
      { symbol: 'HG=F', label: 'Copper' },
      { symbol: 'ZC=F', label: 'Corn' },
    ],
  },
  {
    id: 'crypto',
    label: 'Cripto',
    items: [
      { symbol: 'BTC-USD', label: 'Bitcoin' },
      { symbol: 'ETH-USD', label: 'Ethereum' },
      { symbol: 'SOL-USD', label: 'Solana' },
      { symbol: 'XRP-USD', label: 'XRP' },
    ],
  },
];

/** Ativos "risk-off" para o composite de apetite a risco. */
const RISK_OFF_SYMBOLS = new Set(['^VIX', 'TLT', 'IEF', 'LQD', 'HYG', 'DX-Y.NYB', 'GC=F', 'USDJPY=X']);
/** Ativos "risk-on". */
const RISK_ON_SYMBOLS = new Set(['SPY', 'QQQ', 'IWM', 'RSP', 'BTC-USD', 'ETH-USD', 'HG=F', 'USDBRL=X']);

// ---- Heatmap: 11 setores GICS + ~110 nomes com peso aproximado ($B) ----

export interface SectorDef {
  id: string;
  label: string;
  etf: string;
  short: string;
}

export const SECTORS: SectorDef[] = [
  { id: 'tech', label: 'Technology', etf: 'XLK', short: 'TECH' },
  { id: 'comm', label: 'Communication Services', etf: 'XLC', short: 'COMM' },
  { id: 'disc', label: 'Consumer Discretionary', etf: 'XLY', short: 'CONS DISC' },
  { id: 'stap', label: 'Consumer Staples', etf: 'XLP', short: 'STAPLES' },
  { id: 'fin', label: 'Financials', etf: 'XLF', short: 'FIN' },
  { id: 'health', label: 'Health Care', etf: 'XLV', short: 'HEALTH' },
  { id: 'indus', label: 'Industrials', etf: 'XLI', short: 'INDUS' },
  { id: 'energy', label: 'Energy', etf: 'XLE', short: 'ENERGY' },
  { id: 'materials', label: 'Materials', etf: 'XLB', short: 'MATERIALS' },
  { id: 'utilities', label: 'Utilities', etf: 'XLU', short: 'UTILITIES' },
  { id: 'realestate', label: 'Real Estate', etf: 'XLRE', short: 'REAL ESTATE' },
];

export interface ConstituentDef {
  symbol: string;
  name: string;
  sector: string; // SectorDef.id
  weight: number; // cap aproximada ($B) — só p/ dimensionar o tile
}

/** Universo do heatmap (aproximação S&P 500 — pesos em $B, estáticos). */
export const CONSTITUENTS: ConstituentDef[] = [
  // Technology
  { symbol: 'NVDA', name: 'NVIDIA', sector: 'tech', weight: 3300 },
  { symbol: 'AAPL', name: 'Apple', sector: 'tech', weight: 3400 },
  { symbol: 'MSFT', name: 'Microsoft', sector: 'tech', weight: 3100 },
  { symbol: 'AVGO', name: 'Broadcom', sector: 'tech', weight: 800 },
  { symbol: 'AMD', name: 'AMD', sector: 'tech', weight: 260 },
  { symbol: 'MU', name: 'Micron', sector: 'tech', weight: 130 },
  { symbol: 'INTC', name: 'Intel', sector: 'tech', weight: 90 },
  { symbol: 'QCOM', name: 'Qualcomm', sector: 'tech', weight: 180 },
  { symbol: 'TXN', name: 'Texas Instruments', sector: 'tech', weight: 170 },
  { symbol: 'ADI', name: 'Analog Devices', sector: 'tech', weight: 110 },
  { symbol: 'MRVL', name: 'Marvell', sector: 'tech', weight: 70 },
  { symbol: 'AMAT', name: 'Applied Materials', sector: 'tech', weight: 160 },
  { symbol: 'LRCX', name: 'Lam Research', sector: 'tech', weight: 100 },
  { symbol: 'KLAC', name: 'KLA', sector: 'tech', weight: 100 },
  { symbol: 'ADBE', name: 'Adobe', sector: 'tech', weight: 240 },
  { symbol: 'CRM', name: 'Salesforce', sector: 'tech', weight: 250 },
  { symbol: 'ORCL', name: 'Oracle', sector: 'tech', weight: 480 },
  { symbol: 'NOW', name: 'ServiceNow', sector: 'tech', weight: 200 },
  { symbol: 'IBM', name: 'IBM', sector: 'tech', weight: 200 },
  { symbol: 'ACN', name: 'Accenture', sector: 'tech', weight: 220 },
  { symbol: 'CSCO', name: 'Cisco', sector: 'tech', weight: 230 },
  { symbol: 'PANW', name: 'Palo Alto', sector: 'tech', weight: 120 },
  { symbol: 'CRWD', name: 'CrowdStrike', sector: 'tech', weight: 90 },
  { symbol: 'APH', name: 'Amphenol', sector: 'tech', weight: 90 },
  { symbol: 'INTU', name: 'Intuit', sector: 'tech', weight: 190 },
  { symbol: 'DELL', name: 'Dell', sector: 'tech', weight: 90 },
  { symbol: 'ANET', name: 'Arista', sector: 'tech', weight: 100 },
  { symbol: 'MSI', name: 'Motorola Solutions', sector: 'tech', weight: 70 },
  { symbol: 'WDC', name: 'Western Digital', sector: 'tech', weight: 50 },
  { symbol: 'STX', name: 'Seagate', sector: 'tech', weight: 40 },
  { symbol: 'NTAP', name: 'NetApp', sector: 'tech', weight: 30 },
  { symbol: 'HPQ', name: 'HP', sector: 'tech', weight: 30 },
  { symbol: 'HPE', name: 'Hewlett Packard Ent.', sector: 'tech', weight: 25 },
  { symbol: 'ADSK', name: 'Autodesk', sector: 'tech', weight: 60 },
  // Communication Services
  { symbol: 'GOOGL', name: 'Alphabet', sector: 'comm', weight: 2100 },
  { symbol: 'META', name: 'Meta', sector: 'comm', weight: 1400 },
  { symbol: 'NFLX', name: 'Netflix', sector: 'comm', weight: 400 },
  { symbol: 'DIS', name: 'Disney', sector: 'comm', weight: 180 },
  { symbol: 'VZ', name: 'Verizon', sector: 'comm', weight: 180 },
  { symbol: 'T', name: 'AT&T', sector: 'comm', weight: 160 },
  { symbol: 'TMUS', name: 'T-Mobile', sector: 'comm', weight: 230 },
  { symbol: 'CMCSA', name: 'Comcast', sector: 'comm', weight: 160 },
  { symbol: 'EA', name: 'Electronic Arts', sector: 'comm', weight: 40 },
  { symbol: 'TTWO', name: 'Take-Two', sector: 'comm', weight: 30 },
  // Consumer Discretionary
  { symbol: 'AMZN', name: 'Amazon', sector: 'disc', weight: 2200 },
  { symbol: 'TSLA', name: 'Tesla', sector: 'disc', weight: 900 },
  { symbol: 'HD', name: 'Home Depot', sector: 'disc', weight: 380 },
  { symbol: 'MCD', name: "McDonald's", sector: 'disc', weight: 220 },
  { symbol: 'LOW', name: "Lowe's", sector: 'disc', weight: 140 },
  { symbol: 'NKE', name: 'Nike', sector: 'disc', weight: 100 },
  { symbol: 'SBUX', name: 'Starbucks', sector: 'disc', weight: 110 },
  { symbol: 'TJX', name: 'TJX', sector: 'disc', weight: 140 },
  { symbol: 'BKNG', name: 'Booking', sector: 'disc', weight: 160 },
  { symbol: 'CMG', name: 'Chipotle', sector: 'disc', weight: 70 },
  { symbol: 'MAR', name: 'Marriott', sector: 'disc', weight: 90 },
  { symbol: 'F', name: 'Ford', sector: 'disc', weight: 45 },
  { symbol: 'GM', name: 'General Motors', sector: 'disc', weight: 50 },
  { symbol: 'RCL', name: 'Royal Caribbean', sector: 'disc', weight: 60 },
  { symbol: 'ABNB', name: 'Airbnb', sector: 'disc', weight: 90 },
  { symbol: 'ORLY', name: "O'Reilly", sector: 'disc', weight: 70 },
  { symbol: 'LULU', name: 'Lululemon', sector: 'disc', weight: 40 },
  { symbol: 'DASH', name: 'DoorDash', sector: 'disc', weight: 70 },
  // Consumer Staples
  { symbol: 'WMT', name: 'Walmart', sector: 'stap', weight: 600 },
  { symbol: 'COST', name: 'Costco', sector: 'stap', weight: 400 },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'stap', weight: 390 },
  { symbol: 'KO', name: 'Coca-Cola', sector: 'stap', weight: 280 },
  { symbol: 'PEP', name: 'PepsiCo', sector: 'stap', weight: 230 },
  { symbol: 'PM', name: 'Philip Morris', sector: 'stap', weight: 200 },
  { symbol: 'MO', name: 'Altria', sector: 'stap', weight: 90 },
  { symbol: 'MDLZ', name: 'Mondelez', sector: 'stap', weight: 90 },
  { symbol: 'CL', name: 'Colgate-Palmolive', sector: 'stap', weight: 70 },
  { symbol: 'TGT', name: 'Target', sector: 'stap', weight: 70 },
  { symbol: 'KMB', name: 'Kimberly-Clark', sector: 'stap', weight: 45 },
  { symbol: 'GIS', name: 'General Mills', sector: 'stap', weight: 40 },
  { symbol: 'KHC', name: 'Kraft Heinz', sector: 'stap', weight: 40 },
  { symbol: 'KR', name: 'Kroger', sector: 'stap', weight: 40 },
  { symbol: 'SYY', name: 'Sysco', sector: 'stap', weight: 40 },
  { symbol: 'STZ', name: 'Constellation Brands', sector: 'stap', weight: 40 },
  // Financials
  { symbol: 'BRK-B', name: 'Berkshire Hathaway', sector: 'fin', weight: 1000 },
  { symbol: 'JPM', name: 'JPMorgan', sector: 'fin', weight: 620 },
  { symbol: 'V', name: 'Visa', sector: 'fin', weight: 500 },
  { symbol: 'MA', name: 'Mastercard', sector: 'fin', weight: 450 },
  { symbol: 'BAC', name: 'Bank of America', sector: 'fin', weight: 350 },
  { symbol: 'WFC', name: 'Wells Fargo', sector: 'fin', weight: 220 },
  { symbol: 'GS', name: 'Goldman Sachs', sector: 'fin', weight: 160 },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'fin', weight: 150 },
  { symbol: 'C', name: 'Citigroup', sector: 'fin', weight: 130 },
  { symbol: 'AXP', name: 'American Express', sector: 'fin', weight: 200 },
  { symbol: 'BLK', name: 'BlackRock', sector: 'fin', weight: 120 },
  { symbol: 'SPGI', name: 'S&P Global', sector: 'fin', weight: 140 },
  { symbol: 'CB', name: 'Chubb', sector: 'fin', weight: 110 },
  { symbol: 'PGR', name: 'Progressive', sector: 'fin', weight: 130 },
  { symbol: 'SCHW', name: 'Charles Schwab', sector: 'fin', weight: 120 },
  { symbol: 'USB', name: 'US Bancorp', sector: 'fin', weight: 70 },
  { symbol: 'PNC', name: 'PNC', sector: 'fin', weight: 70 },
  { symbol: 'TFC', name: 'Truist', sector: 'fin', weight: 55 },
  { symbol: 'BK', name: 'BNY Mellon', sector: 'fin', weight: 50 },
  { symbol: 'AIG', name: 'AIG', sector: 'fin', weight: 50 },
  { symbol: 'MET', name: 'MetLife', sector: 'fin', weight: 55 },
  { symbol: 'AON', name: 'Aon', sector: 'fin', weight: 75 },
  { symbol: 'MMC', name: 'Marsh McLennan', sector: 'fin', weight: 110 },
  { symbol: 'ICE', name: 'Intercontinental Exch.', sector: 'fin', weight: 80 },
  { symbol: 'CME', name: 'CME Group', sector: 'fin', weight: 75 },
  { symbol: 'COF', name: 'Capital One', sector: 'fin', weight: 60 },
  // Health Care
  { symbol: 'LLY', name: 'Eli Lilly', sector: 'health', weight: 800 },
  { symbol: 'UNH', name: 'UnitedHealth', sector: 'health', weight: 500 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'health', weight: 380 },
  { symbol: 'ABBV', name: 'AbbVie', sector: 'health', weight: 330 },
  { symbol: 'MRK', name: 'Merck', sector: 'health', weight: 280 },
  { symbol: 'TMO', name: 'Thermo Fisher', sector: 'health', weight: 220 },
  { symbol: 'ABT', name: 'Abbott', sector: 'health', weight: 200 },
  { symbol: 'PFE', name: 'Pfizer', sector: 'health', weight: 160 },
  { symbol: 'DHR', name: 'Danaher', sector: 'health', weight: 180 },
  { symbol: 'AMGN', name: 'Amgen', sector: 'health', weight: 160 },
  { symbol: 'ISRG', name: 'Intuitive Surgical', sector: 'health', weight: 180 },
  { symbol: 'BSX', name: 'Boston Scientific', sector: 'health', weight: 130 },
  { symbol: 'GILD', name: 'Gilead', sector: 'health', weight: 110 },
  { symbol: 'VRTX', name: 'Vertex', sector: 'health', weight: 120 },
  { symbol: 'MDT', name: 'Medtronic', sector: 'health', weight: 110 },
  { symbol: 'SYK', name: 'Stryker', sector: 'health', weight: 130 },
  { symbol: 'REGN', name: 'Regeneron', sector: 'health', weight: 70 },
  { symbol: 'CI', name: 'Cigna', sector: 'health', weight: 100 },
  { symbol: 'CVS', name: 'CVS Health', sector: 'health', weight: 80 },
  { symbol: 'ELV', name: 'Elevance', sector: 'health', weight: 100 },
  { symbol: 'HCA', name: 'HCA Healthcare', sector: 'health', weight: 90 },
  { symbol: 'MCK', name: 'McKesson', sector: 'health', weight: 70 },
  { symbol: 'HUM', name: 'Humana', sector: 'health', weight: 50 },
  { symbol: 'ZTS', name: 'Zoetis', sector: 'health', weight: 80 },
  { symbol: 'BMY', name: 'Bristol-Myers', sector: 'health', weight: 100 },
  // Industrials
  { symbol: 'GE', name: 'GE Aerospace', sector: 'indus', weight: 190 },
  { symbol: 'CAT', name: 'Caterpillar', sector: 'indus', weight: 170 },
  { symbol: 'RTX', name: 'RTX', sector: 'indus', weight: 150 },
  { symbol: 'HON', name: 'Honeywell', sector: 'indus', weight: 140 },
  { symbol: 'UNP', name: 'Union Pacific', sector: 'indus', weight: 140 },
  { symbol: 'BA', name: 'Boeing', sector: 'indus', weight: 130 },
  { symbol: 'LMT', name: 'Lockheed Martin', sector: 'indus', weight: 110 },
  { symbol: 'DE', name: 'Deere', sector: 'indus', weight: 120 },
  { symbol: 'UPS', name: 'UPS', sector: 'indus', weight: 110 },
  { symbol: 'ADP', name: 'ADP', sector: 'indus', weight: 110 },
  { symbol: 'ETN', name: 'Eaton', sector: 'indus', weight: 130 },
  { symbol: 'PH', name: 'Parker Hannifin', sector: 'indus', weight: 70 },
  { symbol: 'ITW', name: 'Illinois Tool Works', sector: 'indus', weight: 75 },
  { symbol: 'MMM', name: '3M', sector: 'indus', weight: 70 },
  { symbol: 'CSX', name: 'CSX', sector: 'indus', weight: 65 },
  { symbol: 'NOC', name: 'Northrop Grumman', sector: 'indus', weight: 70 },
  { symbol: 'GD', name: 'General Dynamics', sector: 'indus', weight: 80 },
  { symbol: 'WM', name: 'Waste Management', sector: 'indus', weight: 80 },
  { symbol: 'EMR', name: 'Emerson', sector: 'indus', weight: 60 },
  { symbol: 'TT', name: 'Trane', sector: 'indus', weight: 70 },
  { symbol: 'FDX', name: 'FedEx', sector: 'indus', weight: 60 },
  { symbol: 'CARR', name: 'Carrier', sector: 'indus', weight: 60 },
  { symbol: 'JCI', name: 'Johnson Controls', sector: 'indus', weight: 50 },
  // Energy
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'energy', weight: 500 },
  { symbol: 'CVX', name: 'Chevron', sector: 'energy', weight: 280 },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'energy', weight: 130 },
  { symbol: 'EOG', name: 'EOG Resources', sector: 'energy', weight: 70 },
  { symbol: 'SLB', name: 'SLB', sector: 'energy', weight: 65 },
  { symbol: 'WMB', name: 'Williams', sector: 'energy', weight: 55 },
  { symbol: 'OXY', name: 'Occidental', sector: 'energy', weight: 50 },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'energy', weight: 50 },
  { symbol: 'MPC', name: 'Marathon Petroleum', sector: 'energy', weight: 55 },
  { symbol: 'VLO', name: 'Valero', sector: 'energy', weight: 45 },
  { symbol: 'KMI', name: 'Kinder Morgan', sector: 'energy', weight: 50 },
  { symbol: 'HAL', name: 'Halliburton', sector: 'energy', weight: 40 },
  { symbol: 'BKR', name: 'Baker Hughes', sector: 'energy', weight: 35 },
  { symbol: 'HES', name: 'Hess', sector: 'energy', weight: 45 },
  { symbol: 'DVN', name: 'Devon Energy', sector: 'energy', weight: 30 },
  // Materials
  { symbol: 'LIN', name: 'Linde', sector: 'materials', weight: 210 },
  { symbol: 'SHW', name: 'Sherwin-Williams', sector: 'materials', weight: 80 },
  { symbol: 'APD', name: 'Air Products', sector: 'materials', weight: 65 },
  { symbol: 'FCX', name: 'Freeport-McMoRan', sector: 'materials', weight: 65 },
  { symbol: 'ECL', name: 'Ecolab', sector: 'materials', weight: 70 },
  { symbol: 'NEM', name: 'Newmont', sector: 'materials', weight: 50 },
  { symbol: 'DOW', name: 'Dow', sector: 'materials', weight: 40 },
  { symbol: 'NUE', name: 'Nucor', sector: 'materials', weight: 40 },
  { symbol: 'PPG', name: 'PPG Industries', sector: 'materials', weight: 35 },
  { symbol: 'VMC', name: 'Vulcan Materials', sector: 'materials', weight: 35 },
  { symbol: 'MLM', name: 'Martin Marietta', sector: 'materials', weight: 35 },
  { symbol: 'IFF', name: 'Intl Flavors & Fragrances', sector: 'materials', weight: 25 },
  // Utilities
  { symbol: 'NEE', name: 'NextEra Energy', sector: 'utilities', weight: 150 },
  { symbol: 'SO', name: 'Southern Company', sector: 'utilities', weight: 100 },
  { symbol: 'DUK', name: 'Duke Energy', sector: 'utilities', weight: 80 },
  { symbol: 'CEG', name: 'Constellation Energy', sector: 'utilities', weight: 70 },
  { symbol: 'AEP', name: 'American Electric Power', sector: 'utilities', weight: 55 },
  { symbol: 'SRE', name: 'Sempra', sector: 'utilities', weight: 50 },
  { symbol: 'D', name: 'Dominion Energy', sector: 'utilities', weight: 45 },
  { symbol: 'EXC', name: 'Exelon', sector: 'utilities', weight: 40 },
  { symbol: 'XEL', name: 'Xcel Energy', sector: 'utilities', weight: 40 },
  { symbol: 'ED', name: 'Consolidated Edison', sector: 'utilities', weight: 35 },
  { symbol: 'PEG', name: 'Public Service Ent.', sector: 'utilities', weight: 40 },
  { symbol: 'WEC', name: 'WEC Energy', sector: 'utilities', weight: 30 },
  { symbol: 'ES', name: 'Eversource', sector: 'utilities', weight: 30 },
  { symbol: 'AEE', name: 'Ameren', sector: 'utilities', weight: 25 },
  // Real Estate
  { symbol: 'PLD', name: 'Prologis', sector: 'realestate', weight: 110 },
  { symbol: 'AMT', name: 'American Tower', sector: 'realestate', weight: 90 },
  { symbol: 'EQIX', name: 'Equinix', sector: 'realestate', weight: 80 },
  { symbol: 'WELL', name: 'Welltower', sector: 'realestate', weight: 70 },
  { symbol: 'SPG', name: 'Simon Property', sector: 'realestate', weight: 60 },
  { symbol: 'O', name: 'Realty Income', sector: 'realestate', weight: 45 },
  { symbol: 'DLR', name: 'Digital Realty', sector: 'realestate', weight: 55 },
  { symbol: 'PSA', name: 'Public Storage', sector: 'realestate', weight: 50 },
  { symbol: 'CCI', name: 'Crown Castle', sector: 'realestate', weight: 45 },
  { symbol: 'EXR', name: 'Extra Space Storage', sector: 'realestate', weight: 30 },
  { symbol: 'VICI', name: 'VICI Properties', sector: 'realestate', weight: 30 },
  { symbol: 'AVB', name: 'AvalonBay', sector: 'realestate', weight: 30 },
  { symbol: 'EQR', name: 'Equity Residential', sector: 'realestate', weight: 25 },
];

/** Todos os símbolos do heatmap/movers (deduplicado). */
export const CONSTITUENT_SYMBOLS: string[] = [...new Set(CONSTITUENTS.map((c) => c.symbol))];

/** Todos os símbolos do painel Environment. */
export const ENVIRONMENT_SYMBOLS: string[] = [
  ...new Set(MARKET_GROUPS.flatMap((g) => g.items.map((i) => i.symbol))),
];

/** Universo completo do módulo (Environment + heatmap/movers) — 1 fetch compartilhado. */
export const MARKET_ALL_SYMBOLS: string[] = [
  ...new Set([...ENVIRONMENT_SYMBOLS, ...CONSTITUENT_SYMBOLS]),
];

/** Símbolos por setor (para breadth). */
export const SECTOR_CONSTITUENTS: Record<string, ConstituentDef[]> = SECTORS.reduce(
  (acc, s) => {
    acc[s.id] = CONSTITUENTS.filter((c) => c.sector === s.id);
    return acc;
  },
  {} as Record<string, ConstituentDef[]>,
);

// ---------------------------------------------------------------------------
// Fetch via proxy (Yahoo batch) + cache offline-first
// ---------------------------------------------------------------------------

const CACHE_KEY = 'market:cache:v1';
const DEFAULT_TIMEOUT_MS = 12000;

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

function defaultFetch(): FetchImpl {
  const g = globalThis as { fetch?: FetchImpl };
  if (!g.fetch) throw new Error('fetch indisponível neste ambiente');
  return g.fetch.bind(globalThis);
}

function envProxy(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
    if (env?.VITE_YAHOO_PROXY) return env.VITE_YAHOO_PROXY;
  } catch {
    /* noop */
  }
  return '/.netlify/functions/yahoo-quote';
}

interface RawBatchQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  name: string | null;
  exchange: string | null;
  volume: number | null;
  marketTime: number | null;
  series: Array<[number, number]>;
}

const memCache = new Map<string, MarketQuote>();

function readDiskCache(): Record<string, MarketQuote> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, MarketQuote>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDiskCache(symbol: string, quote: MarketQuote): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = readDiskCache();
    all[symbol] = quote;
    const keys = Object.keys(all);
    if (keys.length > 400) {
      // remove os mais antigos por `at`
      keys
        .sort((a, b) => String(all[a]?.at).localeCompare(String(all[b]?.at)))
        .slice(0, keys.length - 400)
        .forEach((k) => delete all[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota cheia: mantém só memória */
  }
}

export function getCachedMarketQuote(symbol: string): MarketQuote | null {
  const key = String(symbol || '').trim().toUpperCase();
  return memCache.get(key) ?? readDiskCache()[key] ?? null;
}

export function clearMarketCache(): void {
  memCache.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  } catch {
    /* noop */
  }
}

/** Divide em lotes de N (o proxy limita a 80 por chamada). */
export function chunkSymbols(symbols: string[], size = 60): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < symbols.length; i += size) out.push(symbols.slice(i, i + size));
  return out;
}

async function fetchBatch(
  symbols: string[],
  range: string,
  interval: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
  proxyUrl?: string,
): Promise<RawBatchQuote[]> {
  const base = proxyUrl || envProxy();
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}symbols=${encodeURIComponent(symbols.join(','))}&range=${range}&interval=${interval}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
    const json = (await res.json()) as { quotes?: RawBatchQuote[]; error?: string };
    if (json?.error) throw new Error(json.error);
    return Array.isArray(json?.quotes) ? json.quotes : [];
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchMarketOptions {
  range?: string; // default '5d'
  interval?: string; // default '1d'
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
  proxyUrl?: string;
}

/**
 * Busca cotações de mercado em lote (tolerante: um lote falho não derruba o resto).
 * Sempre mescla com o cache (offline-first): símbolo sem rede usa o último valor,
 * marcado como `stale`.
 */
export async function fetchMarketQuotes(
  symbols: string[],
  opts: FetchMarketOptions = {},
): Promise<MarketFetchResult> {
  const range = opts.range ?? '5d';
  const interval = opts.interval ?? '1d';
  const fetchImpl = opts.fetchImpl ?? defaultFetch();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const quotes = new Map<string, MarketQuote>();
  const failed: string[] = [];
  const fromCache: string[] = [];

  const unique = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
  const batches = chunkSymbols(unique);

  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        return await fetchBatch(batch, range, interval, fetchImpl, timeoutMs, opts.proxyUrl);
      } catch {
        return null;
      }
    }),
  );

  const got = new Set<string>();
  for (const batchResult of results) {
    if (!batchResult) continue;
    for (const raw of batchResult) {
      const key = String(raw.symbol || '').toUpperCase();
      if (!key) continue;
      const quote: MarketQuote = {
        symbol: key,
        price: raw.price,
        previousClose: raw.previousClose,
        change: raw.change,
        changePct: raw.changePct,
        currency: raw.currency || 'USD',
        name: raw.name,
        exchange: raw.exchange,
        volume: raw.volume,
        marketTime: raw.marketTime,
        series: Array.isArray(raw.series) ? raw.series : [],
        at: new Date().toISOString(),
      };
      quotes.set(key, quote);
      memCache.set(key, quote);
      writeDiskCache(key, quote);
      got.add(key);
    }
  }

  for (const sym of unique) {
    if (got.has(sym)) continue;
    const cached = getCachedMarketQuote(sym);
    if (cached) {
      quotes.set(sym, { ...cached, stale: true });
      fromCache.push(sym);
    } else {
      failed.push(sym);
    }
  }

  return { quotes, failed, fromCache, at: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Cálculos derivados (puros)
// ---------------------------------------------------------------------------

export interface OverviewRow {
  symbol: string;
  label: string;
  quote: MarketQuote | null;
}

export interface OverviewGroup {
  id: string;
  label: string;
  rows: OverviewRow[];
  advancers: number;
  decliners: number;
}

/** Monta o painel cross-asset (Environment) a partir das cotações. */
export function buildOverview(quotes: Map<string, MarketQuote>, groups: MarketGroup[] = MARKET_GROUPS): OverviewGroup[] {
  return groups.map((g) => {
    const rows: OverviewRow[] = g.items.map((it) => ({
      symbol: it.symbol,
      label: it.label,
      quote: quotes.get(it.symbol.toUpperCase()) ?? null,
    }));
    let advancers = 0;
    let decliners = 0;
    for (const r of rows) {
      if (r.quote?.changePct == null) continue;
      if (r.quote.changePct > 0) advancers += 1;
      else if (r.quote.changePct < 0) decliners += 1;
    }
    return { id: g.id, label: g.label, rows, advancers, decliners };
  });
}

export interface RiskComposite {
  score: number; // -1 (risk-off) .. +1 (risk-on)
  riskOn: { symbol: string; changePct: number }[];
  riskOff: { symbol: string; changePct: number }[];
  label: string;
}

/** Composite de apetite a risco (média de risk-on vs risk-off), -1..+1. */
export function buildRiskComposite(quotes: Map<string, MarketQuote>): RiskComposite {
  const on: { symbol: string; changePct: number }[] = [];
  const off: { symbol: string; changePct: number }[] = [];
  for (const [sym, q] of quotes) {
    if (q.changePct == null) continue;
    const v = RISK_OFF_SYMBOLS.has(sym) ? -q.changePct : RISK_ON_SYMBOLS.has(sym) ? q.changePct : null;
    if (v == null) continue;
    const row = { symbol: sym, changePct: q.changePct };
    if (RISK_OFF_SYMBOLS.has(sym)) off.push(row);
    else on.push(row);
  }
  const mean = (arr: { changePct: number }[], invert = false) => {
    if (arr.length === 0) return null;
    const m = arr.reduce((s, r) => s + r.changePct, 0) / arr.length;
    return invert ? -m : m;
  };
  const onMean = mean(on);
  const offMean = mean(off, true);
  const parts = [onMean, offMean].filter((v): v is number => v != null);
  const score = parts.length ? parts.reduce((s, v) => s + v, 0) / parts.length : 0;
  const label = score > 0.0025 ? 'RISK-ON' : score < -0.0025 ? 'RISK-OFF' : 'MISTO';
  return { score, riskOn: on, riskOff: off, label };
}

export interface HeatmapTile {
  symbol: string;
  name: string;
  weight: number;
  price: number;
  changePct: number;
}

export interface HeatmapSector {
  id: string;
  label: string;
  short: string;
  etf: string;
  etfChangePct: number | null;
  weight: number;
  advancers: number;
  decliners: number;
  tiles: HeatmapTile[];
}

/** Monta o heatmap (setores → nomes) ponderado por peso/cap. */
export function buildHeatmap(quotes: Map<string, MarketQuote>): HeatmapSector[] {
  return SECTORS.map((s) => {
    const members = SECTOR_CONSTITUENTS[s.id] ?? [];
    const tiles: HeatmapTile[] = [];
    let advancers = 0;
    let decliners = 0;
    let weight = 0;
    for (const c of members) {
      const q = quotes.get(c.symbol.toUpperCase());
      if (!q || q.changePct == null) continue;
      if (q.changePct > 0) advancers += 1;
      else if (q.changePct < 0) decliners += 1;
      weight += c.weight;
      tiles.push({
        symbol: c.symbol,
        name: c.name,
        weight: c.weight,
        price: q.price,
        changePct: q.changePct,
      });
    }
    const etfQuote = quotes.get(s.etf.toUpperCase());
    return {
      id: s.id,
      label: s.label,
      short: s.short,
      etf: s.etf,
      etfChangePct: etfQuote?.changePct ?? null,
      weight,
      advancers,
      decliners,
      tiles: tiles.sort((a, b) => b.weight - a.weight),
    };
  })
    .filter((s) => s.tiles.length > 0)
    .sort((a, b) => b.weight - a.weight);
}

export interface BreadthRow {
  id: string;
  label: string;
  advancers: number;
  decliners: number;
  total: number;
  pctAbove: number; // 0..1
  etfChangePct: number | null;
}

/** Breadth por setor: % de nomes acima do fechamento anterior. */
export function buildBreadth(quotes: Map<string, MarketQuote>, sectors: HeatmapSector[]): BreadthRow[] {
  return sectors.map((s) => {
    const total = s.advancers + s.decliners;
    return {
      id: s.id,
      label: s.label,
      advancers: s.advancers,
      decliners: s.decliners,
      total,
      pctAbove: total > 0 ? s.advancers / total : 0,
      etfChangePct: s.etfChangePct,
    };
  });
}

export interface Mover {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePct: number;
  volume: number | null;
}

export interface MoversResult {
  gainers: Mover[];
  losers: Mover[];
  mostActive: Mover[];
  unusual: Mover[];
  universeSize: number;
  advancers: number;
  decliners: number;
}

/** Movers: maiores altas/baixas, mais negociadas e movimentos incomuns. */
export function buildMovers(quotes: Map<string, MarketQuote>, topN = 12): MoversResult {
  const all: Mover[] = [];
  let advancers = 0;
  let decliners = 0;
  for (const c of CONSTITUENTS) {
    const q = quotes.get(c.symbol.toUpperCase());
    if (!q || q.changePct == null) continue;
    if (q.changePct > 0) advancers += 1;
    else if (q.changePct < 0) decliners += 1;
    all.push({
      symbol: c.symbol,
      name: c.name,
      sector: c.sector,
      price: q.price,
      changePct: q.changePct,
      volume: q.volume,
    });
  }
  const byChange = [...all].sort((a, b) => b.changePct - a.changePct);
  const gainers = byChange.slice(0, topN);
  const losers = byChange.slice(-topN).reverse();
  const mostActive = [...all]
    .filter((m) => m.volume != null)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, topN);
  // Incomuns: maior |variação| absoluta.
  const unusual = [...all].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, topN);
  return { gainers, losers, mostActive, unusual, universeSize: all.length, advancers, decliners };
}

export interface BreadthDetail {
  advancers: number;
  decliners: number;
  unchanged: number;
  total: number;
  pctAbove: number; // 0..1
  adLine: number; // advancers - decliners
  avgChangePct: number;
  medianChangePct: number;
  upVolume: number;
  downVolume: number;
  volumeRatio: number | null; // upVol / (upVol+downVol)
  distribution: { label: string; count: number; up: boolean }[];
  sectors: BreadthRow[];
}

const DIST_BUCKETS: { label: string; min: number; max: number; up: boolean }[] = [
  { label: '< -3%', min: -Infinity, max: -0.03, up: false },
  { label: '-3..-2%', min: -0.03, max: -0.02, up: false },
  { label: '-2..-1%', min: -0.02, max: -0.01, up: false },
  { label: '-1..0%', min: -0.01, max: 0, up: false },
  { label: '0..1%', min: 0, max: 0.01, up: true },
  { label: '1..2%', min: 0.01, max: 0.02, up: true },
  { label: '2..3%', min: 0.02, max: 0.03, up: true },
  { label: '> 3%', min: 0.03, max: Infinity, up: true },
];

/** Breadth detalhado do universo de ações (adv/dec, distribuição, volume). */
export function buildBreadthDetail(quotes: Map<string, MarketQuote>): BreadthDetail {
  const changes: number[] = [];
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let upVolume = 0;
  let downVolume = 0;
  for (const c of CONSTITUENTS) {
    const q = quotes.get(c.symbol.toUpperCase());
    if (!q || q.changePct == null) continue;
    changes.push(q.changePct);
    if (q.changePct > 0) advancers += 1;
    else if (q.changePct < 0) decliners += 1;
    else unchanged += 1;
    if (q.volume != null) {
      if (q.changePct > 0) upVolume += q.volume;
      else if (q.changePct < 0) downVolume += q.volume;
    }
  }
  const total = advancers + decliners + unchanged;
  const sorted = [...changes].sort((a, b) => a - b);
  const median = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : 0;
  const avg = changes.length ? changes.reduce((s, v) => s + v, 0) / changes.length : 0;
  const distribution = DIST_BUCKETS.map((b) => ({
    label: b.label,
    up: b.up,
    count: changes.filter((v) => v > b.min && v <= b.max).length,
  }));
  const volSum = upVolume + downVolume;
  const sectors = buildBreadth(quotes, buildHeatmap(quotes));
  return {
    advancers,
    decliners,
    unchanged,
    total,
    pctAbove: total ? advancers / total : 0,
    adLine: advancers - decliners,
    avgChangePct: avg,
    medianChangePct: median,
    upVolume,
    downVolume,
    volumeRatio: volSum > 0 ? upVolume / volSum : null,
    distribution,
    sectors,
  };
}

/** Converte um `Quote` do priceService (B3/cripto) p/ `MarketQuote` (sem série). */
export function fromPriceQuote(q: PriceQuote): MarketQuote {
  return {
    symbol: q.symbol,
    price: q.price,
    previousClose: null,
    change: null,
    changePct: null,
    currency: q.currency,
    name: null,
    exchange: q.source,
    volume: null,
    marketTime: Date.parse(q.at) || null,
    series: [],
    at: q.at,
  };
}
