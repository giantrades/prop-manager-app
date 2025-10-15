// packages/journal-state/src/finance.js
export function vwap(executions = []) {
  const fills = executions.filter(e => e.side === 'entry' || e.side === 'buy' || e.side === 'sell');
  const totalQty = fills.reduce((s, e) => s + (e.quantity || 0), 0);
  if (!totalQty) return 0;
  const wsum = fills.reduce((s, e) => s + (e.price || 0) * (e.quantity || 0), 0);
  return wsum / totalQty;
}

export function pnlGross({ entryPrice, exitPrice, direction, volume = 1, contractMultiplier = 1, pointValue = 1 }) {
  const sign = direction === 'Short' ? -1 : 1;
  return (exitPrice - entryPrice) * sign * volume * contractMultiplier * pointValue;
}

export function pnlNet(pnlGrossValue, costs = {}) {
  const { commission = 0, fees = 0, swap = 0, slippage = 0 } = costs || {};
  return pnlGrossValue - (commission + fees + swap + slippage);
}

export function resultR(pnlNetValue, riskPerR) {
  if (!riskPerR) return 0;
  return pnlNetValue / riskPerR;
}
