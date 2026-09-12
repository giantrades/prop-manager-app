// STAGE 9 — SettingsPage (engine-driven). Moeda + export/import de dados (app-db v3) +
// import de payouts + logout. Sem dependência do storage legado (`dataStore`/`sync`/`drive`).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import { useFinance } from '@apps/state';
import { useCurrency } from '@apps/state';
import { supabase } from '@apps/supabase/client';
import { importLegacyPayoutsFromStorage, dumpAppDb, restoreAppDb } from '@apps/lib/db';
import SyncConflicts from '@apps/ui/SyncConflicts';
import PlatformStatusIndicator from '@apps/ui/PlatformStatusIndicator';
import { useToast } from '@apps/ui/Toast';
import { usePush } from '../../usePush';
import { usePlatform } from '@apps/state';
import { useCommandSnapshot } from '@apps/state';
import { useDrive } from '@apps/state/DriveContext';
import { ALL_ACTION_KINDS, ACTION_KIND_LABEL, getActionRules } from '@apps/lib/db';

function ActionRulesCard() {
  const finance = useFinance();
  const { updateActionRules } = useCommandSnapshot();
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    if (!finance) return;
    let alive = true;
    getActionRules(finance.ds).then((r) => { if (alive) setEnabled(r.enabled); }).catch(() => setEnabled(ALL_ACTION_KINDS));
    return () => { alive = false; };
  }, [finance]);

  const toggle = (k) => {
    const next = (enabled ?? []).includes(k) ? (enabled ?? []).filter((x) => x !== k) : [...(enabled ?? []), k];
    setEnabled(next);
    updateActionRules({ enabled: next });
  };

  return (
    <div className="st-card">
      <div className="st-title">Ações / notificações</div>
      <p className="st-hint">Escolha quais regras geram notificação na Home e na gaveta da navbar.</p>
      {ALL_ACTION_KINDS.map((k) => (
        <label key={k} className="st-check">
          <input type="checkbox" checked={(enabled ?? ALL_ACTION_KINDS).includes(k)} onChange={() => toggle(k)} />
          {ACTION_KIND_LABEL[k] ?? k}
        </label>
      ))}
    </div>
  );
}

function ConnectionsCard() {
  const { statuses, liveCount, lastSync, isRunning, startSync, stopSync } = usePlatform();
  return (
    <div className="st-card">
      <div className="st-title">Conexões de plataforma</div>
      <p className="st-hint">Ponte com Quantower/cTrader para trades e posições ao vivo.</p>
      <div className="st-row">
        <PlatformStatusIndicator
          statuses={statuses}
          liveCount={liveCount}
          lastSync={lastSync}
          isRunning={isRunning}
          onToggleSync={isRunning ? stopSync : startSync}
        />
      </div>
    </div>
  );
}

