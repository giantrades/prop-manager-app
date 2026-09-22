// livePositionSlTp — deriva SL/TP de uma posição a partir das ORDENS PENDENTES, quando a
// plataforma não os expõe em `/positions` (comum: SL/TP viram ordens stop/limit separadas).
// Puro e testável: NÃO grava nada — só anexa `sl`/`tp` sugeridos e marca `slDerived`/`tpDerived`.
//
// Casamento em 2 níveis: (1) por `positionId` (forte); (2) fallback por
// conta+símbolo+lado oposto (desempate pela quantidade mais próxima — "contratos semelhantes").
// Classificação: ordem `stop` → SL; `limit` → TP; se o tipo não disser, pelo preço vs. abertura.

export interface LivePosition {
  platformPositionId?: string;
  positionId?: string;
  id?: string;
  symbol?: string;
  side?: string; // 'Long' | 'Short' | 'Buy' | 'Sell'
  quantity?: number;
  openPrice?: number;
  sl?: number | null;
  tp?: number | null;
  platformAccountId?: string;
  accountId?: string;
  [k: string]: unknown;
}

export interface LiveOrder {
  positionId?: string;
  symbol?: string;
  side?: string;
  type?: string; // adapter ('stop'|'limit'|...)
  orderTypeId?: string; // cru do bridge
  status?: string;
  price?: number;
  quantity?: number;
  remainingQuantity?: number;
  platformAccountId?: string;
  accountId?: string;
  [k: string]: unknown;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}
function isLong(side?: string): boolean {
  const s = String(side ?? '').toLowerCase();
  return s === 'long' || s === 'buy' || s === 'b' || s === 'compra';
}
function isShort(side?: string): boolean {
  const s = String(side ?? '').toLowerCase();
  return s === 'short' || s === 'sell' || s === 's' || s === 'venda';
}
function acctOf(x: { platformAccountId?: string; accountId?: string }): string {
  return String((x?.platformAccountId ?? x?.accountId ?? '') || '');
}
function normId(v: unknown): string {
  return String(v ?? '').replace(/^qt_pos_/, '');
}
function posIdOf(p: LivePosition): string {
  return normId(p.positionId ?? p.id ?? p.platformPositionId);
}

/** Ordem ainda válida (não preenchida/cancelada/expirada/rejeitada). */
function isWorking(o: LiveOrder): boolean {
  const st = String(o.status ?? '').toLowerCase();
  if (/filled|cancel|reject|expir|inactive|done/.test(st)) return false;
  const rem = Number(o.remainingQuantity);
  if (Number.isFinite(rem) && rem === 0 && !/pend|new|open|work|partial/.test(st)) return false;
  return true;
}

/** Classifica a ordem em SL/TP (tipo; fallback pelo preço vs. abertura). */
function kindOf(o: LiveOrder, entry: number | null, long: boolean): 'sl' | 'tp' | null {
  const t = String(o.type ?? o.orderTypeId ?? '').toLowerCase();
  if (t.includes('stop')) return 'sl';
  if (t.includes('limit')) return 'tp';
  const price = num(o.price);
  if (price == null || entry == null) return null;
  if (long) return price < entry ? 'sl' : price > entry ? 'tp' : null;
  return price > entry ? 'sl' : price < entry ? 'tp' : null;
}

function oppSide(o: LiveOrder, long: boolean): boolean {
  return long ? isShort(o.side) : isLong(o.side);
}
function qtyDist(o: LiveOrder, q: number): number {
  const oq = num(o.remainingQuantity) ?? num(o.quantity) ?? 0;
  return Math.abs(oq - q);
}

/**
 * Preenche `sl`/`tp` que faltarem nas posições, a partir das ordens pendentes.
 * Mantém os valores já vindos do bridge (`p.sl`/`p.tp`). Marca `slDerived`/`tpDerived`
 * quando o valor foi inferido das ordens (a UI mostra como "sugerido").
 */
export function mergeOrdersIntoPositions(
  positions: LivePosition[],
  orders: LiveOrder[],
): LivePosition[] {
  if (!Array.isArray(positions) || positions.length === 0) return positions ?? [];
  if (!Array.isArray(orders) || orders.length === 0) return positions;
  const working = orders.filter(isWorking);
  if (working.length === 0) return positions;

  const byPositionId = new Map<string, LiveOrder[]>();
  for (const o of working) {
    const pid = normId(o.positionId);
    if (!pid) continue;
    const arr = byPositionId.get(pid) ?? [];
    arr.push(o);
    byPositionId.set(pid, arr);
  }

  return positions.map((p) => {
    if (p.sl != null && p.tp != null) return p; // já completo (bridge populou)
    const long = isLong(p.side);
    if (!long && !isShort(p.side)) return p;
    const entry = num(p.openPrice);
    const q = Math.abs(Number(p.quantity) || 0);
    const pid = posIdOf(p);
    const pAcct = acctOf(p);

    let cands: LiveOrder[] = pid && byPositionId.has(pid)
      ? byPositionId.get(pid)!
      : working.filter((o) =>
        (!o.symbol || !p.symbol || String(o.symbol) === String(p.symbol)) &&
        (!acctOf(o) || !pAcct || acctOf(o) === pAcct),
      );

    cands = cands.filter((o) => oppSide(o, long) && num(o.price) != null);
    if (cands.length === 0) return p;

    let sl = p.sl ?? null;
    let tp = p.tp ?? null;
    const sorted = [...cands].sort((a, b) => qtyDist(a, q) - qtyDist(b, q));
    for (const o of sorted) {
      const price = num(o.price);
      if (price == null) continue;
      const k = kindOf(o, entry, long);
      if (k === 'sl' && sl == null) sl = price;
      else if (k === 'tp' && tp == null) tp = price;
      if (sl != null && tp != null) break;
    }

    if (sl === p.sl && tp === p.tp) return p;
    return {
      ...p,
      sl,
      tp,
      slDerived: p.sl == null && sl != null,
      tpDerived: p.tp == null && tp != null,
    };
  });
}
