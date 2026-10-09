// Sync de opções com o bridge Quantower (F3): puxa vencimentos + cadeia + posições,
// normaliza (`optionsIngest`) e grava nos stores (`option_chain`, `option_legs`).
// Só orquestra — nenhuma fórmula. O `bridge` é injetável (testável com mock).
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/06-OPTIONS_BRIDGE_SPEC.md

import type { DataService } from './DataService';
import {
  normalizeOptionChainDetailed,
  normalizeOptionPositionsDetailed,
  mergeOptionLegs,
  type BridgeChainPayload,
  type BridgePositionsPayload,
} from './optionsIngest';

export interface OptionsBridge {
  /** Descobre os subjacentes que têm opções (usado quando `opts.underlyings` não é dado). */
  underlyings?: () => Promise<Array<{ underlying: string }>>;
  expiries: (underlying: string) => Promise<Array<{ expiry: string }>>;
  chain: (underlying: string, expiry: string, depth: number) => Promise<BridgeChainPayload>;
  positions: () => Promise<BridgePositionsPayload>;
}

export interface SyncOptionsResult {
  expiries: number;
  quotes: number;
  rejectedQuotes: number;
  legs: number;
  rejectedLegs: number;
}

/**
 * Sincroniza opções do bridge. Resiliente: falha de um vencimento/subjacente não derruba
 * o resto (offline-first). `option_chain` é cache (substituído); `option_legs` do bridge é
 * mesclado por `quantowerId` (preserva id local, entrada, grupo, saída já registrada).
 */
export async function syncOptionsFromBridge(
  ds: DataService,
  bridge: OptionsBridge,
  opts?: { underlyings?: string[]; depth?: number; defaultMultiplier?: number },
): Promise<SyncOptionsResult> {
  const depth = opts?.depth ?? 15;
  let underlyings = (opts?.underlyings ?? []).map((u) => String(u).trim().toUpperCase()).filter(Boolean);
  // Sem subjacentes informados, descobre no bridge (roots que têm opções).
  if (underlyings.length === 0 && bridge.underlyings) {
    try {
      underlyings = (await bridge.underlyings())
        .map((x) => String(x?.underlying ?? '').trim().toUpperCase())
        .filter(Boolean);
    } catch {
      /* bridge off */
    }
  }
  let expiries = 0;
  let quotes = 0;
  let rejectedQuotes = 0;

  for (const u of underlyings) {
    let list: Array<{ expiry: string }> = [];
    try {
      list = await bridge.expiries(u);
    } catch {
      continue;
    }
    for (const e of list) {
      expiries += 1;
      let payload: BridgeChainPayload;
      try {
        payload = await bridge.chain(u, e.expiry, depth);
      } catch {
        continue;
      }
      const { quotes: normalized, rejected } = normalizeOptionChainDetailed(
        { ...payload, underlying: u, expiry: e.expiry },
        { source: 'bridge', defaultMultiplier: opts?.defaultMultiplier },
      );
      if (normalized.length) await ds.optionChain.bulkPut(normalized, { source: 'local' });
      quotes += normalized.length;
      rejectedQuotes += rejected.length;
    }
  }

  let legs = 0;
  let rejectedLegs = 0;
  try {
    const payload = await bridge.positions();
    const { legs: incoming, rejected } = normalizeOptionPositionsDetailed(payload, { defaultMultiplier: opts?.defaultMultiplier });
    rejectedLegs = rejected.length;
    if (incoming.length) {
      const existing = await ds.optionLegs.list();
      const merged = mergeOptionLegs(existing, incoming);
      await ds.optionLegs.bulkPut(merged, { source: 'quantower' });
      legs = incoming.length;
    }
  } catch {
    /* bridge off — mantém o que já existe */
  }

  return { expiries, quotes, rejectedQuotes, legs, rejectedLegs };
}
