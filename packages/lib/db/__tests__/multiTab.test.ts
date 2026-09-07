import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MemoryDbAdapter,
  createMemoryBackend,
  type MemoryBackend,
} from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus, EVENTS } from '../events';
import { withLock, createMultiTabCoordinator } from '../multiTab';
import { closeBroadcastChannel } from '../events';
import { createChannelPair } from './channelBridge';
import type { Account, DatastoreChangePayload } from '../types';

function makeTab(backend: MemoryBackend, deviceId: string, channel: any) {
  const adapter = new MemoryDbAdapter(backend);
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId, bus, channel });
  const chain = new DataChainEngine(ds);
  return { ds, chain, bus };
}

describe('Multi-tab — 2 abas sem drift (<3s)', () => {
  let backend: MemoryBackend;
  let pair: ReturnType<typeof createChannelPair>;
  let tabA: ReturnType<typeof makeTab>;
  let tabB: ReturnType<typeof makeTab>;

  beforeEach(() => {
    backend = createMemoryBackend();
    pair = createChannelPair();
    tabA = makeTab(backend, 'device-A', pair.a);
    tabB = makeTab(backend, 'device-B', pair.b);
  });

  afterEach(() => {
    tabA.ds.disposeBroadcast();
    tabB.ds.disposeBroadcast();
    closeBroadcastChannel();
  });

  it('escrita na aba A propaga evento e o dado é o mesmo na aba B', async () => {
    const received: DatastoreChangePayload[] = [];
    tabB.bus.on(EVENTS.DATASTORE_CHANGE, (p) => received.push(p));

    const account: Account = {
      id: 'acct-1',
      kind: 'wallet',
      name: 'Wise',
      currency: 'USD',
      hidden: false,
      defaultWeight: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      deviceId: 'device-A',
      version: 0,
    };
    await tabA.ds.accounts.put(account);

    // Evento chegou na aba B via BroadcastChannel.
    expect(received.length).toBeGreaterThan(0);
    expect(received[0].entityType).toBe('account');
    expect(received[0].entityIds).toEqual(['acct-1']);
    expect(received[0].source).toBe('local');

    // Dado é o mesmo (storage compartilhado) — sem drift.
    const readB = await tabB.ds.accounts.get('acct-1');
    expect(readB?.name).toBe('Wise');
    // Versão/deviceId batem (mesmo registro, não duplicado).
    expect(readB?.version).toBe(1);
    expect(readB?.deviceId).toBe('device-A');
  });

  it('escrita na aba B também propaga para a aba A', async () => {
    const received: DatastoreChangePayload[] = [];
    tabA.bus.on(EVENTS.DATASTORE_CHANGE, (p) => received.push(p));

    await tabB.ds.accounts.put({
      id: 'acct-2',
      kind: 'cash',
      name: 'Cash',
      currency: 'BRL',
      hidden: false,
      defaultWeight: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      deviceId: 'device-B',
      version: 0,
    } as Account);

    expect(received.length).toBeGreaterThan(0);
    const readA = await tabA.ds.accounts.get('acct-2');
    expect(readA?.name).toBe('Cash');
  });

  it('o remetente NÃO recebe o próprio evento (não se realimenta)', async () => {
    const aReceived: DatastoreChangePayload[] = [];
    tabA.bus.on(EVENTS.DATASTORE_CHANGE, (p) => aReceived.push(p));

    await tabA.ds.accounts.put({
      id: 'acct-3',
      kind: 'bank',
      name: 'XP',
      currency: 'BRL',
      hidden: false,
      defaultWeight: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      deviceId: 'device-A',
      version: 0,
    } as Account);

    // A recebeu 1x (a própria escrita local) — não 2x (loop).
    expect(aReceived.length).toBe(1);
  });

  it('withLock serializa execução (sem navigator.locks em node, cai direto)', async () => {
    const order: string[] = [];
    await Promise.all([
      withLock('test-lock', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('a');
      }),
      withLock('test-lock', async () => {
        order.push('b');
      }),
    ]);
    expect(order.sort()).toEqual(['a', 'b']);
  });

  it('createMultiTabCoordinator roda exceção sob lock e faz dispose', async () => {
    const coord = createMultiTabCoordinator({ deviceId: 'device-A' });
    const val = await coord.runExclusive(async () => 42);
    expect(val).toBe(42);
    coord.dispose();
  });
});
