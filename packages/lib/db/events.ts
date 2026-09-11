// STAGE 2 — events central. Payload exato do contrato 01-DATA_CONTRACT.md.
// EventBus (injetável, testável) + BroadcastChannel único (module scope).

import type { DatastoreChangePayload } from './types';

export const EVENTS = {
  DATASTORE_CHANGE: 'datastore:change',
  SYNC_PUSHED: 'sync:pushed',
  SYNC_PULLED: 'sync:pulled',
  SYNC_ERROR: 'sync:error',
  QUANTOWER_SYNCED: 'quantower:synced',
  QUANTOWER_ERROR: 'quantower:error',
  RISK_WARNING: 'risk:warning',
  GOAL_COMPLETED: 'goal:completed',
  PAYOUT_ELIGIBLE: 'payout:eligible',
  PRICE_ALERT: 'price:alert',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface SyncPushedPayload {
  count: number;
  entityCounts: Record<string, number>;
  durationMs: number;
}

export interface SyncPulledPayload {
  count: number;
  entityCounts: Record<string, number>;
  durationMs: number;
}

export interface SyncErrorPayload {
  phase: 'push' | 'pull';
  message: string;
  retryable: boolean;
  attempt: number;
}

export interface QuantowerSyncedPayload {
  count: number;
  lastSync: string;
  accountIds: string[];
}

export interface QuantowerErrorPayload {
  message: string;
  code: 'bridge_offline' | 'bridge_stale_version' | 'auth_failed' | 'unknown';
  bridgeVersion?: string;
}

export interface RiskWarningPayload {
  accountId: string;
  level: 'warn' | 'stop';
  metric: 'dailyDD' | 'trailingDD' | 'maxDD' | 'concentration';
  currentValue: number;
  limit: number;
  headroom: number;
  triggeredAt: string;
}

export interface GoalCompletedPayload {
  goalId: string;
  completedAt: string;
  finalValue: number;
}

export interface PayoutEligiblePayload {
  accountId: string;
  accountName: string;
  equity: number;
  triggeredAt: string;
}

export interface PriceAlertPayload {
  positionId: string;
  symbol: string;
  alertId: string;
  dir: 'above' | 'below';
  price: number;
  current: number;
  triggeredAt: string;
}

export type EventPayloadMap = {
  [EVENTS.DATASTORE_CHANGE]: DatastoreChangePayload;
  [EVENTS.SYNC_PUSHED]: SyncPushedPayload;
  [EVENTS.SYNC_PULLED]: SyncPulledPayload;
  [EVENTS.SYNC_ERROR]: SyncErrorPayload;
  [EVENTS.QUANTOWER_SYNCED]: QuantowerSyncedPayload;
  [EVENTS.QUANTOWER_ERROR]: QuantowerErrorPayload;
  [EVENTS.RISK_WARNING]: RiskWarningPayload;
  [EVENTS.GOAL_COMPLETED]: GoalCompletedPayload;
  [EVENTS.PAYOUT_ELIGIBLE]: PayoutEligiblePayload;
  [EVENTS.PRICE_ALERT]: PriceAlertPayload;
};

export type Listener<K extends EventName> = (payload: EventPayloadMap[K]) => void;

/**
 * EventBus em memória (browser + node). Cada aba em produção tem o seu; nos testes
 * criamos instâncias separadas pra simular abas sem cross-talk.
 */
export class EventBus {
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends EventName>(event: K, cb: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event)!;
    set.add(cb as (payload: unknown) => void);
    return () => {
      set.delete(cb as (payload: unknown) => void);
      if (set.size === 0) this.listeners.delete(event);
    };
  }

  off<K extends EventName>(event: K, cb: Listener<K>): void {
    this.listeners.get(event)?.delete(cb as (payload: unknown) => void);
  }

  emit<K extends EventName>(event: K, payload: EventPayloadMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        // Listener nunca pode derrubar o pipeline de escrita.
        // eslint-disable-next-line no-console
        console.error(`[events] listener de "${event}" falhou`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Bus global (default quando o consumidor não injeta um). */
export const globalEvents = new EventBus();

// ---------------------------------------------------------------------------
// BroadcastChannel único (module scope) — consolida as 2 instâncias antigas.
// ---------------------------------------------------------------------------

export const DATASTORE_CHANNEL = 'propmanager-datastore';

/** Interface mínima de BroadcastChannel (facilita mock em teste). */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void;
  removeEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void;
  close(): void;
}

let _channel: BroadcastChannelLike | null = null;

export function createBroadcastChannel(): BroadcastChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(DATASTORE_CHANNEL) as unknown as BroadcastChannelLike;
}

function getChannel(): BroadcastChannelLike | null {
  if (!_channel) _channel = createBroadcastChannel();
  return _channel;
}

/** Channel default (singleton do módulo). Usado quando o DataService não injeta um. */
export function getDefaultBroadcastChannel(): BroadcastChannelLike | null {
  return getChannel();
}

/** Test helper: injeta um channel customizado (ex.: bridge entre 2 abas). */
export function setBroadcastChannel(channel: BroadcastChannelLike | null): void {
  if (_channel) {
    try {
      _channel.close();
    } catch {
      /* noop */
    }
  }
  _channel = channel;
}

/**
 * Emite o evento no `bus` e propaga via BroadcastChannel pra outras abas.
 * Usado pelo DataService como único caminho de mudança. Se `channel` é passado,
 * usa ele; senão usa o singleton do módulo.
 */
export function postDatastoreChange(
  bus: EventBus,
  payload: DatastoreChangePayload,
  channel?: BroadcastChannelLike | null,
): void {
  bus.emit(EVENTS.DATASTORE_CHANGE, payload);
  const ch = channel === undefined ? getChannel() : channel;
  if (ch) {
    try {
      ch.postMessage(payload);
    } catch {
      // BroadcastChannel pode lançar se outra aba fechou — nunca quebra a escrita.
    }
  }
}

/**
 * Registra o listener do BroadcastChannel. Quando outra aba escreve, re-emite no
 * `bus` local (source preservado) pra UI/chain reagir sem re-ler o IDB.
 * Se `channel` é passado, usa ele; senão usa o singleton do módulo.
 * Retorna disposer.
 */
export function bindBroadcastChannel(
  bus: EventBus,
  channel?: BroadcastChannelLike | null,
  onMessage?: (p: DatastoreChangePayload) => void,
): () => void {
  const ch = channel === undefined ? getChannel() : channel;
  if (!ch) return () => undefined;
  const handler = (ev: { data: unknown }) => {
    const payload = ev.data as DatastoreChangePayload;
    if (!payload || typeof payload.timestamp !== 'number') return;
    bus.emit(EVENTS.DATASTORE_CHANGE, payload);
    onMessage?.(payload);
  };
  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
  };
}

/** Test helper: fecha o channel singleton (chama em afterAll). */
export function closeBroadcastChannel(): void {
  if (_channel) {
    try {
      _channel.close();
    } catch {
      /* noop */
    }
  }
  _channel = null;
}
