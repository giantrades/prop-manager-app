import { openDB } from 'idb';

const DB_NAME = 'propmanager-proton-db';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'proton-dir-handle';

// ============================================================
// 🔍 Detecção de suporte do navegador (File System Access API)
// ============================================================
export function isFileSystemAccessSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

// ============================================================
// 📥 Fallback: baixa o backup como arquivo (Firefox/Safari/etc)
// ============================================================
export function downloadBackupFile(data, filename = 'propmanager-backup.json') {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

export async function loginProtonDrive() {
  if (!isFileSystemAccessSupported()) {
    // Navegador sem suporte — não há "conexão" real de pasta.
    // O caller deve tratar esse retorno e usar backup via download.
    return 'unsupported';
  }
  try {
    const dirHandle = await window.showDirectoryPicker({
      id: 'proton-drive',
      mode: 'readwrite'
    });

    if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        throw new Error('Permission not granted');
      }
    }

    const db = await getDB();
    await db.put(STORE_NAME, dirHandle, HANDLE_KEY);
    return true;
  } catch (error) {
    console.error('Proton Drive Login Error:', error);
    return false;
  }
}

export async function logoutProtonDrive() {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, HANDLE_KEY);
    return true;
  } catch (err) {
    console.error('Logout error:', err);
    return false;
  }
}

export async function isProtonDriveLogged() {
  if (!isFileSystemAccessSupported()) return false;
  try {
    const db = await getDB();
    const handle = await db.get(STORE_NAME, HANDLE_KEY);
    if (!handle) return false;
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    return permission === 'granted';
  } catch (e) {
    return false;
  }
}

export async function ensureProtonPermission() {
  if (!isFileSystemAccessSupported()) return false;
  const db = await getDB();
  const dirHandle = await db.get(STORE_NAME, HANDLE_KEY);
  if (!dirHandle) return false;

  if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      return false;
    }
  }
  return true;
}

// ============================================================
// 💾 Backup — usa File System Access API, ou cai para download
// ============================================================
export async function backupToProtonDrive(data) {
  if (!isFileSystemAccessSupported()) {
    downloadBackupFile(data);
    return 'downloaded';
  }

  const db = await getDB();
  const dirHandle = await db.get(STORE_NAME, HANDLE_KEY);

  if (!dirHandle) {
    throw new Error('Proton Drive directory not connected.');
  }

  if ((await dirHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await dirHandle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new Error('Permission denied to write to Proton Drive directory.');
    }
  }

  try {
    const fileHandle = await dirHandle.getFileHandle('propmanager-backup.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    console.error('Proton Drive Backup Error:', error);
    throw error;
  }
}

export async function restoreFromProtonDrive() {
  if (!isFileSystemAccessSupported()) {
    throw new Error('Seu navegador não suporta restaurar diretamente da pasta local. Selecione o arquivo baixado manualmente.');
  }

  const db = await getDB();
  const dirHandle = await db.get(STORE_NAME, HANDLE_KEY);

  if (!dirHandle) {
    throw new Error('Proton Drive directory not connected.');
  }

  if ((await dirHandle.queryPermission({ mode: 'read' })) !== 'granted') {
    if ((await dirHandle.requestPermission({ mode: 'read' })) !== 'granted') {
      throw new Error('Permission denied to read from Proton Drive directory.');
    }
  }

  try {
    const fileHandle = await dirHandle.getFileHandle('propmanager-backup.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (error) {
    if (error.name === 'NotFoundError') {
      console.warn('propmanager-backup.json not found in Proton Drive folder.');
      return null;
    }
    console.error('Proton Drive Restore Error:', error);
    throw error;
  }
}