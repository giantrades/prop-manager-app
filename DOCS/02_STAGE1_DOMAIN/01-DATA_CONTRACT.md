# STAGE 1 — Data Contract (schema + eventos + versão)

## Ponto de partida real (verificado, não hipotético)

Antes de desenhar `v3`, o estado atual são **3 sistemas de persistência divergentes**,
não uma IndexedDB única em v1/v2:

```
localStorage['propmanager-data-v1']   <- fonte de verdade do main-app (1 blob JSON:
                                          accounts, payouts, firms, trades, goals, settings)
IndexedDB('journal-db', v2)           <- espelho escrito por SyncProvider, lido pelo
                                          trading-journal (app Vite separado, base:/journal/)
IndexedDB('quantower-ledger', v1)     <- dedup de trade por plataforma, COM backup
                                          próprio em localStorage (outra chave)
```

`v3` precisa migrar os 3, não só "subir a versão de uma IndexedDB que já existia".

## Stores IndexedDB v3 (nomes finais)

`app-db v3`: `accounts, prop_extensions, transactions, positions, trades, payouts, goals,
tax_records, snapshots_networth, firm_costs, meta`

Legado (read-only até confirmar migração, depreciar depois):
`propmanager-data-v1` (localStorage), `journal-db v2`, `quantower-ledger v1`.

## Convenções

- IndexedDB e UI: camelCase. Supabase: snake_case só na borda (push/pull), marcado
  explicitamente com comentário `// SUPABASE BOUNDARY` no arquivo que faz a conversão —
  fora desse arquivo, `_[a-z]` em nome de campo é bug, não estilo.
- **Atenção**: o `Trade` de hoje já mistura casing no MESMO registro (`entry_datetime`
  ao lado de `accountId`) — a migração precisa do rename explícito listado em
  `00-DOMAIN_MODEL.md`, não só "parar de converter na borda".
- Todo registro: `{ id, updatedAt, deviceId, version }`. Sync usa
  `entityId+updatedAt+deviceId+version`, nunca LWW cego sobre o registro inteiro (ver
  `03-SYNC_PROTOCOL.md` pra granularidade real de conflito).
- Datas: ISO 8601 com timezone (`date-fns`). Proibido `split('T')` ingênuo — confirmado
  em 10+ pontos do código atual (`dataStore.js` x3, `Dashboard.jsx`, `Dashboard.tsx` do
  trading-journal, `Goals.jsx`, `TradeForm.tsx`, `TradeTable.tsx`, `ExecutionsEditor.jsx`);
  centralizar em `packages/lib/dateUtils.ts` único.
- Moeda: valor + `currency` + `rate` com timestamp. `rate=0` proibido (zera tudo).

## Eventos (únicos permitidos) — payload exato

```ts
'datastore:change' -> {
  timestamp: number,
  source: 'local'|'sync:pull'|'sync:push'|'restore'|'quantower',
  entityType?: 'account'|'transaction'|'trade'|'payout'|'goal'|'position',
  entityIds?: string[],           // quais registros mudaram, pra listener seletivo
                                   // (hoje o handler dispara push pra QUALQUER mudança,
                                   // sem saber o que mudou — impossível de debounce
                                   // por tipo de dado)
}

'sync:pushed' -> { count: number, entityCounts: Record<string, number>, durationMs: number }
'sync:pulled' -> { count: number, entityCounts: Record<string, number>, durationMs: number }
'sync:error'  -> { phase: 'push'|'pull', message: string, retryable: boolean, attempt: number }
                 // NOVO — hoje um push que falha só faz console.error e desaparece;
                 // sem esse evento, a UI não tem como mostrar "não sincronizou" em
                 // lugar nenhum

'quantower:synced' -> { count: number, lastSync: string, accountIds: string[] }
'quantower:error'  -> { message: string, code: 'bridge_offline'|'bridge_stale_version'|
                         'auth_failed'|'unknown', bridgeVersion?: string }

'risk:warning' -> {
  accountId: string, level: 'warn'|'stop',
  metric: 'dailyDD'|'trailingDD'|'maxDD'|'concentration',
  currentValue: number, limit: number, headroom: number,
                                   // NOVO — sem isso o Action Center não consegue montar
                                   // a mensagem sem recalcular tudo de novo
  triggeredAt: string,
}

'goal:completed' -> { goalId: string, completedAt: string, finalValue: number }
```

