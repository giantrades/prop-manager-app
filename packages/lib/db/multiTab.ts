// STAGE 2 — Multi-tab. `navigator.locks` (exclusão mútua entre abas) + BroadcastChannel
// único. Substitui os 3 locks via localStorage do app antigo (platformManager.js),
// que usavam timeout manual de 3s com Date.now() — heurística frágil.

import { nowIso } from './dateUtils';
import { closeBroadcastChannel } from './events';

/**
 * Executa `fn` sob um lock exclusivo entre abas. Usa `navigator.locks` quando
 * disponível; em ambiente sem ele (node/teste), cai para execução direta.
 */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(name, () => fn());
  }
  // Fallback: sem navigator.locks (node/teste) — executa direto.
  return fn();
}

/** Lock recomendado para escrita destrutiva (clear/seed). */
export const DESTRUCTIVE_WRITE_LOCK = 'app-db:destructive-write';
/** Lock recomendado para escrita de trade/ledger. */
export const TRADE_WRITE_LOCK = 'app-db:trade-write';

export interface MultiTabCoordinatorOptions {
  /** Nome do lock usado para serializar escritas. */
  lockName?: string;
  /** Id do dispositivo (identidade da aba). */
  deviceId?: string;
}

export interface MultiTabCoordinator {
  /** Serializa uma operação com lock exclusivo entre abas. */
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
  /** Marca um heartbeat da aba (útil pra leader election). */
  heartbeat(): void;
  /** Fecha o channel/limpa listeners (teardown de teste). */
  dispose(): void;
}

/**
 * Coordenador multi-tab. Em produção: um por aba, com lock + broadcast. Em teste:
 * injete `channel` e `deviceId` pra simular duas abas.
 */
export function createMultiTabCoordinator(
  opts: MultiTabCoordinatorOptions = {},
): MultiTabCoordinator {
  const lockName = opts.lockName ?? TRADE_WRITE_LOCK;
  const deviceId = opts.deviceId ?? `tab-${nowIso()}`;

  return {
    async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
      return withLock(lockName, fn);
    },
    heartbeat(): void {
      // Placeholder: se precisarmos de leader election persistente, um beacon de
      // heartbeat via BroadcastChannel entra aqui. Não é necessário pro gate.
      void deviceId;
    },
    dispose(): void {
      closeBroadcastChannel();
    },
  };
}

/** Test helper: fecha o channel singleton global (chama em afterAll). */
export function teardownMultiTab(): void {
  closeBroadcastChannel();
}
