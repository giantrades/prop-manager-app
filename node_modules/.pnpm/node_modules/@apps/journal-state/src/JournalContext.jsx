import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { uploadOrUpdateJSON, downloadLatestJSON, isSignedIn } from '@apps/utils/googleDrive.js';

const JournalCtx = createContext(null);

async function getDB() {
  // 💥 CORREÇÃO CRUCIAL: Incrementa a versão do DB para 2
  return openDB('journal-db', 2, { 
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains('trades')) {
        const store = db.createObjectStore('trades', { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
      // Garante que a store 'strategies' seja criada se não existir (necessário após a versão 1)
      if (!db.objectStoreNames.contains('strategies')) {
        db.createObjectStore('strategies', { keyPath: 'id' });
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
        setStrategies(allStrategies || []); 
        setReady(true);
      } catch (error) {
        console.error("Falha ao inicializar JournalProvider:", error);
        // Em caso de erro, ainda definimos ready para evitar o loop infinito de "carregando"
        if (mounted) setReady(true); 
      }
    })();
    return () => { mounted = false; };
  }, []);

  const saveTrade = useCallback(async (trade) => {
    const db = await getDB();
    const id = trade.id || uuidv4();
    const payload = { ...trade, id, updatedAt: new Date().toISOString() };
    await db.put('trades', payload);
    setTrades(prev => {
      const other = prev.filter(t => t.id !== id);
      return [payload, ...other];
    });
    return payload;
  }, []);

  const deleteTrade = useCallback(async (id) => {
    const db = await getDB();
    await db.delete('trades', id);
    setTrades(prev => prev.filter(t => t.id !== id));
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
      
      const payload = { 
          trades: allTrades, 
          strategies: allStrategies,
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