// src/pages/Settings.jsx
import React from "react";
import { useCurrency } from '@apps/state'
import { useData } from '@apps/state'

export default function Settings() {
  const { rate, setRate } = useCurrency();
  const { autoSync, setAutoSync, backupToDrive, restoreFromDrive } = useData();

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
          Esse valor será usado para o seletor de moeda no topo (USD/BRL) e aplicado ao Dashboard, Contas e Payouts.
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
          <button className="btn" onClick={backupToDrive}>Backup agora</button>
          <button className="btn ghost" onClick={restoreFromDrive}>Restaurar do Drive</button>
        </div>
      </div>
    </div>
  );
}
