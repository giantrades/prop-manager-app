// SCANNER + CRYPTO — builders puros (screener e painel cripto).
import { describe, it, expect } from 'vitest';
import type { MarketQuote } from '../marketData';
import { CONSTITUENTS } from '../marketData';
import { buildScreener, applyPreset, DEFAULT_SCREENER_FILTERS } from '../marketScanner';
import { buildCryptoBoard } from '../marketCrypto';
import { compileCustomFields } from '../customFields';
import { FUNDAMENTAL_FIELD_KEYS } from '../fundamentals';

const T = Date.UTC(2026, 0, 2);

function q(symbol: string, price: number, changePct: number | null, volume: number | null = null): MarketQuote {
  return {
    symbol: symbol.toUpperCase(),
    price,
    previousClose: price,
    change: 0,
    changePct,
    currency: 'USD',
    name: `${symbol} Inc`,
    exchange: 'X',
    volume,
    marketTime: T,
    series: [[T, price]],
    at: new Date(T).toISOString(),
  };
}

function map(...quotes: MarketQuote[]): Map<string, MarketQuote> {
  const m = new Map<string, MarketQuote>();
  for (const x of quotes) m.set(x.symbol, x);
  return m;
}

describe('buildScreener', () => {
  const quotes = map(
    q('NVDA', 100, 0.03, 2_000_000),
    q('AAPL', 200, -0.01, 100_000),
    q('XLK', 150, 0.02, 500_000),
  );

  it('universo ações exclui ETFs e ordena por variação desc', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, universe: 'stocks' });
    expect(r.rows.map((x) => x.symbol)).toEqual(['NVDA', 'AAPL']);
    expect(r.matched).toBe(2);
    expect(r.universeTotal).toBe(CONSTITUENTS.length);
  });

  it('filtra em alta e por variação mínima', () => {
    const up = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, direction: 'up' });
    expect(up.rows.map((x) => x.symbol)).toEqual(['NVDA']);
    const min = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, minChangePct: 0.02 });
    expect(min.rows.map((x) => x.symbol)).toEqual(['NVDA']);
  });

  it('busca por símbolo/nome e filtra volume', () => {
    const byQuery = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, query: 'aapl' });
    expect(byQuery.rows.map((x) => x.symbol)).toEqual(['AAPL']);
    const byVol = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, minVolume: 1_000_000 });
    expect(byVol.rows.map((x) => x.symbol)).toEqual(['NVDA']);
  });

  it('universo setores usa os ETFs SPDR', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, universe: 'sectors' });
    expect(r.rows.map((x) => x.symbol)).toEqual(['XLK']);
  });

  it('respeita o limite', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, limit: 1 });
    expect(r.rows).toHaveLength(1);
    expect(r.matched).toBe(2);
  });

  it('ignora cotações sem variação e devolve vazio sem correspondência', () => {
    const m = map(q('NVDA', 100, null));
    expect(buildScreener(m).rows).toHaveLength(0);
    expect(buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, query: 'ZZZZ' }).rows).toHaveLength(0);
  });
});

describe('buildCryptoBoard', () => {
  it('conta avanços/quedas/estáveis e calcula média', () => {
    const m = map(
      q('BTC-USD', 60000, 0.02),
      q('ETH-USD', 3000, -0.01),
      q('SOL-USD', 150, 0),
    );
    const b = buildCryptoBoard(m);
    expect(b.coins.map((c) => c.symbol)).toEqual(['BTC-USD', 'ETH-USD', 'SOL-USD']);
    expect(b.advancers).toBe(1);
    expect(b.decliners).toBe(1);
    expect(b.unchanged).toBe(1);
    expect(b.avgChangePct).toBeCloseTo((0.02 - 0.01) / 3);
  });

  it('ignora moedas sem cotação', () => {
    const b = buildCryptoBoard(map(q('BTC-USD', 60000, 0.01)));
    expect(b.coins).toHaveLength(1);
    expect(b.total).toBe(1);
  });
});

describe('buildScreener — métricas de 5d', () => {
  function q5(symbol: string, price: number, changePct: number, closes: number[]): MarketQuote {
    const series = closes.map((c, i) => [T + i * 86400000, c] as [number, number]);
    const quote = q(symbol, price, changePct, 1_000_000);
    return { ...quote, series };
  }

  it('calcula variação, high/low e distância de 5d', () => {
    const m = map(q5('NVDA', 110, 0.02, [100, 102, 104, 103, 110]));
    const [row] = buildScreener(m).rows;
    expect(row.change5d).toBeCloseTo(0.1);
    expect(row.high5d).toBeCloseTo(110);
    expect(row.low5d).toBeCloseTo(100);
    expect(row.offHigh5d).toBeCloseTo(0);
    expect(row.offLow5d).toBeCloseTo(0.1);
  });

  it('ordena por near high/low', () => {
    const m = map(
      q5('NVDA', 110, 0.01, [100, 101, 102, 103, 110]), // no topo
      q5('AAPL', 101, 0.01, [100, 103, 104, 105, 101]), // perto do fundo
    );
    const nearHigh = buildScreener(m, { ...DEFAULT_SCREENER_FILTERS, sortBy: 'offHigh5d', sortDir: 'asc' });
    expect(nearHigh.rows[0].symbol).toBe('NVDA');
    const nearLow = buildScreener(m, { ...DEFAULT_SCREENER_FILTERS, sortBy: 'offLow5d', sortDir: 'asc' });
    expect(nearLow.rows[0].symbol).toBe('AAPL');
  });
});

