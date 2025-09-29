// @apps/trading-journal/src/types/monteCarlo.ts
export type MonteCarloConfig = {
  id?: string;
  name?: string;
  strategy?: string | null;
  category?: string | null;

  simulations: number; // ex: 10_000
  maxTradesPerRun: number; // ex: 500
  tradesPerYear?: number; // used to annualize, default 252
  winProb: number; // 0..1
  expectancyR: number; // expectancy in R (average R per trade)
  riskPerTradePct?: number; // if using % of equity (0..1)
  riskPerTradeValue?: number; // optional fixed dollar risk
  initialCapital: number; // $
  seed?: number;
  createdAt?: string;
};

export type MonteCarloRun = {
  id: number;
  equitySeries: number[]; // equity by trade index
  returnsPerTrade: number[]; // return per trade (fractional, e.g. 0.02)
  tradesSimulated: number;
  maxDrawdown?: number;
  finalEquity: number;
};

export type MonteCarloSummary = {
  avgFinal: number;
  medianFinal: number;
  p05: number;
  p25: number; // 💥 NOVO: 25th percentile
  p75: number; // 💥 NOVO: 75th percentile
  p95: number;
  cagr: number;
  maxDrawdown: number;
  calmar: number;
  sharpe: number;
  sortino: number;
  profitFactor: number;
  expectedValue: number; // per trade in $
  skewness: number;
  kurtosis: number;
  probRuin: number; // fraction 0..1
  totalRuns: number;
  runsSample?: Partial<MonteCarloRun>[];
  simulationsCompleted: number;
};

export type MonteCarloHistoryItem = {
  id: string;
  config: MonteCarloConfig;
  summary: MonteCarloSummary;
  createdAt: string;
  driveFileId?: string;
  sampleRuns?: MonteCarloRun[] | null
};
