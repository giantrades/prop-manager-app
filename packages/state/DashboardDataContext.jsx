// src/state/DashboardDataContext.jsx
import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import * as store from "@apps/lib/dataStore";
import { isSignedIn, uploadOrUpdateJSON, downloadLatestJSON } from "../utils/googleDrive.js";
import { isProtonDriveLogged, backupToProtonDrive, ensureProtonPermission } from "../utils/protonDrive.js";
import { getFullBackupPayload, applyFullBackupPayload } from "../utils/backupPayload.js";

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  // inicializa a partir do store local (cache)
  const all = store.getAll() || {}
  const [accounts, setAccounts] = useState(all.accounts || []);
  const [payouts, setPayouts] = useState(all.payouts || []);
  const [settings, setSettings] = useState(all.settings || { methods: ['Rise', 'Wise', 'Pix', 'Paypal', 'Cripto'] });
  const [firms, setFirms] = useState(all.firms || []);
  const [autoSync, setAutoSync] = useState(false);
  useEffect(() => {
    const syncFromStorage = () => {
      try {
        const data = JSON.parse(localStorage.getItem('propmanager-data-v1') || '{}');
        if (data.accounts) setAccounts(data.accounts);
        if (data.payouts) setPayouts(data.payouts);
        if (data.settings) setSettings(data.settings);
        if (data.firms) setFirms(data.firms);
      } catch (err) {
        console.warn('Erro ao sincronizar localStorage:', err);
      }
    };

    // roda na primeira montagem
    syncFromStorage();

    // sincroniza entre abas / apps
    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  // Backup para o Drive — sempre usa o snapshot MAIS COMPLETO do store
  // (inclui trades, goals, livePositions, tags, etc. — não só o que este
  // contexto guarda em state)
  const backupToDrive = async () => {
    if (!autoSync) return; // SOMENTE FAZ AUTO-SYNC SE ESTIVER ATIVADO

    const toSend = await getFullBackupPayload();

    // Backup para Google Drive
    if (isSignedIn()) {
      try {
        await uploadOrUpdateJSON("propmanager-backup.json", toSend);
        console.log("✅ Backup enviado para o Google Drive (Auto-sync)");
      } catch (err) {
        console.error("Erro ao fazer backup no Drive", err);
      }
    }

    // Backup para Proton Drive
    try {
      const protonLogged = await isProtonDriveLogged();
      if (protonLogged) {
        const permOk = await ensureProtonPermission();
        if (permOk) {
          await backupToProtonDrive(toSend);
          console.log("✅ Backup enviado para o Proton Drive (Auto-sync)");
        }
      }
    } catch (err) {
      console.error("Erro ao fazer backup no Proton Drive", err);
    }
  };

  // ===========================================================
  // 🔄 Aplica um objeto de dados remoto (vindo de qualquer drive)
  // ao estado do app inteiro + localStorage. É isso que faz o
  // "Restaurar" realmente restaurar, e não só baixar e descartar.
  // ===========================================================
  const applyRemoteData = async (remote) => {
    if (!remote || typeof remote !== 'object') return false;

    // Persiste tudo (localStorage + trades/strategies no journal-db) e
    // dispara 'datastore:change' (source: 'restore') para outros
    // providers (ex: JournalProvider) recarregarem sozinhos.
    const ok = await applyFullBackupPayload(remote);
    if (!ok) return false;

    // Atualiza os states que este contexto expõe, lendo de volta do
    // store já mesclado (garante consistência com o que foi persistido)
    const merged = store.getAll();
    setAccounts(merged.accounts || []);
    setPayouts(merged.payouts || []);
    setSettings(merged.settings || settings);
    setFirms(merged.firms || []);

    return true;
  };

  // Restaura a partir do Google Drive (arquivo mais recente)
  const restoreFromDrive = async () => {
    try {
      const remote = await downloadLatestJSON();
      if (!remote) return null;
      await applyRemoteData(remote);
      return true;
    } catch (err) {
      console.error("Erro no restoreFromDrive", err)
      return null
    }
  };

  // Wrappers para CRUD — mantemos o store local e atualizamos state/Drive
  // ACCOUNTS
  const createAccount = (partial) => {
    const a = store.createAccount(partial)
    const all = store.getAll()
    setAccounts(all.accounts)
    backupToDrive()
    return a
  }
  const updateAccount = (id, patch) => {
    const a = store.updateAccount(id, patch)
    const all = store.getAll()
    setAccounts(all.accounts)
    backupToDrive()
    return a
  }
  const deleteAccount = (id) => {
    store.deleteAccount(id)
    const all = store.getAll()
    setAccounts(all.accounts)
    setPayouts(all.payouts)
    backupToDrive()
  }

  // PAYOUTS
  const createPayout = (partial) => {
    const p = store.createPayout(partial)
    const all = store.getAll()
    setPayouts(all.payouts)
    setAccounts(all.accounts) // caso currentFunding tenha sido atualizado no store
    backupToDrive()
    return p
  }
  const updatePayout = (id, patch) => {
    const p = store.updatePayout(id, patch)
    const all = store.getAll()
    setPayouts(all.payouts)
    setAccounts(all.accounts)
    backupToDrive()
    return p
  }
  const deletePayout = (id) => {
    store.deletePayout(id)
    const all = store.getAll()
    setPayouts(all.payouts)
    setAccounts(all.accounts)
    backupToDrive()
  }

  // SETTINGS
  const patchSettings = (patch) => {
    const s = store.setSettings(patch)
    setSettings(s)
    backupToDrive()
    return s
  }

  // FIRMS (new)
  const getFirms = () => store.getFirms()
  const createFirm = (partial) => {
    const f = store.createFirm(partial)
    const all = store.getAll()
    setFirms(all.firms)
    backupToDrive()
    return f
  }
  const updateFirm = (id, patch) => {
    const f = store.updateFirm(id, patch)
    const all = store.getAll()
    setFirms(all.firms)
    backupToDrive()
    return f
  }
  const deleteFirm = (id) => {
    store.deleteFirm(id)
    const all = store.getAll()
    setFirms(all.firms)
    setAccounts(all.accounts) // contas possivelmente desvinculadas
    backupToDrive()
  }
  const getFirmStats = (id) => store.getFirmStats(id)

  // getAccountStats wrapper
  const getAccountStats = (id) => store.getAccountStats(id)

  // Construindo a API do contexto
  const api = useMemo(() => ({
    // states
    accounts, payouts, settings, firms,

    // accounts
    createAccount, updateAccount, deleteAccount, getAccountStats,

    // payouts
    createPayout, updatePayout, deletePayout,

    // settings
    patchSettings,

    // firms
    getFirms, createFirm, updateFirm, deleteFirm, getFirmStats,

    // Google Drive
    backupToDrive,
    restoreFromDrive,

    // Restauração genérica (usada também para Proton Drive)
    applyRemoteData,

    // misc
    autoSync, setAutoSync,
  }), [accounts, payouts, settings, firms, autoSync]);

  return <DataCtx.Provider value={api}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);