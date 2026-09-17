// Formatação de dinheiro reativa ao seletor de moeda (USD/BRL) do app.
// O `CurrencyProvider` (main-app) chama `setDisplayCurrency(currency, rate)`; qualquer
// componente que use `fmtMoney` re-renderiza quando a moeda muda (App assina o contexto).
//
// Uso: import { fmtMoney } from './currency'  (components ui)
//      import { fmtMoney } from '@apps/ui/currency'  (main-app)
//
// O 2º argumento é a MOEDA DE ORIGEM do valor (aceita '$'|'USD'|'R$'|'BRL').
// Converte para a moeda de exibição e formata. Sem isso, valores ficariam fixos.

export type DisplayCurrency = 'USD' | 'BRL';

type CurrencyState = { currency: DisplayCurrency; rate: number };
let state: CurrencyState = { currency: 'USD', rate: 5 };
const listeners = new Set<() => void>();

export function getCurrencyState(): CurrencyState {
  return state;
}

export function setDisplayCurrency(currency: DisplayCurrency, rate: number): void {
  const nextRate = Number(rate) > 0 ? Number(rate) : state.rate;
  if (state.currency === currency && state.rate === nextRate) return;
  state = { currency, rate: nextRate };
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function subscribeCurrency(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function sourceOf(cur?: string): DisplayCurrency {
  const c = String(cur ?? '').toUpperCase();
  if (c.includes('R$') || c.includes('BRL')) return 'BRL';
  return 'USD';
}

/** Converte `value` da moeda `from` para a moeda de exibição. */
export function convertMoney(value: number, from?: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const src = sourceOf(from);
  if (src === state.currency) return n;
  if (src === 'USD' && state.currency === 'BRL') return n * state.rate;
  if (src === 'BRL' && state.currency === 'USD') return state.rate > 0 ? n / state.rate : n;
  return n;
}

const SYMBOL: Record<DisplayCurrency, string> = { USD: '$', BRL: 'R$' };

const groupSep = () => (state.currency === 'BRL' ? '.' : ',');
const decSep = () => (state.currency === 'BRL' ? ',' : '.');

/** Número com separador de milhar (localizado por moeda): 1234.5 → "1.234,50". */
function groupNumber(abs: number, decimals: number): string {
  const fixed = Math.abs(abs).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep());
  return dec ? `${grouped}${decSep()}${dec}` : grouped;
}

/**
 * Formata um valor monetário na moeda de exibição — **valor COMPLETO** (sem "k"):
 * é dinheiro de verdade, precisa ser lido exato em tabelas/calendário.
 * Para rótulos curtos (eixos de gráfico) use `fmtMoneyCompact`.
 */
export function fmtMoney(value: unknown, from?: string, decimals = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const v = convertMoney(Number(value), from);
  return `${v < 0 ? '-' : ''}${SYMBOL[state.currency]}${groupNumber(v, decimals)}`;
}

/** Versão compacta (1.2k/3.4M) — só para rótulos apertados (eixos). */
export function fmtMoneyCompact(value: unknown, from?: string, decimals = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const v = convertMoney(Number(value), from);
  const symbol = SYMBOL[state.currency];
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(decimals)}k`;
  return `${sign}${symbol}${groupNumber(abs, decimals)}`;
}

/** Símbolo da moeda de exibição ('$' ou 'R$'). */
export function displaySymbol(): string {
  return SYMBOL[state.currency];
}

/** Formata um valor que JÁ está na moeda de exibição (não converte de novo). */
export function fmtDisplay(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const v = Number(value);
  return `${v < 0 ? '-' : ''}${SYMBOL[state.currency]}${groupNumber(v, decimals)}`;
}

/** Converte vários [valor, moedaDeOrigem] e soma na moeda de exibição. */
export function sumConverted(items: Array<[number, string | undefined]>): number {
  return items.reduce((s, [v, from]) => s + convertMoney(Number(v) || 0, from), 0);
}
