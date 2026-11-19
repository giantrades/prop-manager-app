// CRYPTO — motor do painel cripto (majors). READ-ONLY. Yahoo (BTC-USD etc.) via o
// mesmo `fetchMarketQuotes`. Sem dominância global (exigiria CoinGecko global).
//
// Fonte: DOCS/10_MODULES/market/00-spec.md.

import type { MarketQuote } from './marketData';

export interface CryptoDef {
  symbol: string;
  label: string;
}

export const CRYPTO_MAJORS: CryptoDef[] = [
  { symbol: 'BTC-USD', label: 'Bitcoin' },
  { symbol: 'ETH-USD', label: 'Ethereum' },
  { symbol: 'SOL-USD', label: 'Solana' },
  { symbol: 'BNB-USD', label: 'BNB' },
  { symbol: 'XRP-USD', label: 'XRP' },
  { symbol: 'ADA-USD', label: 'Cardano' },
  { symbol: 'DOGE-USD', label: 'Dogecoin' },
  { symbol: 'AVAX-USD', label: 'Avalanche' },
  { symbol: 'LINK-USD', label: 'Chainlink' },
  { symbol: 'DOT-USD', label: 'Polkadot' },
  { symbol: 'LTC-USD', label: 'Litecoin' },
  { symbol: 'BCH-USD', label: 'Bitcoin Cash' },
];

export const CRYPTO_SYMBOLS: string[] = CRYPTO_MAJORS.map((c) => c.symbol);

export interface CryptoCoin {
  symbol: string;
  label: string;
  price: number;
  changePct: number | null;
  volume: number | null;
  series: Array<[number, number]>;
}

export interface CryptoBoard {
  coins: CryptoCoin[];
  advancers: number;
  decliners: number;
  unchanged: number;
  avgChangePct: number | null;
  total: number;
}

/** Painel cripto a partir das cotações (ordem = `CRYPTO_MAJORS`). */
export function buildCryptoBoard(quotes: Map<string, MarketQuote>): CryptoBoard {
  const coins: CryptoCoin[] = [];
  for (const def of CRYPTO_MAJORS) {
    const q = quotes.get(def.symbol.toUpperCase());
    if (!q) continue;
    coins.push({
      symbol: def.symbol,
      label: def.label,
      price: q.price,
      changePct: q.changePct,
      volume: q.volume,
      series: q.series,
    });
  }

  const changed = coins.filter((c) => c.changePct != null) as (CryptoCoin & { changePct: number })[];
  const advancers = changed.filter((c) => c.changePct > 0.0005).length;
  const decliners = changed.filter((c) => c.changePct < -0.0005).length;
  const unchanged = changed.length - advancers - decliners;
  const avgChangePct = changed.length > 0 ? changed.reduce((a, c) => a + c.changePct, 0) / changed.length : null;

  return { coins, advancers, decliners, unchanged, avgChangePct, total: changed.length };
}
