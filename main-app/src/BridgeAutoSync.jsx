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
import { ingestQuantowerTrades, syncPlatformBalances, EVENTS } from '@apps/lib/db';

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

    // Status visível (Sistema → Quantower): por que o auto-sync parou/ingeriu o quê.
    const record = (status) => {
      try {
        localStorage.setItem('qt:autoSyncStatus', JSON.stringify(status));
        window.dispatchEvent(new Event('qt:autosync:status'));
      } catch { /* noop */ }
    };

    const tick = async () => {
      const f = ref.current;
      if (!f || cancelled) return;
      if (localStorage.getItem(AUTO_KEY) === '0') {
        record({ at: new Date().toISOString(), ok: false, code: 'disabled', error: 'Auto-sync desligado (menu Platforms → Start).' });
        return;
      }
      // Mesmo default do `bridgePrefs()`: 127.0.0.1 só funciona no PC. No celular, a URL
      // precisa ser a do Tailscale — por isso a URL vai no status (fica visível no card).
      const bridgeUrl = localStorage.getItem(URL_KEY) || import.meta.env.VITE_BRIDGE_URL || 'http://127.0.0.1:8787';
      const bridgeToken = localStorage.getItem(TOKEN_KEY) || import.meta.env.VITE_BRIDGE_TOKEN || '';
      if (!bridgeUrl) {
        record({ at: new Date().toISOString(), ok: false, code: 'no_bridge_url', error: 'Sem URL da ponte (Sistema → Quantower).' });
        return;
      }
      try {
        // Janela com FOLGA de 30 dias (mínimo): a reconstrução do trade no bridge precisa
        // do fill de ENTRADA, que pode ser anterior ao último cursor. Sem folga, um trade
        // que fecha agora vinha só com o fill de saída → mal reconstruído/não pego.
        // (Overlap não gera escrita à toa: o ingest ignora update idêntico.)
        const cursor = await readCursor(f.ds);
        const from = new Date(Math.min(Date.parse(cursor) || 0, Date.now() - 30 * 86400000)).toISOString();
        const a = new QuantowerAdapter({ bridgeUrl, bridgeToken });
        const trades = await a.getTrades(from, undefined);
        const res = trades.length > 0
          ? await ingestQuantowerTrades(f.ds, f.chain, trades)
          : { created: 0, updated: 0, skipped: 0 };
        // Saldo das contas da plataforma (platformBalance + nominal de prop sem nominal).
        try {
          const accounts = await a.getAccounts();
          await syncPlatformBalances(f.ds, accounts);
        } catch {
          /* sem contas agora — segue */
        }
        await writeCursor(f.ds, new Date().toISOString());
        record({ at: new Date().toISOString(), ok: true, url: bridgeUrl, fetched: trades.length, ...res });
      } catch (e) {
        const status = e && typeof e === 'object' && 'status' in e ? e.status : undefined;
        const code = status === 401 ? 'auth_failed' : 'bridge_offline';
        record({ at: new Date().toISOString(), ok: false, url: bridgeUrl, error: e instanceof Error ? e.message : 'Bridge offline.', code });
        f.ds.bus.emit(EVENTS.QUANTOWER_ERROR, {
          message: e instanceof Error ? e.message : 'Bridge offline.',
          code,
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
