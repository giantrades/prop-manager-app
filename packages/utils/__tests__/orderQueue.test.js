import { describe, it, expect } from 'vitest';
import {
  ORDER_QUEUE_KEY, readQueue, enqueue, clearQueue, submitOrQueue, flushQueue, isOfflineError,
} from '../orderQueue.js';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => m,
  };
}

function fakeAdapter(offline = false) {
  const calls = [];
  let fail = offline;
  const rec = (name) => (arg) => {
    if (fail) {
      const e = new Error('bridge offline');
      e.name = 'TypeError';
      throw e;
    }
    calls.push({ name, arg });
    return { success: true };
  };
  return {
    calls,
    openPosition: rec('openPosition'),
    modifyPosition: rec('modifyPosition'),
    closePosition: rec('closePosition'),
    placeOrder: rec('placeOrder'),
    cancelOrder: rec('cancelOrder'),
    setOffline: (v) => { fail = v; },
  };
}

describe('#6 — fila offline de ordens', () => {
  it('offline: enfileira com clientOrderId estável e NÃO finge sucesso', async () => {
    const storage = memStorage();
    const adapter = fakeAdapter(true);
    const res = await submitOrQueue(adapter, { kind: 'place', payload: { accountId: 'a', symbol: 'EURUSD', side: 'buy', qty: 1, type: 'limit', price: 1.1 } }, storage);
    expect(res.queued).toBe(true);
    const q = readQueue(storage);
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe('place');
    expect(q[0].payload.clientOrderId).toBeTruthy();
  });

  it('online: executa direto e não enfileira', async () => {
    const storage = memStorage();
    const adapter = fakeAdapter(false);
    const res = await submitOrQueue(adapter, { kind: 'cancel', payload: { platformOrderId: 'o1' } }, storage);
    expect(res.queued).toBe(false);
    expect(readQueue(storage)).toHaveLength(0);
    expect(adapter.calls[0].name).toBe('cancelOrder');
  });

  it('flush reexecuta em ordem e limpa a fila', async () => {
    const storage = memStorage();
    enqueue({ kind: 'modify', payload: { platformPositionId: 'p1', sl: 1, tp: 2 } }, storage);
    enqueue({ kind: 'close', payload: { platformPositionId: 'p2' } }, storage);
    const adapter = fakeAdapter(false);
    const r = await flushQueue(adapter, storage);
    expect(r).toEqual({ sent: 2, remaining: 0, dropped: 0 });
    expect(adapter.calls.map((c) => c.name)).toEqual(['modifyPosition', 'closePosition']);
    expect(readQueue(storage)).toHaveLength(0);
  });

  it('flush para no primeiro erro de conexão e mantém o restante na ordem', async () => {
    const storage = memStorage();
    enqueue({ kind: 'place', payload: { a: 1 } }, storage);
    enqueue({ kind: 'cancel', payload: { platformOrderId: 'o2' } }, storage);
    const adapter = fakeAdapter(true);
    const r = await flushQueue(adapter, storage);
    expect(r.sent).toBe(0);
    expect(r.remaining).toBe(2);
    expect(readQueue(storage)[0].kind).toBe('place');
  });

  it('erro real (validação) não entra na fila e é relançado', async () => {
    const storage = memStorage();
    const adapter = fakeAdapter(false);
    adapter.placeOrder = () => { const e = new Error('bad payload'); e.name = 'BridgeApiError'; throw e; };
    await expect(submitOrQueue(adapter, { kind: 'place', payload: {} }, storage)).rejects.toThrow('bad payload');
    expect(readQueue(storage)).toHaveLength(0);
  });

  it('isOfflineError classifica rede/timeout, não erro de negócio', () => {
    const net = new Error('x'); net.name = 'TypeError';
    const abort = new Error('x'); abort.name = 'AbortError';
    const api = new Error('x'); api.name = 'BridgeApiError';
    expect(isOfflineError(net)).toBe(true);
    expect(isOfflineError(abort)).toBe(true);
    expect(isOfflineError(api)).toBe(false);
    expect(isOfflineError(null)).toBe(false);
  });

  it('clearQueue esvazia', () => {
    const storage = memStorage();
    enqueue({ kind: 'place', payload: {} }, storage);
    expect(storage.getItem(ORDER_QUEUE_KEY)).toBeTruthy();
    clearQueue(storage);
    expect(readQueue(storage)).toHaveLength(0);
  });
});
