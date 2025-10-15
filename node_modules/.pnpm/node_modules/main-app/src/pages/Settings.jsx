// src/pages/Settings.jsx
import React, {useState, useEffect} from "react";
import { useCurrency } from '@apps/state'
import {useDrive, DriveProvider} from "@apps/state/DriveContext";
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';

export default function Settings() {
  const { rate, setRate } = useCurrency();
  const [autoSync, setAutoSync] = useState(false);
const { backup, loadBackup } = useDrive();

useEffect(() => {
  if (!autoSync) return;
  const interval = setInterval(async () => {
    try {
      const allData = getAll();
      await backup(JSON.stringify(allData));
      console.log('☁️ Auto-sync executado com sucesso.');
    } catch (e) {
      console.warn('Auto-sync falhou:', e);
    }
  }, 30000);
  return () => clearInterval(interval);
}, [autoSync, backup]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3>⚙️ Settings</h3>

        <div className="field" style={{ maxWidth: 320 }}>
          <label>USD → BRL</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value || "0") || 0)}
          />
        </div>
        <p className="muted">
          Esse valor será usado para o seletor de moeda no topo (USD/BRL) e aplicado ao Prop-Manager.
        </p>
      </div>

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
          <p className="muted">Quando ligado, enviará um backup do estado (accounts/payouts) para seu Google Drive/PropManager/propmanager-backup.json.</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={() => backup(JSON.stringify(getAll()))}>
  Backup agora
</button>

<button className="btn ghost" onClick={loadBackup}>
  Restaurar do Drive
</button>
        </div>
      </div>
    </div>
  );
}
