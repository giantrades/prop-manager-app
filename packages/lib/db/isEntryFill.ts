// STAGE 2 — isEntryFill ÚNICO. Dedup hoje espalhado em 5 arquivos do código antigo
// (push.ts:165, pull.ts:55, usePlatform.js:174, platformManager.js:245,486).
// Aqui é a única definição. Proibido reimplementar.

export interface EntryFillCandidate {
  netPnl?: number | null;
  resultNet?: number | null;
  result_net?: number | null;
  exitDatetime?: string | null;
  exit_datetime?: string | null;
  entryDatetime?: string | null;
  entry_datetime?: string | null;
  exitPrice?: number | null;
  exit_price?: number | null;
}

/**
 * Um trade é "entry fill" (execução parcial que não deve contar como trade fechado)
 * quando:
 *   netPnl === 0  E  (não tem exit datetime, ou exit é "0001-...", ou exit === entry,
 *                    ou não tem exit price)
 * Aceita os campos em camelCase OU snake_case (dado antigo nasce inconsistente).
 */
export function isEntryFill(trade: EntryFillCandidate): boolean {
  if (!trade) return false;
  const netPnl = Number(trade.netPnl ?? trade.resultNet ?? trade.result_net ?? 0);
  if (netPnl !== 0) return false;

  const exitDt = trade.exitDatetime || trade.exit_datetime;
  const entryDt = trade.entryDatetime || trade.entry_datetime;
  const exitPr = trade.exitPrice ?? trade.exit_price;

  return (
    !exitDt ||
    String(exitDt).startsWith('0001') ||
    (entryDt != null && exitDt === entryDt) ||
    exitPr == null ||
    Number.isNaN(Number(exitPr))
  );
}

/** Retorna true se o trade deve ser mantido (não é entry fill). */
export function shouldKeepTrade(trade: EntryFillCandidate): boolean {
  return !isEntryFill(trade);
}
