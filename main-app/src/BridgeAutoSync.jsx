// BridgeAutoSync — auto-sync da Quantower DIRETO para o app-db v3 (DataService +
// DataChainEngine). É o ÚNICO auto-sync de trades; o caminho legado (platformManager
// -> dataStore) foi removido na Fase 11.4.
//
// Lê prefs de `localStorage` (qt:bridgeUrl/qt:bridgeToken/qt:autoSync), guarda o
// cursor em `meta` (`bridge:quantower:lastSync`) e emite `quantower:synced` /
// `quantower:error` no bus (contrato 01-DATA_CONTRACT.md).

import { useEffect, useRef } from 'react';
import { useFinance } from '@apps/state';
import { QuantowerAdapter } from '@apps/utils/adapters/quantowerAdapter.js';
import { ingestQuantowerTrades, EVENTS } from '@apps/lib/db';

const AUTO_KEY = 'qt:autoSync';
const URL_KEY = 'qt:bridgeUrl';
const TOKEN_KEY = 'qt:bridgeToken';
const LAST_SYNC_KEY = 'qt:lastSync';
const META_KEY = 'bridge:quantower:lastSync';
const INTERVAL_MS = 2 * 60 * 1000;

async function readCursor(ds) {
  try {
    const rec = await ds.meta.getKey(META_KEY);
    if (typeof rec?.value === 'string' && rec.value) return rec.value;
  } catch {
    /* sem cursor */
  }
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}

async function writeCursor(ds, iso) {
  try {
    await ds.meta.setKey(META_KEY, iso);
  } catch {
    /* noop */
  }
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    /* noop */
  }
}

export default function BridgeAutoSync() {
  const finance = useFinance();
  const ref = useRef(finance);
  ref.current = finance;

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      const f = ref.current;
      if (!f || cancelled) return;
      if (localStorage.getItem(AUTO_KEY) === '0') return;
      const bridgeUrl = localStorage.getItem(URL_KEY) || import.meta.env.VITE_BRIDGE_URL || '';
      const bridgeToken = localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_BRIDGE_TOKEN || '';
      if (!bridgeUrl) return;
      try {
        const from = await readCursor(f.ds);
        const a = new QuantowerAdapter({ bridgeUrl, bridgeToken });
        const trades = await a.getTrades(from, undefined);
        if (trades.length > 0) {
          await ingestQuantowerTrades(f.ds, f.chain, trades);
        }
        await writeCursor(f.ds, new Date().toISOString());
      } catch (e) {
        const status = e && typeof e === 'object' && 'status' in e ? e.status : undefined;
        f.ds.bus.emit(EVENTS.QUANTOWER_ERROR, {
          message: e instanceof Error ? e.message : 'Bridge offline.',
          code: status === 401 ? 'auth_failed' : 'bridge_offline',
        });
      }
    };

    const onFlag = () => {
      tick();
    };
    window.addEventListener('qt:autosync', onFlag);
    tick();
    timer = setInterval(tick, INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('qt:autosync', onFlag);
    };
  }, []);

  return null;
}
