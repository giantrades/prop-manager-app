import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { uploadOrUpdateJSON, downloadLatestJSON, isSignedIn } from '@apps/utils/googleDrive.js';
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import { updateAccount as dsUpdateAccount } from '@apps/lib/dataStore.js';



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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await getDB();
        const allTrades = await db.getAll('trades');
        const allStrategies = await db.getAll('strategies');
        
        if (!mounted) return;
        setTrades(allTrades || []);
        // Normaliza checklist (compatibilidade com dados antigos)
const normalized = (allStrategies || []).map(s => {
  // Se checklist estiver em formato antigo (array de strings), convertê-la
  if (Array.isArray(s.checklist) && s.checklist.length > 0 && typeof s.checklist[0] === 'string') {
    const items = s.checklist.map((t, idx) => ({ id: `legacy-${idx}-${String(t).replace(/\s+/g, '-').toLowerCase()}`, title: String(t) }));
    return { ...s, checklist: items };
  }
  // Se não existir checklist, garantir array vazio (opcional)
  if (!s.checklist) return { ...s, checklist: [] };
  return s;
});

setTrades(allTrades || []);
setStrategies(normalized);
setReady(true);

        setReady(true);
      } catch (error) {
        console.error("Falha ao inicializar JournalProvider:", error);
        // Em caso de erro, ainda definimos ready para evitar o loop infinito de "carregando"
        if (mounted) setReady(true); 
      }
    })();
    return () => { mounted = false; };
  }, []);

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

  // 🔹 Atualiza funding incremental com correção de delta
  if (Array.isArray(payload.accounts)) {
    try {
      const ds = await import("@apps/lib/dataStore.js");
      const { getAll, updateAccount } = ds;
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

  // 🔹 Exporta automaticamente para o Drive
  if (typeof exportToDrive === "function") {
    exportToDrive("journal_backup.json")
      .catch(e => console.warn("⚠️ Falha ao exportar para o Drive:", e));
  }

  return payload;
}, []);


const deleteTrade = useCallback(async (tradeId) => {
  const db = await getDB();
  const trade = await db.get("trades", tradeId);

  if (!trade) return;

  await db.delete("trades", tradeId);
  setTrades(prev => prev.filter(t => t.id !== tradeId));

  // 🔹 Reverte impacto do PnL nas contas
  if (Array.isArray(trade.accounts)) {
    try {
      const ds = await import("@apps/lib/dataStore.js");
      const { getAll, updateAccount } = ds;
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

  // 🔹 Atualiza backup no Drive
  if (typeof exportToDrive === "function") {
    exportToDrive("journal_backup.json")
      .catch(e => console.warn("⚠️ Falha ao exportar para o Drive:", e));
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

  const deleteStrategy = useCallback(async (id) => {
    const db = await getDB();
    await db.delete('strategies', id);
    setStrategies(prev => prev.filter(s => s.id !== id));
  }, []);


  const exportToDrive = useCallback(async (filename = 'journal_backup.json') => {
    try {
      const db = await getDB();
      const allTrades = await db.getAll('trades');
      const allStrategies = await db.getAll('strategies');
      const allAccounts = await db.getAll('accounts');
      const allFirms = await db.getAll('firms');
      const allSettings = await db.getAll('settings');
      const allPayouts = await db.getAll('payouts');
      
      const payload = { 
          trades: allTrades, 
          strategies: allStrategies,
          accounts: allAccounts,
          settings: allSettings,
          payouts: allPayouts,
          meta: { exportedAt: new Date().toISOString() } 
      };
      
      if (isSignedIn && isSignedIn()) {
        return uploadOrUpdateJSON(filename, payload);
      } else {
        return payload;
      }
    } catch (err) {
      console.error('Export failed', err);
      throw err;
    }
  }, []);

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
      const allTrades = await db.getAll('trades');
      const allStrategies = await db.getAll('strategies'); 
      setTrades(allTrades);
      setStrategies(allStrategies); 
      
      return { trades: allTrades, strategies: allStrategies };
    } catch (err) {
      console.error('Import failed', err);
      throw err;
    }
  }, []);
  
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
      strategies, saveStrategy, deleteStrategy 
    }}>
      {children}
    </JournalCtx.Provider>
  );
}

export function useJournal() {
  return useContext(JournalCtx);
}