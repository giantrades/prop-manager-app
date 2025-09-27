// @apps/trading-journal/src/services/monteCarloService.ts
import type { MonteCarloHistoryItem, MonteCarloConfig, MonteCarloSummary } from '../types/monteCarlo';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile as driveUploadFile } from '@apps/utils/googleDrive.js'

// NOTE: simple IndexedDB wrapper
const DB_NAME = 'trading_journal_montecarlo';
const STORE = 'history';
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHistory(config: MonteCarloConfig, summary: MonteCarloSummary): Promise<MonteCarloHistoryItem> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const item: MonteCarloHistoryItem = {
    id: uuidv4(),
    config: { ...config, createdAt: new Date().toISOString() },
    summary,
    createdAt: new Date().toISOString(),
  };
  store.put(item);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listHistory(): Promise<MonteCarloHistoryItem[]> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as MonteCarloHistoryItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getHistoryItem(id: string): Promise<MonteCarloHistoryItem | null> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get(id);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Export to CSV utility
export function exportHistoryCSV(items: MonteCarloHistoryItem[]) {
  const headers = [
    'id',
    'createdAt',
    'strategy',
    'category',
    'simulations',
    'maxTradesPerRun',
    'initialCapital',
    'cagr',
    'maxDrawdown',
    'profitFactor',
    'sharpe',
    'calmar',
  ];
  const rows = items.map((it) => [
    it.id,
    it.createdAt,
    it.config.strategy ?? '',
    it.config.category ?? '',
    it.config.simulations,
    it.config.maxTradesPerRun,
    it.config.initialCapital,
    it.summary.cagr,
    it.summary.maxDrawdown,
    it.summary.profitFactor,
    it.summary.sharpe,
    it.summary.calmar,
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `montecarlo_history_${new Date().toISOString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Google Drive integration stub.
// Use utils from @apps/packages/utils (if exists) to handle auth and upload. If not, implement separately.
; // <- optional; replace with your real helper

export async function uploadHistoryToDrive(item: MonteCarloHistoryItem) {
  try {
    if (typeof driveUploadFile !== 'function') throw new Error('driveUploadFile helper not available');
    const payload = {
      name: `montecarlo_${item.id}.json`,
      mimeType: 'application/json',
      body: JSON.stringify(item),
    };
    
    const res = await driveUploadFile(payload.name, payload.body);
    
    // should return fileId
    return res?.id;
  } catch (err) {
    console.warn('uploadHistoryToDrive failed', err);
    return null;
  }
}
