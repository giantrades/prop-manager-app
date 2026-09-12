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

/** Formata um valor monetário na moeda de exibição (compacto p/ >= 1000). */
export function fmtMoney(value: unknown, from?: string, decimals = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const v = convertMoney(Number(value), from);
  const symbol = SYMBOL[state.currency];
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(decimals)}k`;
  return `${sign}${symbol}${abs.toFixed(decimals)}`;
}

/** Símbolo da moeda de exibição ('$' ou 'R$'). */
export function displaySymbol(): string {
  return SYMBOL[state.currency];
}

/** Formata um valor que JÁ está na moeda de exibição (não converte de novo). */
export function fmtDisplay(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const symbol = SYMBOL[state.currency];
  const v = Number(value);
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}${symbol}${(abs / 1000).toFixed(decimals)}k`;
  return `${sign}${symbol}${abs.toFixed(decimals)}`;
}

/** Converte vários [valor, moedaDeOrigem] e soma na moeda de exibição. */
export function sumConverted(items: Array<[number, string | undefined]>): number {
  return items.reduce((s, [v, from]) => s + convertMoney(Number(v) || 0, from), 0);
}
