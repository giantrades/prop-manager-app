// STAGE 2 — dateUtils único. Proibido `split('T')` ingênuo (confirmado em 10+ pontos
// do código antigo). Toda manipulação de data do novo app passa por aqui.

import {
  format,
  parseISO,
  startOfDay as dateFnsStartOfDay,
  addDays,
  differenceInDays,
} from 'date-fns';

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIsoDate(date: Date): string {
  return date.toISOString();
}

export function parseDate(value: string | Date | number): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  // Aceita ISO 8601. Nunca usamos split('T').
  return parseISO(value);
}

/** Retorna a data no formato ISO 8601 com timezone (z no final). */
export function formatIso(value: string | Date | number): string {
  return parseDate(value).toISOString();
}

/**
 * Início do dia (00:00) no fuso da própria firm. `timezoneOffsetMinutes` é o offset
 * em minutos em relação a UTC (ex.: São Paulo = -180). O navegador do usuário NÃO
 * decide isso — ver FINANCIAL_FORMULAS.md (dailyDD).
 */
export function startOfDayInTimezone(
  value: string | Date | number,
  timezoneOffsetMinutes = 0,
): Date {
  const d = parseDate(value);
  const shifted = new Date(d.getTime() + timezoneOffsetMinutes * 60_000);
  const utcStart = dateFnsStartOfDay(shifted);
  return new Date(utcStart.getTime() - timezoneOffsetMinutes * 60_000);
}

export function startOfDay(value: string | Date | number): Date {
  return dateFnsStartOfDay(parseDate(value));
}

export function daysBetween(a: string | Date, b: string | Date): number {
  return differenceInDays(parseDate(b), parseDate(a));
}

export function addDaysIso(value: string | Date | number, days: number): string {
  return addDays(parseDate(value), days).toISOString();
}

export function formatDate(value: string | Date | number, pattern = 'dd/MM/yyyy'): string {
  return format(parseDate(value), pattern);
}

export function formatDateTime(
  value: string | Date | number,
  pattern = "dd/MM/yyyy HH:mm",
): string {
  return format(parseDate(value), pattern);
}

export function isValidIso(value: string | Date): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const d = parseISO(value);
  return !Number.isNaN(d.getTime());
}

/** Compara duas strings ISO, retornando -1 | 0 | 1 (para ordenar por data). */
export function compareIso(a: string, b: string): number {
  const ta = parseDate(a).getTime();
  const tb = parseDate(b).getTime();
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}