function CloudBackupCard() {
  const {
    logged, login, logout, backup,
    protonReady, protonLogged, protonLogin, protonLogout, backupToProton, protonSupported,
  } = useDrive();
  const { toast } = useToast();
  const finance = useFinance();
  const [busy, setBusy] = useState(false);

  const run = async (fn, label) => {
    if (!finance) return;
    setBusy(true);
    try {
      const { dumpAppDb } = await import('@apps/lib/db');
      const all = await dumpAppDb(finance.ds);
      await fn(JSON.stringify(all));
      toast(`Backup salvo — ${label}`);
    } catch (e) {
      toast(`Falha no backup: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="st-card">
      <div className="st-title">Backup na nuvem</div>
      <div className="st-cloud">
        <div className="st-cloud-row">
          <span className="st-cloud-name">Google Drive <span className={logged ? 'st-on' : 'st-off'}>●</span></span>
          {logged ? (
            <span className="st-row">
              <button className="st-btn" disabled={busy} onClick={() => run(backup, 'Google Drive')}>Backup agora</button>
              <button className="st-btn" onClick={logout}>Desconectar</button>
            </span>
          ) : (
            <button className="st-btn" onClick={login}>Conectar</button>
          )}
        </div>
        <div className="st-cloud-row">
          <span className="st-cloud-name">Proton Drive <span className={protonLogged ? 'st-on' : 'st-off'}>●</span></span>
          {protonLogged ? (
            <span className="st-row">
              <button className="st-btn" disabled={busy} onClick={() => run(backupToProton, 'Proton Drive')}>Backup agora</button>
              <button className="st-btn" onClick={protonLogout}>Desconectar</button>
            </span>
          ) : protonSupported ? (
            <button className="st-btn" onClick={protonLogin}>Conectar pasta</button>
          ) : (
            <button className="st-btn" disabled={busy} onClick={() => run(backupToProton, 'download')}>Baixar backup</button>
          )}
        </div>
      </div>
    </div>
  );
}

function PushSettingsCard() {
  const { supported, permission, subscribed, busy, subscribe, unsubscribe, hasVapidKey } = usePush();
  const { toast } = useToast();

  if (!supported) return null;

  const onToggle = async () => {
    if (subscribed) {
      await unsubscribe();
    } else {
      const res = await subscribe();
      if (!res.ok) {
        toast(
          res.reason === 'denied'
            ? 'Permissão de notificação negada no navegador.'
            : res.reason === 'no-vapid-key'
              ? 'VITE_VAPID_PUBLIC_KEY não configurada (ver supabase/README-push.md).'
              : `Falha ao ativar push: ${res.reason}`,
          { type: 'warn', durationMs: 8000 },
        );
      } else {
        toast('Push ativado neste dispositivo.');
      }
    }
  };

  return (
    <div className="st-card">
      <div className="st-title">Notificações push</div>
      <div className="st-row">
        <button className={`st-btn${subscribed ? ' active' : ''}`} onClick={onToggle} disabled={busy}>
          {subscribed ? 'Ativado ✓' : 'Ativar neste dispositivo'}
        </button>
        <span className="st-rate">
          {!hasVapidKey ? 'sem chave VAPID' : `permissão: ${permission}`}
        </span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const finance = useFinance();
  const { currency, setCurrency, rate, setRate } = useCurrency();
  const fileRef = useRef(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [conflicts, setConflicts] = useState([]);

  const handleExport = useCallback(async () => {
    if (!finance) return;
    setBusy(true);
    try {
      const data = await dumpAppDb(finance.ds);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financeos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup exportado.');
    } catch (e) {
      toast(`Falha ao exportar: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [finance]);

  const handleImport = useCallback(async (file) => {
    if (!finance) return;
    setBusy(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await restoreAppDb(finance.ds, data);
      toast('Dados importados.');
    } catch (e) {
      toast(`Falha ao importar: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [finance]);

  const handleImportPayouts = useCallback(async () => {
    if (!finance) return;
    setBusy(true);
    try {
      const res = await importLegacyPayoutsFromStorage(finance.ds, finance.chain);
      toast(`Payouts importados: ${res.importedCount} (${res.skippedCount} pulados).`);
    } catch (e) {
      toast(`Falha: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [finance]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const loadConflicts = useCallback(async () => {
    if (!finance?.cloud) return;
    try {
      setConflicts(await finance.cloud.listConflicts());
    } catch {
      /* sem sync = sem conflitos */
    }
  }, [finance]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  const handleResolve = useCallback(async (conflictId, choice) => {
    if (!finance?.cloud) return;
    setBusy(true);
    try {
      await finance.cloud.resolveConflictChoice(conflictId, choice);
      await loadConflicts();
      toast(choice === 'mine' ? 'Mantido o valor local (enviado à nuvem).' : 'Aplicado o valor da nuvem.');
    } catch (e) {
      toast(`Falha ao resolver: ${e instanceof Error ? e.message : e}`, { type: 'error' });
    } finally {
      setBusy(false);
    }
  }, [finance, loadConflicts]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Settings</h1></div>
      <ModuleTabs module="system" />
      <ConnectionsCard />
      <ActionRulesCard />
      <div className="st-card">
        <div className="st-title">Moeda</div>
        <div className="st-row">
          <button className={`st-btn${currency === 'USD' ? ' active' : ''}`} onClick={() => setCurrency('USD')}>USD</button>
          <button className={`st-btn${currency === 'BRL' ? ' active' : ''}`} onClick={() => setCurrency('BRL')}>BRL</button>
        </div>
        <label className="st-field">
          <span className="st-label">USD → BRL</span>
          <input
            className="st-input"
            type="number" step="0.01" min="0"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value || '0') || 0)}
            aria-label="Cotação USD para BRL"
          />
        </label>
        <p className="st-hint">
          Esse valor é aplicado ao seletor de moeda (USD/BRL) e converte todos os valores do app.
        </p>
      </div>

      <CloudBackupCard />

      <div className="st-card">
        <div className="st-title">Dados (app-db v3)</div>
        <div className="st-actions">
          <button className="st-btn" onClick={handleExport} disabled={busy}>Exportar JSON</button>
          <button className="st-btn" onClick={() => fileRef.current?.click()} disabled={busy}>Importar JSON</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
          <button className="st-btn" onClick={handleImportPayouts} disabled={busy}>Importar payouts (legado)</button>
        </div>
      </div>

      <PushSettingsCard />

      <div className="st-card">
        <div className="st-title">Conta</div>
        <div className="st-actions">
          <button className="st-btn st-btn-danger" onClick={handleLogout}>Sair</button>
        </div>
      </div>

      <SyncConflicts conflicts={conflicts} onResolve={handleResolve} loading={busy && conflicts.length === 0} />


    </div>
  );
}

const ST_CSS = `
.st-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.st-title { font-size: 14px; font-weight: 800; }
.st-row { display: flex; gap: 8px; align-items: center; }
.st-rate { font-size: 12px; color: var(--muted, #a1a7b3); }
.st-field { display: flex; flex-direction: column; gap: 6px; max-width: 260px; }
.st-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.st-input { background: #111623; border: 1px solid #273044; border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 14px; min-height: 42px; width: 100%; font-family: inherit; font-variant-numeric: tabular-nums; }
.st-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.st-hint { font-size: 12px; color: var(--muted, #a1a7b3); margin: 0; }
.st-cloud { display: flex; flex-direction: column; gap: 10px; }
.st-cloud-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.st-cloud-row:last-child { border-bottom: none; }
.st-cloud-name { font-size: 13px; font-weight: 600; }
.st-on { color: var(--green, #2ecc71); }
.st-off { color: var(--red, #e74c3c); }
.st-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.st-btn { padding: 10px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.st-btn.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); font-weight: 700; }
.st-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.st-msg { padding: 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); font-size: 13px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('st-styles')) {
  const style = document.createElement('style');
  style.id = 'st-styles';
  style.textContent = ST_CSS;
  document.head.appendChild(style);
}
