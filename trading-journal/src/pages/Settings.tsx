// src/pages/Settings.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext";
import { getFullBackupPayload, applyFullBackupPayload } from "@apps/utils/backupPayload.js";
import { openDB } from 'idb';
import PlatformConnectionSettings from '@apps/ui/PlatformConnectionSettings';

async function getDB() {
  return openDB('journal-db', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('trades')) {
        db.createObjectStore('trades', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('accounts')) {
        db.createObjectStore('accounts', { keyPath: 'id' });
      }
    },
  });
}


export default function Settings() {
  const { rate, setRate } = useCurrency();
  const {
    backup, loadBackup, logged, login, logout,
    protonSupported, protonLogged, protonLogin, protonLogout,
    backupToProton, loadProtonBackup,
  } = useDrive();
  const [autoSync, setAutoSync] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // ☁️ Auto backup a cada 30s — Google + Proton, sempre com o snapshot completo
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(async () => {
      try {
        const allData = await getFullBackupPayload();
        if (logged) {
          await backup(JSON.stringify(allData));
          console.log("☁️ Auto-sync (Google) executado com sucesso.");
        }
        if (protonLogged || !protonSupported) {
          await backupToProton(JSON.stringify(allData));
          console.log("☁️ Auto-sync (Proton) executado com sucesso.");
        }
      } catch (e) {
        console.warn("Auto-sync falhou:", e);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [autoSync, backup, backupToProton, logged, protonLogged, protonSupported]);

  // ===========================================================
  // 🔄 Aplica dados restaurados (Google OU Proton). A função
  // compartilhada (applyFullBackupPayload) já grava tudo no
  // localStorage E no journal-db (trades + strategies), e dispara
  // 'datastore:change' com source 'restore' — o JournalProvider
  // escuta esse evento e recarrega trades/strategies sozinho,
  // então a tela atualiza sem precisar de F5.
  // ===========================================================
  const onRestoreGoogle = async () => {
    setRestoreLoading(true);
    try {
      const data = await loadBackup();
      if (data) {
        const ok = await applyFullBackupPayload(data);
        if (ok) alert('✅ Dados restaurados do Google Drive!');
      }
    } finally {
      setRestoreLoading(false);
    }
  };

  const onRestoreProton = async () => {
    setRestoreLoading(true);
    try {
      const data = await loadProtonBackup();
      if (data) {
        const ok = await applyFullBackupPayload(data);
        if (ok) alert('✅ Dados restaurados do Proton Drive!');
      }
    } finally {
      setRestoreLoading(false);
    }
  };

  // ⚙️ Função para recalcular fundings das contas
  const handleRecalcFunding = useCallback(async () => {
    try {
      setRecalcLoading(true);
      const db = await getDB();
      const allTrades = await db.getAll("trades");

      const ds = await import('@apps/lib/dataStore.js');
      const { getAll, updateAccount } = ds;
      const all = await getAll();
      const accounts = all.accounts || [];

      // 🔹 Zera fundings primeiro
      for (const acc of accounts) {
        await updateAccount(acc.id, { ...acc, currentFunding: 0 });
      }

      // 🔹 Aplica todos os trades uma única vez
      for (const trade of allTrades) {
        for (const accEntry of trade.accounts || []) {
          const acc = accounts.find(a => a.id === accEntry.accountId);
          if (!acc) continue;

          const pnlImpact = (trade.result_net || 0) * (accEntry.weight ?? 1);
          acc.currentFunding = (acc.currentFunding || 0) + pnlImpact;
        }
      }

      // 🔹 Salva fundings finais
      for (const acc of accounts) {
        await updateAccount(acc.id, acc);
      }

      alert("✅ Fundings recalculados com sucesso!");
    } catch (err) {
      console.error("Erro ao recalcular fundings:", err);
      alert("❌ Erro ao recalcular fundings: " + err.message);
    } finally {
      setRecalcLoading(false);
    }
  }, []);


  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* -------- PLATFORM CONNECTIONS -------- */}
      <div>
        <h3 style={{ marginBottom: 12 }}>🔗 Platform Connections</h3>
        <PlatformConnectionSettings />
      </div>

      {/* -------- SETTINGS GERAIS -------- */}
      <div className="card">
        <h3>⚙️ Settings</h3>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>USD → BRL</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={rate}
            onChange={(e) =>
              setRate(parseFloat(e.target.value || "0") || 0)
            }
          />
        </div>
        <p className="muted">
          Esse valor será usado para o seletor de moeda no topo (USD/BRL) e aplicado ao Prop-Manager.
        </p>
      </div>

      {/* -------- BACKUP NA NUVEM -------- */}
      <div className="card">
        <h3>☁️ Backup na Nuvem</h3>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!autoSync}
              onChange={(e) => setAutoSync(!!e.target.checked)}
            />
            Auto-Sync a cada 30s (Google + Proton)
          </label>
          <p className="muted">
            Quando ligado, envia um backup completo (contas, payouts, trades, goals, firms, etc.) para todos os drives conectados.
          </p>
        </div>

        {/* Google Drive */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border, #333)' }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>
            Google Drive {logged ? '🟢 Conectado' : '🔴 Desconectado'}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: 'wrap' }}>
            {logged ? (
              <>
                <button className="btn" onClick={async () => backup(JSON.stringify(await getFullBackupPayload()))}>
                  Backup agora
                </button>
                <button className="btn ghost" onClick={onRestoreGoogle} disabled={restoreLoading}>
                  {restoreLoading ? "Restaurando..." : "Restaurar do Drive"}
                </button>
                <button className="btn ghost" onClick={logout}>
                  Desconectar
                </button>
              </>
            ) : (
              <button className="btn" onClick={login}>Conectar Google Drive</button>
            )}
          </div>
        </div>

        {/* Proton Drive */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border, #333)' }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>
            Proton Drive {protonSupported ? (protonLogged ? '🟢 Conectado' : '🔴 Desconectado') : '⬇️ Modo Download'}
          </p>

          {!protonSupported && (
            <p className="muted" style={{ marginBottom: 8 }}>
              Seu navegador não permite conectar diretamente a uma pasta local (funciona em Chrome, Edge ou Opera).
              "Backup agora" vai <strong>baixar</strong> o arquivo <code>propmanager-backup.json</code> —
              mova-o manualmente para a pasta Trading Management &gt; PropManager do Proton Drive.
            </p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: 'wrap' }}>
            {protonSupported && !protonLogged && (
              <button className="btn" onClick={protonLogin}>Conectar pasta do Proton Drive</button>
            )}
            {protonSupported && protonLogged && (
              <button className="btn ghost" onClick={protonLogout}>Desconectar</button>
            )}

            <button className="btn" onClick={async () => backupToProton(JSON.stringify(await getFullBackupPayload()))}>
              Backup agora
            </button>

            {protonSupported && protonLogged && (
              <button className="btn ghost" onClick={onRestoreProton} disabled={restoreLoading}>
                {restoreLoading ? "Restaurando..." : "Restaurar do Proton"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* -------- RECALCULAR FUNDINGS -------- */}
      <div className="card">
        <h3>🔄 Recalcular Fundings das Contas</h3>
        <p className="muted">
          Se os saldos das contas estiverem incorretos, clique abaixo para recalcular com base em todos os trades salvos.
        </p>
        <button
          className={`btn ${recalcLoading ? "ghost" : ""}`}
          onClick={handleRecalcFunding}
          disabled={recalcLoading}
        >
          {recalcLoading ? "Recalculando..." : "Recalcular Fundings"}
        </button>
      </div>
    </div>
  );
}