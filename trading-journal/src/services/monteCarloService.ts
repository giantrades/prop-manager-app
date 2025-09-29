// @apps/trading-journal/src/services/monteCarloService.ts
import type { MonteCarloHistoryItem, MonteCarloConfig, MonteCarloSummary, MonteCarloRun } from '../types/monteCarlo';
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

// 💥 CORREÇÃO 1: saveHistory agora aceita 3 argumentos (config, summary, e opcionalmente sampleRuns)
export async function saveHistory(
    config: MonteCarloConfig, 
    summary: MonteCarloSummary,
    sampleRuns?: MonteCarloRun[] | null
): Promise<MonteCarloHistoryItem> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  
  const item: MonteCarloHistoryItem = {
    id: uuidv4(),
    config: { ...config, createdAt: new Date().toISOString() },
    summary,
    // 💥 CORREÇÃO 2: Adicionando sampleRuns ao item antes de salvar
    sampleRuns: sampleRuns || null,
    createdAt: new Date().toISOString(),
  };
  
  await new Promise((resolve, reject) => {
    const request = store.add(item);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  
  // Você pode querer fazer o upload para o Drive aqui
  // uploadHistoryToDrive(item).catch(console.error);

  return item;
}

// Funções existentes (listHistory, getHistoryItem, exportHistoryCSV, uploadHistoryToDrive, etc.)
// ... mantenha o restante das suas funções de service aqui ...
export async function listHistory(): Promise<MonteCarloHistoryItem[]> {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as MonteCarloHistoryItem[]);
        request.onerror = () => reject(request.error);
    });
}
export async function getHistoryItem(id: string): Promise<MonteCarloHistoryItem | null> {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as MonteCarloHistoryItem);
        request.onerror = () => reject(request.error);
    });
}
export function exportHistoryCSV(items: MonteCarloHistoryItem[]) {
    // ... sua função de exportação aqui
    console.log("Exporting CSV (stub)");
}
// @apps/trading-journal/src/services/monteCarloService.ts

// ... (Mantenha todo o código existente, incluindo saveHistory e listHistory) ...

// 💥 NOVO: Função para excluir um item do IndexedDB
export async function deleteHistoryItem(id: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    
    await new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}