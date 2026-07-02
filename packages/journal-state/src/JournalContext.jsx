import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { uploadOrUpdateJSON, downloadLatestJSON, isSignedIn } from '@apps/utils/googleDrive.js';
import { getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout, updatePayout, deletePayout, getFirms, createFirm, updateFirm, deleteFirm, getFirmStats } from '@apps/lib/dataStore';
import { updateAccount as dsUpdateAccount } from '@apps/lib/dataStore.js';
import { useDrive } from '@apps/state/DriveContext';


const JournalCtx = createContext(null);

async function getDB() {
  // Incrementa a versão do DB para garantir upgrade (se necessário)
  return openDB('journal-db', 2, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains('trades')) {
        const store = db.createObjectStore('trades', { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
      if (!db.objectStoreNames.contains('strategies')) {
        db.createObjectStore('strategies', { keyPath: 'id' });
      }

      // ADICIONA STORES QUE SÃO USADAS EM export/import (evita NotFoundError)
      if (!db.objectStoreNames.contains('accounts')) {
        const s = db.createObjectStore('accounts', { keyPath: 'id' });
        s.createIndex('name', 'name');
      }
      if (!db.objectStoreNames.contains('firms')) {
        db.createObjectStore('firms', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('payouts')) {
        db.createObjectStore('payouts', { keyPath: 'id' });
      }
    }
  });
}


export default function JournalProvider({ children }) {
  const [trades, setTrades] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [ready, setReady] = useState(false);
  const { logged: driveLogged, backup: driveBackup } = useDrive();

  // ===========================================================
  // 🔹 Recarrega trades + strategies do journal-db para o estado
  // em memória. Usado na inicialização e sempre que um restore
  // (Google ou Proton) grava novos dados no journal-db.
  // ===========================================================
  const reloadFromDB = useCallback(async () => {
    try {
      const db = await getDB();
      const allTrades = await db.getAll('trades');
      const allStrategies = await db.getAll('strategies');

      // Normaliza checklist (compatibilidade com dados antigos)
      const normalized = (allStrategies || []).map(s => {
        if (Array.isArray(s.checklist) && s.checklist.length > 0 && typeof s.checklist[0] === 'string') {
          const items = s.checklist.map((t, idx) => ({
            id: `legacy-${idx}-${String(t).replace(/\s+/g, '-').toLowerCase()}`,
            title: String(t),
          }));
          return { ...s, checklist: items };
        }
        if (!s.checklist) return { ...s, checklist: [] };
        return s;
      });

      setTrades(allTrades || []);
      setStrategies(normalized);
      return { trades: allTrades || [], strategies: normalized };
    } catch (error) {
      console.error('Falha ao recarregar dados do journal-db:', error);
      return { trades: [], strategies: [] };
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { trades: allTrades } = await reloadFromDB();

        if (!mounted) return;

        // 🔹 Sincroniza trades com o dataStore (só se realmente mudou)
        try {
          const ds = await import('@apps/lib/dataStore.js');
          const { getAll, save } = ds.default || ds;
          const all = await getAll();

          if (JSON.stringify(all.trades || []) !== JSON.stringify(allTrades || [])) {
            console.log('📦 Sincronizando trades com dataStore...');
            await save({ ...all, trades: allTrades || [] });
            window.dispatchEvent(new CustomEvent('datastore:change'));
          }
        } catch (err) {
          console.warn('⚠️ Falha ao sincronizar trades com dataStore:', err);
        }

        if (mounted) setReady(true);
      } catch (error) {
        console.error('Falha ao inicializar JournalProvider:', error);
        // Em caso de erro, ainda definimos ready para evitar o loop infinito de "carregando"
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, [reloadFromDB]);

  // 🔗 Listen for platform sync events → persist new trades into IndexedDB
  // 🔗 Listen for restore events → recarrega trades/strategies do journal-db
  useEffect(() => {
    const handleDatastoreChange = async (e) => {
      const detail = e.detail || {};

      // Caso 1: dados restaurados de um backup (Google/Proton) —
      // trades e strategies já foram escritos direto no journal-db,
      // só precisamos recarregar o estado em memória.
      if (detail.source === 'restore') {
        console.log('♻️ Restore detectado — recarregando trades/strategies do journal-db...');
        await reloadFromDB();
        return;
      }

      // Caso 2: sync de plataforma (Quantower/cTrader) — importa
      // trades novos vindos do dataStore para o journal-db.
      if (detail.source !== 'platform-sync' && detail.source !== 'position-closed') return;

      try {
        const ds = await import('@apps/lib/dataStore.js');
        const { getAll: dsGetAll } = ds.default || ds;
        const all = await dsGetAll();
        const dsTrades = all.trades || [];

        const platformTrades = dsTrades.filter(t =>
          t.source && t.source !== 'manual' && t.platformTradeId
        );

        if (platformTrades.length === 0) return;

        const db = await getDB();
        const existingIds = new Set((await db.getAll('trades')).map(t => t.id));

        let added = 0;
        for (const trade of platformTrades) {
          if (!existingIds.has(trade.id)) {
            await db.put('trades', trade);
            added++;
          }
        }

        if (added > 0) {
          console.log(`🔗 Platform sync: ${added} new trades imported to journal`);
          const allTrades = await db.getAll('trades');
          setTrades(allTrades || []);
        }
      } catch (err) {
        console.warn('⚠️ Platform sync → journal import failed:', err);
      }
    };

    window.addEventListener('datastore:change', handleDatastoreChange);
    return () => window.removeEventListener('datastore:change', handleDatastoreChange);
  }, [reloadFromDB]);

  // ===========================================================
  // ⚠️ REMOVIDO: auto-backup interno de 5 em 5 minutos.
  //
  // Esse timer chamava driveBackup({ trades, strategies, meta }) —
  // um payload PARCIAL — e gravava no MESMO arquivo
  // "propmanager-backup.json" usado pelo main-app para salvar
  // accounts/payouts/settings/firms/goals/etc. Rodando em paralelo
  // com o auto-sync do main-app, ele podia sobrescrever o backup
  // completo com uma versão menor, apagando dados.
  //
  // O auto-sync unificado (checkbox em Settings, de cada app) já
  // cobre isso hoje, sempre com o payload COMPLETO (via
  // getFullBackupPayload, que inclui trades/strategies/accounts/
  // payouts/settings/firms/goals/etc juntos).
  // ===========================================================

  // JournalContext.js
  const saveTrade = useCallback(async (trade) => {
    const db = await getDB();
    const id = trade.id || uuidv4();

    // 🔹 Verifica se já existe trade anterior (edição)
    const existing = trade.id ? await db.get("trades", id) : null;
    console.log('🔍 saveTrade ANTES:', {
      id,
      isEditing: !!trade.id,
      existingPnL: existing?.result_net || 0,
      newPnL: trade.result_net || 0,
      existingGross: existing?.result_gross || 0,
      newGross: trade.result_gross || 0,
    });

    const payload = {
      ...trade,
      id,
      updatedAt: new Date().toISOString(),
    };

    // 🔹 Salva ou atualiza trade no IndexedDB
    await db.put("trades", payload);

    // 🔹 Atualiza estado local de trades
    setTrades(prev => {
      const other = prev.filter(t => t.id !== id);
      return [payload, ...other];
    });


    // 🔹 Atualiza também o dataStore local
    try {
      const ds = await import("@apps/lib/dataStore.js");
      const { getAll, save } = ds.default || ds;

      const all = await getAll();

      const updatedTrades = [
        payload,
        ...(all.trades || []).filter(t => t.id !== payload.id)
      ];

      await save({ ...all, trades: updatedTrades });
      window.dispatchEvent(new CustomEvent('datastore:change'));
      // 🔔 Notifica listeners globais (Goals, Dashboard etc.)
      window.dispatchEvent(new CustomEvent('journal:change'));
    } catch (err) {
      console.warn("⚠️ Falha ao atualizar trades no dataStore:", err);
    }

    // 🔹 Atualiza funding incremental com correção de delta
    if (Array.isArray(payload.accounts)) {
      try {
        const ds = await import("@apps/lib/dataStore.js");
        const { getAll, updateAccount } = ds.default || ds;
        const all = await getAll();
        const accounts = all?.accounts || [];

        for (const accEntry of payload.accounts) {
          const acc = accounts.find(a => a.id === accEntry.accountId);
          if (!acc) continue;

          const weight = accEntry.weight ?? 1;
          const oldPnl = existing ? (Number(existing.result_net) || 0) * weight : 0;
          const newPnl = (Number(payload.result_net) || 0) * weight;
          const pnlDiff = newPnl - oldPnl;

          console.log(`💰 Conta ${acc.name}:`, {
            weight,
            oldPnl,
            newPnl,
            diff: pnlDiff,
            currentFunding: acc.currentFunding,
            newFunding: (acc.currentFunding || 0) + pnlDiff,
          });
          // Evita aplicar duas vezes se não há mudança real
          if (Math.abs(pnlDiff) < 1e-9) continue;

          await updateAccount(acc.id, {
            ...acc,
            currentFunding: (acc.currentFunding || 0) + pnlDiff,
          });
        }

        // 🔹 Dispara eventos para sincronizar UI
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('datastore:change'));
      } catch (e) {
        console.warn("⚠️ Falha ao atualizar contas:", e);
      }
    }


    return payload;
  }, []);


  const deleteTrade = useCallback(async (tradeId) => {
    const db = await getDB();
    const trade = await db.get("trades", tradeId);

    if (!trade) return;

    await db.delete("trades", tradeId);
    setTrades(prev => prev.filter(t => t.id !== tradeId));

    // 🔹 Remove trade também do dataStore
    try {
      const ds = await import("@apps/lib/dataStore.js");
      const { getAll, save } = ds.default || ds;
      const all = await getAll();
      const remainingTrades = (all.trades || []).filter(t => t.id !== tradeId);
      await save({ ...all, trades: remainingTrades });
      window.dispatchEvent(new CustomEvent('datastore:change'));
      // 🔔 Notifica listeners globais (Goals, Dashboard etc.)
      window.dispatchEvent(new CustomEvent('journal:change'));
    } catch (err) {
      console.warn("⚠️ Falha ao remover trade do dataStore:", err);
    }

    // 🔹 Reverte impacto do PnL nas contas
    if (Array.isArray(trade.accounts)) {
      try {
        const ds = await import("@apps/lib/dataStore.js");
        const { getAll, updateAccount } = ds.default || ds;
        const all = await getAll();
        const accounts = all?.accounts || [];

        for (const accEntry of trade.accounts) {
          const acc = accounts.find(a => a.id === accEntry.accountId);
          if (!acc) continue;

          const weight = accEntry.weight ?? 1;
          const pnlImpact = Number(trade.result_net || 0) * weight;

          await updateAccount(acc.id, {
            ...acc,
            currentFunding: (acc.currentFunding || 0) - pnlImpact,
          });
        }
      } catch (e) {
        console.warn("⚠️ Falha ao remover impacto de PnL:", e);
      }
    }


  }, []);


  const saveStrategy = useCallback(async (strategy) => {
    const db = await getDB();
    const id = strategy.id || uuidv4();
    const payload = { ...strategy, id, updatedAt: new Date().toISOString() };
    await db.put('strategies', payload);

    setStrategies(prev => {
      const other = prev.filter(s => s.id !== id);
      return [payload, ...other];
    });
    return payload;
  }, []);

  const removeStrategy = useCallback(async (id) => {
    const db = await getDB();
    await db.delete('strategies', id);
    setStrategies(prev => prev.filter(s => s.id !== id));
  }, []);


  const exportToDrive = useCallback(async (filename = 'journal_backup.json') => {
    try {
      const db = await getDB();
      const allTrades = await db.getAll('trades');
      const allStrategies = await db.getAll('strategies');

      const payload = {
        trades: allTrades,
        strategies: allStrategies,
        meta: { exportedAt: new Date().toISOString() }
      };

      if (driveLogged) {
        await driveBackup(payload);
        return payload;
      } else {
        console.log('ℹ️ Não conectado ao Drive - backup ignorado');
        return payload;
      }
    } catch (err) {
      console.error('Export failed', err);
      throw err;
    }
  }, [driveLogged, driveBackup]);

  const importFromDrive = useCallback(async () => {
    try {
      if (!isSignedIn || !isSignedIn()) return null;
      const data = await downloadLatestJSON();
      if (!data || (!data.trades && !data.strategies)) return null;

      const db = await getDB();

      // Importar Trades
      if (data.trades) {
        const txTrades = db.transaction('trades', 'readwrite');
        for (const t of data.trades) {
          await txTrades.store.put(t);
        }
        await txTrades.done;
      }

      // Importar Estratégias
      if (data.strategies) {
        const txStrategies = db.transaction('strategies', 'readwrite');
        for (const s of data.strategies) {
          await txStrategies.store.put(s);
        }
        await txStrategies.done;
      }

      // Atualiza os estados locais
      const result = await reloadFromDB();
      return result;
    } catch (err) {
      console.error('Import failed', err);
      throw err;
    }
  }, [reloadFromDB]);

  function normalizeTrade(t) {
    if (!t.entry_datetime && t.date && t.entry_time) {
      t.entry_datetime = new Date(`${t.date}T${t.entry_time}`).toISOString();
    }
    if (!t.exit_datetime && t.date && t.exit_time) {
      t.exit_datetime = new Date(`${t.date}T${t.exit_time}`).toISOString();
    }
    return t;
  }


  return (
    <JournalCtx.Provider value={{
      ready, trades, saveTrade, deleteTrade, exportToDrive, importFromDrive,
      strategies, saveStrategy, removeStrategy
    }}>
      {children}
    </JournalCtx.Provider>
  );
}

export function useJournal() {
  return useContext(JournalCtx);
}