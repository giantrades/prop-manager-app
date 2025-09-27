// src/state/DashboardDataContext.jsx
import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import * as store from "@apps/lib/dataStore.js";
import { isSignedIn, uploadOrUpdateJSON, downloadLatestJSON } from "@apps/utils/googleDrive.js";

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  // inicializa a partir do store local (cache)
  const all = store.getAll() || {}
  const [accounts, setAccounts] = useState(all.accounts || []);
  const [payouts, setPayouts] = useState(all.payouts || []);
  const [settings, setSettings] = useState(all.settings || { methods: ['Rise','Wise','Pix','Paypal','Cripto'] });
  const [firms, setFirms] = useState(all.firms || []);
  const [autoSync, setAutoSync] = useState(false);

  // Backup para o Drive — envia o JSON com todas as chaves
  const backupToDrive = async (payload) => {
    if (!isSignedIn()) return;
    const toSend = payload || { accounts, payouts, settings, firms };
    try {
      await uploadOrUpdateJSON("propmanager-backup.json", toSend);
      console.log("✅ Backup enviado para o Google Drive");
    } catch (err) {
      console.error("Erro ao fazer backup no Drive", err);
      throw err;
    }
  };

  // Restaura a partir do Drive (arquivo mais recente)
  const restoreFromDrive = async () => {
    try {
      const remote = await downloadLatestJSON();
      if (!remote) return null;
      // assegura compatibilidade/migração
      const remoteAccounts = remote.accounts || []
      const remotePayouts = remote.payouts || []
      const remoteSettings = remote.settings || settings
      const remoteFirms = remote.firms || []

      // atualiza states locais
      setAccounts(remoteAccounts)
      setPayouts(remotePayouts)
      setSettings(remoteSettings)
      setFirms(remoteFirms)

      // também atualiza localStorage (store) para ficar consistente offline
      const data = store.getAll()
      data.accounts = remoteAccounts
      data.payouts = remotePayouts
      data.settings = remoteSettings
      data.firms = remoteFirms
      try { // escrevendo no localStore
        // usando funções existentes do store
        remoteSettings && store.setSettings(remoteSettings)
        // sobrescreve diretamente (save) se seu store expor função, caso contrário mantém localStorage
        localStorage.setItem('propmanager-data-v1', JSON.stringify({ accounts: remoteAccounts, payouts: remotePayouts, settings: remoteSettings, firms: remoteFirms }))
      } catch(e){}
      return true
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
    // backup
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms })
    return a
  }
  const updateAccount = (id, patch) => {
    const a = store.updateAccount(id, patch)
    const all = store.getAll()
    setAccounts(all.accounts)
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms })
    return a
  }
  const deleteAccount = (id) => {
    store.deleteAccount(id)
    const all = store.getAll()
    setAccounts(all.accounts)
    setPayouts(all.payouts)
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms })
  }

  // PAYOUTS
  const createPayout = (partial) => {
    const p = store.createPayout(partial)
    const all = store.getAll()
    setPayouts(all.payouts)
    setAccounts(all.accounts) // caso currentFunding tenha sido atualizado no store
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms })
    return p
  }
  const updatePayout = (id, patch) => {
    const p = store.updatePayout(id, patch)
    const all = store.getAll()
    setPayouts(all.payouts)
    setAccounts(all.accounts)
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms })
    return p
  }
  const deletePayout = (id) => {
    store.deletePayout(id)
    const all = store.getAll()
    setPayouts(all.payouts)
    setAccounts(all.accounts)
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms })
  }

  // SETTINGS
  const patchSettings = (patch) => {
    const s = store.setSettings(patch)
    setSettings(s)
    backupToDrive({ accounts, payouts, settings: s, firms })
    return s
  }

  // FIRMS (new)
  const getFirms = () => store.getFirms()
  const createFirm = (partial) => {
    const f = store.createFirm(partial)
    const all = store.getAll()
    setFirms(all.firms)
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms: all.firms })
    return f
  }
  const updateFirm = (id, patch) => {
    const f = store.updateFirm(id, patch)
    const all = store.getAll()
    setFirms(all.firms)
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms: all.firms })
    return f
  }
  const deleteFirm = (id) => {
    store.deleteFirm(id)
    const all = store.getAll()
    setFirms(all.firms)
    setAccounts(all.accounts) // contas possivelmente desvinculadas
    backupToDrive({ accounts: all.accounts, payouts: all.payouts, settings, firms: all.firms })
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

    // misc
    autoSync, setAutoSync,
  }), [accounts, payouts, settings, firms, autoSync]);

  return <DataCtx.Provider value={api}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
