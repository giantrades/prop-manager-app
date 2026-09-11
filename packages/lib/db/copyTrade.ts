// STAGE 3 — Copy-trade. `Account { copyGroup?, copyMultiplier?, lotStep? }`.
// Ao abrir posição numa conta-mestre com copyGroup:
//   1. UI mostra preview "vai replicar para X ×0.5, Y ×1" ANTES de enviar.
//   2. Cada réplica calcula `qty = qtyOriginal * copyMultiplier`, arredondado pro
//      `lotStep` da conta de destino (nunca lote fracionário abaixo do mínimo).
//   3. Cada réplica é uma chamada /positions/open separada com seu próprio
//      clientOrderId — nunca uma "ordem em lote" tratada como atômica.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/03-mobile-trading-PWA.md (T-M4) + 04-BRIDGE_V2_SPEC.md.

import type { Account } from './types';

export interface CopyTarget {
  account: Account;
  /** qty efetiva para esta réplica (arredondada ao lotStep). */
  qty: number;
  /** qty bruta (qtyOriginal * multiplier) antes do arredondamento. */
  rawQty: number;
  multiplier: number;
  /** true se a qty precisou ser arredondada. */
  rounded: boolean;
}

export interface CopyPreview {
  master: Account;
  targets: CopyTarget[];
  /** Nenhuma réplica possível (sem conta de destino válida). */
  none: boolean;
}

/** Arredonda a qty ao menor incremento negociável (`lotStep`). */
export function roundToLotStep(qty: number, lotStep?: number): { qty: number; rounded: boolean } {
  if (!lotStep || lotStep <= 0) return { qty: qty, rounded: false };
  // Escala pra evitar erro de ponto flutuante (ex.: 0.35/0.1 = 3.4999...).
  const scale = 1e6;
  const stepScaled = Math.round(lotStep * scale);
  const qtyScaled = Math.round(qty * scale);
  const steps = Math.round(qtyScaled / stepScaled);
  const roundedQty = (steps * stepScaled) / scale;
  return { qty: Number(roundedQty.toFixed(6)), rounded: Math.abs(roundedQty - qty) > 1e-9 };
}

/**
 * Contas de destino do copy-trade: todas as contas com o MESMO `copyGroup` da conta
 * mestra, exceto a própria. Aplica `copyMultiplier` e `lotStep` de cada destino.
 */
export function previewCopyTrade(master: Account, accounts: Account[], qtyOriginal: number): CopyPreview {
  if (!master.copyGroup) {
    return { master, targets: [], none: true };
  }
  const targets: CopyTarget[] = [];
  for (const acc of accounts) {
    if (acc.id === master.id) continue;
    if (acc.copyGroup !== master.copyGroup) continue;
    const multiplier = acc.copyMultiplier ?? 1;
    const rawQty = qtyOriginal * multiplier;
    const { qty, rounded } = roundToLotStep(rawQty, acc.lotStep);
    if (qty <= 0) continue;
    targets.push({ account: acc, qty, rawQty, multiplier, rounded });
  }
  return { master, targets, none: targets.length === 0 };
}

/** Mensagem de preview (ex.: "vai replicar para E8 50K ×0.5, Apex ×1"). */
export function copyPreviewMessage(preview: CopyPreview): string {
  if (preview.none) return 'Sem réplicas (nenhuma conta no mesmo copyGroup)';
  return preview.targets
    .map((t) => `${t.account.name} ×${t.multiplier}${t.rounded ? ' (≈' + t.qty + ')' : ''}`)
    .join(', ');
}

/** Interface mínima de envio de ordem (testável; production = QuantowerAdapter). */
export interface OrderSender {
  openPosition(params: {
    accountId: string;
    symbol: string;
    side: 'buy' | 'sell';
    qty: number;
    sl?: number | null;
    tp?: number | null;
    note?: string | null;
    clientOrderId: string;
  }): Promise<unknown>;
}

export interface ExecuteCopyOptions {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  sl?: number | null;
  tp?: number | null;
  note?: string | null;
  /** Gerador de clientOrderId (UUID). Default: usa um contador + random. */
  newClientOrderId?: () => string;
}

export interface ExecuteCopyResult {
  sent: Array<{ accountId: string; qty: number; clientOrderId: string; ok: boolean; error?: string }>;
  failed: number;
}

/**
 * Executa o copy-trade: envia uma ordem por conta de destino, cada uma com seu
 * próprio clientOrderId. Se uma falha, NÃO desfaz as outras (só reporta).
 */
export async function executeCopyTrade(
  sender: OrderSender,
  master: Account,
  accounts: Account[],
  opts: ExecuteCopyOptions,
): Promise<ExecuteCopyResult> {
  const preview = previewCopyTrade(master, accounts, opts.qty);
  const gen = opts.newClientOrderId || (() => `coid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  const sent: ExecuteCopyResult['sent'] = [];
  let failed = 0;
  for (const target of preview.targets) {
    const clientOrderId = gen();
    try {
      await sender.openPosition({
        accountId: target.account.id,
        symbol: opts.symbol,
        side: opts.side,
        qty: target.qty,
        sl: opts.sl ?? null,
        tp: opts.tp ?? null,
        note: opts.note ?? null,
        clientOrderId,
      });
      sent.push({ accountId: target.account.id, qty: target.qty, clientOrderId, ok: true });
    } catch (err) {
      failed += 1;
      sent.push({
        accountId: target.account.id,
        qty: target.qty,
        clientOrderId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { sent, failed };
}
