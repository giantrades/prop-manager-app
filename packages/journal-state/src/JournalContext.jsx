// packages/journal-state/src/JournalContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { openDB } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import { uploadOrUpdateJSON, downloadLatestJSON, isSignedIn } from '@apps/utils/googleDrive.js'; // seu util

const JournalCtx = createContext(null);

async function getDB() {
  return openDB('journal-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('trades')) {
        const store = db.createObjectStore('trades', { keyPath: 'id' });
        store.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    }
  });
}

export default function JournalProvider({ children }) {
  const [trades, setTrades] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const db = await getDB();
      const all = await db.getAll('trades');
      if (!mounted) return;
      setTrades(all || []);
      setReady(true);
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

  const exportToDrive = useCallback(async (filename = 'journal_backup.json') => {
    try {
      const db = await getDB();
      const all = await db.getAll('trades');
      const payload = { trades: all, meta: { exportedAt: new Date().toISOString() } };
      if (isSignedIn && isSignedIn()) {
        return uploadOrUpdateJSON(filename, payload);
      } else {
        // fallback: return payload
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
      if (!data || !data.trades) return null;
      const db = await getDB();
      const tx = db.transaction('trades', 'readwrite');
      for (const t of data.trades) {
        await tx.store.put(t);
      }
      await tx.done;
      const all = await db.getAll('trades');
      setTrades(all);
      return all;
    } catch (err) {
      console.error('Import failed', err);
      throw err;
    }
  }, []);

  return (
    <JournalCtx.Provider value={{
      ready, trades, saveTrade, deleteTrade, exportToDrive, importFromDrive
    }}>
      {children}
    </JournalCtx.Provider>
  );
}

export function useJournal() {
  return useContext(JournalCtx);
}
