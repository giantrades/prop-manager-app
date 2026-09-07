// STAGE 2 — Sync Engine. Push debounced 3s + batch 500 + resolveConflict Opção B
// (campo financeiro NUNCA merge automático) + helper `.range()`.
//
// Opção B (03-SYNC_PROTOCOL.md): merge por registro com updatedAt mais recente vence,
// EXCETO campos financeiros que nunca fazem merge automático — se os dois devices
// mexeram no mesmo registro financeiro, marca `conflict` e mantém as duas versões.

import { EVENTS, globalEvents, type EventBus, type SyncErrorPayload } from './events';
import type { SyncedRecord } from './types';

export const SYNC_DEBOUNCE_MS = 3000;
export const SYNC_BATCH_SIZE = 500;
export const MAX_RETRY_ATTEMPTS = 4;
export const RETRY_BACKOFF_MS = [5000, 10000, 30000, 60000];

// Campos financeiros que NUNCA fazem merge automático (Opção B).
export const FINANCIAL_FIELDS_BY_ENTITY: Record<string, string[]> = {
  transaction: ['amount', 'rate'],
  payout: ['net', 'gross', 'fee'],
  account: ['initialFunding'],
  goal: ['targetValue'],
};

export interface ConflictResolution<T> {
  resolved: T | null;
  conflict: boolean;
  localVersion?: T;
  remoteVersion?: T;
}

/**
 * Opção B — merge por registro com regra de precedência explícita.
 * Se os dois devices mudaram o mesmo campo financeiro desde o último sync comum,
 * NÃO resolve: marca `conflict` e devolve as duas versões pra confirmação humana.
 */
export function resolveConflict<T extends SyncedRecord>(
  entityType: string,
  local: T,
  remote: T,
  lastSynced?: T,
): ConflictResolution<T> {
  const financialFields = FINANCIAL_FIELDS_BY_ENTITY[entityType] ?? [];
  let financialConflict = false;
  for (const field of financialFields) {
    const lv = (local as Record<string, unknown>)[field];
    const rv = (remote as Record<string, unknown>)[field];
    const base = lastSynced ? (lastSynced as Record<string, unknown>)[field] : undefined;
    const localChanged = lastSynced ? lv !== base : true;
    const remoteChanged = lastSynced ? rv !== base : true;
    if (localChanged && remoteChanged && lv !== rv) {
      financialConflict = true;
      break;
    }
  }
  if (financialConflict) {
    return { resolved: null, conflict: true, localVersion: local, remoteVersion: remote };
  }
  const winner =
    new Date(local.updatedAt).getTime() >= new Date(remote.updatedAt).getTime()
      ? local
      : remote;
  return { resolved: winner, conflict: false };
}

export interface PushRecord {
  entityType: string;
  record: SyncedRecord;
}

export type PushFn = (batch: PushRecord[]) => Promise<{ count: number; entityCounts: Record<string, number> }>;

export interface SyncEngineOptions {
  push: PushFn;
  debounceMs?: number;
  batchSize?: number;
  onError?: (payload: SyncErrorPayload) => void;
  /** EventBus onde emitir sync:pushed/sync:error. Default: bus global. */
  bus?: EventBus;
}

export class SyncEngine {
  private readonly push: PushFn;
  private readonly debounceMs: number;
  private readonly batchSize: number;
  private readonly onError?: (payload: SyncErrorPayload) => void;
  private readonly bus: EventBus;

  private queue: PushRecord[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private attempt = 0;

  constructor(opts: SyncEngineOptions) {
    this.push = opts.push;
    this.debounceMs = opts.debounceMs ?? SYNC_DEBOUNCE_MS;
    this.batchSize = opts.batchSize ?? SYNC_BATCH_SIZE;
    this.onError = opts.onError;
    this.bus = opts.bus ?? globalEvents;
  }

  /** Enfileira uma mudança e agenda o push com debounce de 3s. */
  enqueue(entityType: string, record: SyncedRecord): void {
    // Dedup por id: mantém a versão mais recente do mesmo registro.
    const existing = this.queue.findIndex(
      (q) => q.entityType === entityType && q.record.id === record.id,
    );
    if (existing >= 0) this.queue[existing] = { entityType, record };
    else this.queue.push({ entityType, record });

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Envia a fila em batches de `batchSize`. Idempotente; processa todos os batches. */
  async flush(): Promise<{ count: number; entityCounts: Record<string, number> }> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.flushing) return { count: 0, entityCounts: {} };
    if (this.queue.length === 0) return { count: 0, entityCounts: {} };

    this.flushing = true;
    const startedAt = Date.now();
    const entityCounts: Record<string, number> = {};
    let count = 0;
    let currentBatch: PushRecord[] = [];

    try {
      while (this.queue.length > 0) {
        currentBatch = this.queue.splice(0, this.batchSize);
        for (const r of currentBatch) {
          entityCounts[r.entityType] = (entityCounts[r.entityType] ?? 0) + 1;
        }
        const result = await this.push(currentBatch);
        count += result.count;
        this.attempt = 0;
      }
      this.bus.emit(EVENTS.SYNC_PUSHED, {
        count,
        entityCounts,
        durationMs: Date.now() - startedAt,
      });
      return { count, entityCounts };
    } catch (err) {
      // Re-enfileira a batch que falhou (já removida da fila) — nunca perde dado local.
      this.queue.unshift(...currentBatch);
      const retryable = this.attempt < MAX_RETRY_ATTEMPTS;
      this.attempt += 1;
      const message = err instanceof Error ? err.message : String(err);
      const payload: SyncErrorPayload = {
        phase: 'push',
        message,
        retryable,
        attempt: this.attempt,
      };
      this.bus.emit(EVENTS.SYNC_ERROR, payload);
      this.onError?.(payload);
      if (retryable) {
        const backoff = RETRY_BACKOFF_MS[Math.min(this.attempt - 1, RETRY_BACKOFF_MS.length - 1)];
        this.timer = setTimeout(() => void this.flush(), backoff);
      }
      return { count: 0, entityCounts };
    } finally {
      this.flushing = false;
    }
  }

  /** Envia imediatamente (sem debounce), útil pra visibilitychange/focus. */
  async flushNow(): Promise<{ count: number; entityCounts: Record<string, number> }> {
    return this.flush();
  }

  get pending(): number {
    return this.queue.length;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

// ---------------------------------------------------------------------------
// `.range()` — paginação de pull (PostgREST trunca em 1000 por padrão).
// ---------------------------------------------------------------------------

export interface RangeWindow {
  from: number;
  to: number;
}

/** Retorna a janela `.range(from, to)` pra página `page` de tamanho `pageSize`. */
export function rangeForPage(page: number, pageSize: number): RangeWindow {
  const from = page * pageSize;
  const to = from + pageSize - 1;
  return { from, to };
}

/**
 * Itera todas as páginas chamando `fetchRange(from, to)` até retornar menos que
 * `pageSize` registros (ou uma página vazia). Consolida em um array.
 */
export async function pullAllPages<T>(
  fetchRange: (window: RangeWindow) => Promise<T[]>,
  pageSize = 500,
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;
  for (;;) {
    const window = rangeForPage(page, pageSize);
    const rows = await fetchRange(window);
    all.push(...rows);
    if (rows.length < pageSize) break;
    page += 1;
  }
  return all;
}
