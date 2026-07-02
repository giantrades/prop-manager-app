// packages/utils/backupPayload.js
import { openDB } from 'idb';
import * as store from '@apps/lib/dataStore';

async function getJournalDB() {
    // Mesmo banco/versão usado pelo JournalProvider e pela página de Settings do Journal
    return openDB('journal-db', 2);
}

// ============================================================
// 📦 Monta o payload COMPLETO de backup:
// tudo que vem de dataStore.getAll() (accounts, payouts, settings,
// firms, trades, goals, livePositions, tags, etc.) + strategies
// (que vivem só no journal-db, fora do dataStore).
// ============================================================
export async function getFullBackupPayload() {
    const base = store.getAll();
    let strategies = [];
    try {
        const db = await getJournalDB();
        strategies = await db.getAll('strategies');
    } catch (e) {
        console.warn('⚠️ Não foi possível ler strategies do journal-db:', e);
    }
    return { ...base, strategies };
}

// ============================================================
// 🔄 Aplica um payload completo restaurado (de Google ou Proton):
// - Mescla e persiste no localStorage compartilhado (dataStore)
// - Restaura trades e strategies no journal-db (fonte de verdade
//   usada pelo JournalProvider)
// - Dispara 'datastore:change' com source 'restore', para que
//   qualquer provider escutando (ex: JournalProvider) recarregue
//   seu estado em memória automaticamente.
// ============================================================
export async function applyFullBackupPayload(remote) {
    if (!remote || typeof remote !== 'object') return false;

    try {
        const current = store.getAll();
        const merged = {
            ...current,
            accounts: remote.accounts ?? current.accounts,
            payouts: remote.payouts ?? current.payouts,
            settings: remote.settings ?? current.settings,
            firms: remote.firms ?? current.firms,
            trades: remote.trades ?? current.trades,
            goals: remote.goals ?? current.goals,
            livePositions: remote.livePositions ?? current.livePositions,
            tags: remote.tags ?? current.tags,
            connectionFirmMap: remote.connectionFirmMap ?? current.connectionFirmMap,
            accountFirmOverride: remote.accountFirmOverride ?? current.accountFirmOverride,
        };

        localStorage.setItem('propmanager-data-v1', JSON.stringify(merged));

        // Restaura trades + strategies no journal-db (é de lá que o
        // JournalProvider realmente lê, e é para lá que ele salva)
        try {
            const db = await getJournalDB();

            if (Array.isArray(remote.trades)) {
                const tx = db.transaction('trades', 'readwrite');
                await tx.store.clear();
                for (const t of remote.trades) await tx.store.put(t);
                await tx.done;
            }

            if (Array.isArray(remote.strategies)) {
                const tx2 = db.transaction('strategies', 'readwrite');
                await tx2.store.clear();
                for (const s of remote.strategies) await tx2.store.put(s);
                await tx2.done;
            }
        } catch (e) {
            console.warn('⚠️ Não foi possível restaurar trades/strategies no journal-db:', e);
        }

        window.dispatchEvent(new CustomEvent('datastore:change', { detail: { source: 'restore' } }));
        return true;
    } catch (err) {
        console.error('Erro ao aplicar backup completo:', err);
        return false;
    }
}