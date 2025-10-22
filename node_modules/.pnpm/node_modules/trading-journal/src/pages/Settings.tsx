// src/pages/Settings.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useCurrency } from "@apps/state";
import { useDrive } from "@apps/state/DriveContext";
import {getAll,updateAccount,} from "@apps/lib/dataStore";
import { openDB } from 'idb';

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
  const { backup, loadBackup } = useDrive();
  const [autoSync, setAutoSync] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);

  // ☁️ Auto backup a cada 30s
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(async () => {
      try {
        const allData = getAll();
        await backup(JSON.stringify(allData));
        console.log("☁️ Auto-sync executado com sucesso.");
      } catch (e) {
        console.warn("Auto-sync falhou:", e);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [autoSync, backup]);

  // ⚙️ Função para recalcular fundings das contas
  const handleRecalcFunding = useCallback(async () => {
    try {
      setRecalcLoading(true);
      const db = await getDB();
      const allTrades = await db.getAll("trades");
      const { accounts } = getAll();

      // Zera os fundings
      for (const acc of accounts) {
        await updateAccount(acc.id, { ...acc, currentFunding: 0 });
      }

      // Recalcula com base em todos os trades existentes
      for (const trade of allTrades) {
        if (!trade.accounts || !Array.isArray(trade.accounts)) continue;
        for (const accEntry of trade.accounts) {
          const acc = accounts.find((a) => a.id === accEntry.accountId);
          if (!acc) continue;

          const pnlImpact = (trade.result_net || 0) * (accEntry.weight ?? 1);
          await updateAccount(acc.id, {
            ...acc,
            currentFunding: (acc.currentFunding || 0) + pnlImpact,
          });
        }
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

      {/* -------- GOOGLE DRIVE -------- */}
      <div className="card">
        <h3>☁️ Google Drive</h3>

        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!autoSync}
              onChange={(e) => setAutoSync(!!e.target.checked)}
            />
            Auto-Sync a cada 30s
          </label>
          <p className="muted">
            Quando ligado, enviará um backup do estado (accounts/payouts) para seu Google Drive/PropManager/propmanager-backup.json.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            className="btn"
            onClick={() => backup(JSON.stringify(getAll()))}
          >
            Backup agora
          </button>

          <button className="btn ghost" onClick={loadBackup}>
            Restaurar do Drive
          </button>
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