Debounce push 3s, guarda `visibilityState` (confirmado ausente hoje —
`SyncProvider.tsx:357` dispara push a cada `datastore:change` sem debounce nenhum).
`BroadcastChannel('propmanager-datastore')` único — hoje existem **2 instâncias**:
uma correta em module scope (`dataStore.js:122`) e uma incorreta recriada a cada
render de componente (`DriveContext.jsx:19`, canal `drive-sync`, nunca fechada).
Consolidar nas duas em uma só, em module scope.

## Contrato de erro (o que a UI faz quando falha)

| Falha | Comportamento exigido |
|---|---|
| Push falha (rede/Supabase down) | Emite `sync:error`, mantém fila local, retry com backoff (5s/10s/30s/60s — mesmo padrão já usado no `quantowerAdapter.js:13`), UI mostra "não sincronizado" no Navbar, **nunca** perde o dado local |
| Pull retorna vazio pra uma tabela que localmente tem dado | NUNCA sobrescrever local com vazio — vazio remoto só limpa local se vier acompanhado de um `deleted_*` explícito |
| Migração v1→v3: contagem não bate | Aborta a migração inteira, restaura backup automático, notifica com o diff exato (quantos registros esperados vs. encontrados) |
| Restore de backup corrompido | Rejeita antes de qualquer `clear()`, mantém dado atual intocado (ver `runDestructiveWrite()` no roadmap de armadilhas) |

## Multi-tab

Hoje há **3 locks distintos via localStorage** em `platformManager.js`
(`platform:statusLock`, `platform:syncLock`, `platform:positionLock`, cada um com
timeout de 3s) — trocar os 3 por `navigator.locks` (ou leader election via
`BroadcastChannel`), não só o que o doc original citava como exemplo único. Documentar
a sequência `save->event->push->save` que hoje gera amplificação (uma mutação local
dispara `datastore:change`, que dispara `push`, que ao terminar dispara outro
`datastore:change` pra flush de deleções pendentes — `SyncProvider.tsx:194-200` — esse
segundo disparo precisa ser explicitamente marcado `source: 'sync:push'` no payload do
evento pra não re-disparar push em loop).

## Restore

Transacional: **backup atual → aplicar → verificar `tx.done` → evento**. O `tx.done`
já é respeitado corretamente em `applyFullBackupPayload` hoje — o que falta é o passo
0 (backup atual antes de aplicar), ausente nos dois caminhos de restore que existem
hoje (`googleDrive.js` e `backupPayload.js`). Nunca `clear()` sem esse passo 0.

## Migração — PIVOT: importador opcional, não migração dos 3 storages

> **PIVOT (ver `00_AUDITORIA_ULTRA/00-PIVOT_RECONSTRUCAO.md`):** não migramos os storages
> antigos. O novo app começa limpo com `app-db v3`. Só importamos os **2 payouts** atuais.

1. **Backup**: o app antigo pode ser exportado manualmente (download JSON) se você quiser
   uma cópia, mas não é requisito.
2. **Seed v3**: criar `app-db v3` limpo com os stores do contrato.
3. **Importador de payouts**: lê os payouts atuais (gross, fee, net, splitByAccount, status,
   method, attachments, data) e gera `Transaction` (`payout_in` + `fee`) + `Payout` seed.
   Nada de trades/contas/goals antigos.
4. **Rename tabela** (do `00-DOMAIN_MODEL.md`) aplica-se ao schema do novo app — não a uma
   migração de blob legado. `Account.type`→`kind` é decisão manual se/quando você recriar contas.

Rollback = apagar `app-db v3` e recomeçar (não há dado antigo a perder).