describe('buildScreener — filtros ampliados', () => {
  const quotes = map(
    q('NVDA', 100, 0.03, 2_000_000),
    q('AAPL', 200, -0.01, 100_000),
    q('XLK', 150, 0.02, 500_000),
    q('IWF', 300, 0.04, 50_000),
  );

  it('filtra por faixa de preço e variação máxima', () => {
    expect(buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, minPrice: 150 }).rows.map((r) => r.symbol).sort()).toEqual(['AAPL']);
    expect(buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, maxPrice: 150 }).rows.map((r) => r.symbol).sort()).toEqual(['NVDA']);
    expect(buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, maxChangePct: 0 }).rows.map((r) => r.symbol)).toEqual(['AAPL']);
  });

  it('filtra por setor', () => {
    expect(buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, sector: 'tech' }).rows.map((r) => r.symbol).sort()).toEqual(['AAPL', 'NVDA']);
    expect(buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, sector: 'energy' }).rows).toHaveLength(0);
  });

  it('universo cestas e tudo incluem ETFs de tema/fator', () => {
    const baskets = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, universe: 'baskets' });
    expect(baskets.rows.map((r) => r.symbol).sort()).toEqual(['IWF', 'NVDA', 'XLK']);
    const all = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, universe: 'all' });
    expect(all.rows.map((r) => r.symbol).sort()).toEqual(['AAPL', 'IWF', 'NVDA', 'XLK']);
  });

  it('reporta cobertura (withData)', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, universe: 'all' });
    expect(r.withData).toBe(4);
    expect(r.universeTotal).toBeGreaterThanOrEqual(4);
  });
});

describe('applyPreset', () => {
  it('configura cada preset de mercado', () => {
    expect(applyPreset('gainers')).toMatchObject({ direction: 'up', sortBy: 'changePct', sortDir: 'desc' });
    expect(applyPreset('losers')).toMatchObject({ direction: 'down', sortBy: 'changePct', sortDir: 'asc' });
    expect(applyPreset('volume')).toMatchObject({ sortBy: 'volume', sortDir: 'desc' });
    expect(applyPreset('movers')).toMatchObject({ sortBy: 'absChange', sortDir: 'desc' });
    expect(applyPreset('nearHigh')).toMatchObject({ sortBy: 'offHigh5d', sortDir: 'asc' });
    expect(applyPreset('nearLow')).toMatchObject({ sortBy: 'offLow5d', sortDir: 'asc' });
  });

  it('reset preserva o universo escolhido', () => {
    const base = { ...DEFAULT_SCREENER_FILTERS, universe: 'all' as const, query: 'nvda' };
    const reset = applyPreset('reset', base);
    expect(reset.universe).toBe('all');
    expect(reset.query).toBe('');
    expect(reset.sortBy).toBe('changePct');
  });
});

describe('buildScreener — linguagem de regras', () => {
  const quotes = map(
    q('NVDA', 100, 0.03, 2_000_000),
    q('AAPL', 200, -0.01, 100_000),
  );

  it('aplica a regra sobre o resultado', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, rules: 'change > 2 AND volume > 1M' });
    expect(r.rows.map((x) => x.symbol)).toEqual(['NVDA']);
    expect(r.ruleError).toBeNull();
  });

  it('regra inválida não quebra: reporta erro e ignora a regra', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, rules: 'change >' });
    expect(r.ruleError).not.toBeNull();
    expect(r.rows.map((x) => x.symbol).sort()).toEqual(['AAPL', 'NVDA']);
  });

  it('combina com os filtros do formulário', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, direction: 'up', rules: 'volume > 1M' });
    expect(r.rows.map((x) => x.symbol)).toEqual(['NVDA']);
  });

  it('applyPreset preserva as regras', () => {
    const base = { ...DEFAULT_SCREENER_FILTERS, rules: 'change > 2' };
    expect(applyPreset('gainers', base).rules).toBe('change > 2');
  });
});

describe('buildScreener � fundamentos e campos personalizados', () => {
  const quotes = map(
    q('NVDA', 100, 0.03, 2_000_000),
    q('AAPL', 200, -0.01, 100_000),
  );
  const fundamentalValues = new Map([
    ['NVDA', { pe: 20, revenuegrowth: 30 }],
    ['AAPL', { pe: 28, revenuegrowth: 5 }],
  ]);
  const extras = { fundamentalValues, fundamentalFields: FUNDAMENTAL_FIELD_KEYS };

  it('filtra pela regra de fundamentos separada', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, fundamentalRules: 'pe < 25' }, extras);
    expect(r.rows.map((x) => x.symbol)).toEqual(['NVDA']);
    expect(r.fundamentalRuleError).toBeNull();
  });

  it('fundamentos tamb�m funcionam na regra principal', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, rules: 'revenuegrowth > 10' }, extras);
    expect(r.rows.map((x) => x.symbol)).toEqual(['NVDA']);
    expect(r.ruleError).toBeNull();
  });

  it('erro na regra de fundamentos � reportado e ignorado', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, fundamentalRules: 'pe <' }, extras);
    expect(r.fundamentalRuleError).not.toBeNull();
    expect(r.rows.map((x) => x.symbol).sort()).toEqual(['AAPL', 'NVDA']);
  });

  it('campos personalizados entram na regra', () => {
    const customFields = compileCustomFields([{ id: 'dobro', expression: 'change * 2' }]);
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, rules: 'dobro > 0' }, { customFields });
    expect(r.rows.map((x) => x.symbol)).toEqual(['NVDA']);
    expect(r.ruleError).toBeNull();
  });

  it('regra de fundamentos sem feed (campos nulos) reprova tudo', () => {
    const r = buildScreener(quotes, { ...DEFAULT_SCREENER_FILTERS, fundamentalRules: 'pe < 25' }, { fundamentalFields: FUNDAMENTAL_FIELD_KEYS });
    expect(r.rows).toHaveLength(0);
    expect(r.fundamentalRuleError).toBeNull();
  });
});
