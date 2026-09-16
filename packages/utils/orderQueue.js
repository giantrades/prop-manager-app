// #6 — Fila offline de ordens (camada do APP). O Service Worker não intercepta mais
// requisições cross-origin (bridge), então a fila de escrita vive aqui.
//
// Regra: NUNCA finge sucesso. Se a ponte está offline, a operação entra na fila
// (localStorage, device-local) com um `clientOrderId` estável; ao voltar a conexão,
// a fila é reexecutada em ordem e o bridge deduplica por esse id.
//
// Nada de fórmula/estado financeiro aqui — é transporte de ordens.

export const ORDER_QUEUE_KEY = 'bridge:orderQueue';
const MAX_ITEMS = 50;

function defaultStorage() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** idempotência: mesmo id reenviado = mesma ordem no bridge. */
export function newClientOrderId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `coid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readQueue(storage = defaultStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(ORDER_QUEUE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function writeQueue(queue, storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.setItem(ORDER_QUEUE_KEY, JSON.stringify((queue || []).slice(-MAX_ITEMS)));
  } catch {
    /* quota/indisponível: mantém em memória */
  }
}

export function enqueue(op, storage = defaultStorage()) {
  const queue = readQueue(storage);
  const item = {
    id: op.id || newClientOrderId(),
    kind: op.kind,
    payload: { ...(op.payload || {}), clientOrderId: op.clientOrderId || (op.payload || {}).clientOrderId || newClientOrderId() },
    createdAt: new Date().toISOString(),
  };
  queue.push(item);
  writeQueue(queue, storage);
  return item;
}

export function clearQueue(storage = defaultStorage()) {
  writeQueue([], storage);
}

/** Erro de indisponibilidade (rede/timeout/bridge) — os demais NÃO vão para a fila. */
export function isOfflineError(err) {
  if (!err) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'TypeError' ||
    err.name === 'BridgeQueuedError' ||
    err.code === 'bridge_offline'
  );
}

const RUNNERS = {
  open: (adapter, p) => adapter.openPosition(p),
  modify: (adapter, p) => adapter.modifyPosition(p),
  close: (adapter, p) => adapter.closePosition({ platformPositionId: p.platformPositionId }, p.clientOrderId),
  place: (adapter, p) => adapter.placeOrder(p),
  cancel: (adapter, p) => adapter.cancelOrder(p),
};

/** Executa uma operação da fila no adapter (mapeia kind → método). */
export async function runOp(adapter, op) {
  const fn = RUNNERS[op.kind];
  if (!fn) throw new Error(`operação desconhecida: ${op.kind}`);
  return fn(adapter, op.payload || {});
}

/**
 * Tenta executar; se a ponte estiver offline, enfileira (com clientOrderId estável)
 * e devolve `{ queued: true }`. Erros reais (validação/auth) são relançados.
 */
export async function submitOrQueue(adapter, op, storage = defaultStorage()) {
  const clientOrderId = op.clientOrderId || (op.payload || {}).clientOrderId || newClientOrderId();
  const full = { ...op, clientOrderId, payload: { ...(op.payload || {}), clientOrderId } };
  try {
    const result = await runOp(adapter, full);
    return { queued: false, result };
  } catch (err) {
    if (isOfflineError(err)) {
      const item = enqueue(full, storage);
      return { queued: true, item };
    }
    throw err;
  }
}

/**
 * Reexecuta a fila em ordem. Para no primeiro erro de conexão (mantém o restante);
 * erros reais descartam aquele item para não travar a fila para sempre.
 */
export async function flushQueue(adapter, storage = defaultStorage()) {
  const queue = readQueue(storage);
  if (!queue.length) return { sent: 0, remaining: 0, dropped: 0 };
  const remaining = [...queue];
  let sent = 0;
  let dropped = 0;
  while (remaining.length) {
    const op = remaining[0];
    try {
      await runOp(adapter, op);
      remaining.shift();
      sent += 1;
    } catch (err) {
      remaining.shift();
      if (isOfflineError(err)) {
        remaining.unshift(op); // bridge ainda offline: para e mantém a ordem
        break;
      }
      dropped += 1; // erro real: descarta
    }
  }
  writeQueue(remaining, storage);
  return { sent, remaining: remaining.length, dropped };
}
