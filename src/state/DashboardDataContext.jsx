import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import * as store from "../lib/dataStore.js";
import { isSignedIn, uploadOrUpdateJSON, downloadLatestJSON } from "../utils/googleDrive.js";

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const [accounts, setAccounts] = useState(store.getAll().accounts);
  const [payouts, setPayouts] = useState(store.getAll().payouts);
  const [autoSync, setAutoSync] = useState(false);

  // ---- Google Drive Sync ----
  const backupToDrive = async () => {
    if (!isSignedIn()) return;
    await uploadOrUpdateJSON("propmanager-backup.json", { accounts, payouts });
    console.log("✅ Backup enviado para o Google Drive");
  };

  const restoreFromDrive = async () => {
    if (!isSignedIn()) return;
    const remoteData = await downloadLatestJSON();
    if (remoteData?.accounts && remoteData?.payouts) {
      setAccounts(remoteData.accounts);
      setPayouts(remoteData.payouts);
      console.log("✅ Dados restaurados do Google Drive");
    }
  };

  // Atualiza dados locais sempre que o localStorage mudar
  useEffect(() => {
    const i = setInterval(() => {
      const { accounts: a, payouts: p } = store.getAll();
      setAccounts(a);
      setPayouts(p);
    }, 500);
    return () => clearInterval(i);
  }, []);

  // AutoSync (backup periódico)
  useEffect(() => {
    if (!autoSync) return;
    const i = setInterval(() => {
      backupToDrive();
    }, 30000);
    return () => clearInterval(i);
  }, [autoSync, accounts, payouts]);

  const api = useMemo(
    () => ({
      // contas
      createAccount: (partial) => {
        const a = store.createAccount(partial);
        setAccounts(store.getAll().accounts);
        return a;
      },
      updateAccount: (id, patch) => {
        const a = store.updateAccount(id, patch);
        setAccounts(store.getAll().accounts);
        return a;
      },
      deleteAccount: (id) => {
        store.deleteAccount(id);
        const all = store.getAll();
        setAccounts(all.accounts);
        setPayouts(all.payouts);
      },
      // payouts
      createPayout: (partial) => {
        const p = store.createPayout(partial);
        setPayouts(store.getAll().payouts);
        return p;
      },
      updatePayout: (id, patch) => {
        const p = store.updatePayout(id, patch);
        setPayouts(store.getAll().payouts);
        return p;
      },
      deletePayout: (id) => {
        store.deletePayout(id);
        setPayouts(store.getAll().payouts);
      },
      getAccountStats: store.getAccountStats,

      // estados
      accounts,
      payouts,
      autoSync,
      setAutoSync,

      // Google Drive
      backupToDrive,
      restoreFromDrive,
    }),
    [accounts, payouts, autoSync]
  );

  return <DataCtx.Provider value={api}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
