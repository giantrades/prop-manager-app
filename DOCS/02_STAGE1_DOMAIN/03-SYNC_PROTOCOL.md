# STAGE 1 — Sync Protocol

## Push/Pull

- Push debounced 3s, batch upsert 500/chunk (`push.ts` hoje N+1 por trade — cada trade
  vira uma chamada Supabase separada, confirmar antes de escalar volume).
- Pull com `.range()` em **todas** as 10 queries de `pullAllData` (hoje `pull.ts:16-27`
  usa `.select('*')` puro nas 10, que o PostgREST trunca em 1000 registros por padrão —
  silencioso, sem erro, só corta).
- `deleted_trades (user_id, platform_trade_id)` único — hoje é
  `UNIQUE(platform_trade_id)` **global** (`sql/create_deleted_trades_table.sql:10`),
  sem `user_id`. Quebra se duas plataformas conectadas reusarem o mesmo ID de trade
  (ex: MT5 e cTrader ambos numerando sequencial). Migration SQL: dropar a constraint
  antiga, criar `UNIQUE(user_id, platform_trade_id)`, RLS completo nas tabelas que
  ainda não têm (confirmar quais além de `deleted_trades`).
- Realtime só se `visibilityState==='visible'`; hidden = polling 1h + `focus pull`
  (já parcialmente implementado em `SyncProvider.tsx:293-317` — confirmar que fica
  assim depois da reescrita do Stage 2, não regredir). Sem `datastore:change` em loop —
  ver nota abaixo sobre o disparo duplo no `finally` do push.

## Conflito — o algoritmo real (não o que o doc antigo pedia)

O doc original pedia **"merge campo-a-campo"** com `updatedAt+version+deviceId`. Isso
é **impossível de implementar como descrito** sobre o schema atual: cada registro tem
UM `updatedAt` pro registro inteiro, não um por campo. "Merge campo-a-campo" de
verdade exigiria guardar timestamp por campo (`{ amount: {value, updatedAt}, date:
{value, updatedAt} }`), o que multiplica o tamanho de todo registro e complica cada
leitura. Duas opções reais — escolha uma explicitamente, não deixe ambígua:

**Opção A — granularidade por campo (custo maior, resolve mais sozinho)**
Guardar `updatedAt` por campo só nas entidades onde o custo compensa: `Transaction` e
`Trade` (as duas que mais mudam por edição pontual). O resto (`Account`, `Goal`)
continua com merge por registro. Resolve conflitos de "dois campos diferentes editados
em dois devices" automaticamente; conflitos no mesmo campo ainda caem na Opção B.

**Opção B — merge por registro com regra de precedência explícita (mais simples,
recomendado para começar)**
Merge por registro inteiro usando `updatedAt` mais recente vence — **exceto** para
campos financeiros (`Transaction.amount`, `Payout.net`, `Account.initialFunding`), que
**nunca fazem merge automático**: se os dois devices mudaram o mesmo registro
financeiro desde o último sync comum, o sync marca o registro como
`status: 'conflict'`, mantém as duas versões visíveis (`localVersion`,
`remoteVersion`) e pede confirmação humana antes de aplicar qualquer uma. Campos não
financeiros (nota, tag, cor) seguem last-writer-wins normal.

**Recomendação**: comece pela Opção B. É mais barata de implementar corretamente e o
volume de edição simultânea real (você, sozinho, em no máximo 2-3 dispositivos) não
justifica o custo de granularidade por campo ainda — revisite se algum dia isso virar
multi-usuário de verdade.

## Multi-tab

Hoje existem **3 locks via localStorage**, todos no mesmo arquivo
(`packages/utils/platformManager.js`): `platform:statusLock` (linhas 369-416),
`platform:syncLock` (421-517) e `platform:positionLock` (576-640), cada um com
timeout de 3s via `Date.now()` comparado manualmente. Trocar os 3 por
`navigator.locks.request(name, async () => {...})` (ou leader election com
`BroadcastChannel` se precisar de um "líder" persistente, não só exclusão mútua
pontual). `navigator.locks` já resolve o problema que o timeout manual tenta
aproximar (lock que nunca é liberado por aba fechada abruptamente) sem precisar de
heurística de tempo.

Documentar a sequência `save->event->push->save` que hoje gera amplificação: uma
mutação local dispara `datastore:change` → dispara `push()` → ao terminar, o próprio
`push()` dispara **outro** `datastore:change` pra flush de deleções pendentes
(`SyncProvider.tsx:194-200`, dentro do `finally`). Esse segundo disparo precisa do
payload `{ source: 'sync:push' }` (ver `01-DATA_CONTRACT.md`) e o handler de push
precisa ignorar eventos com esse source, ou o loop se realimenta.

## Restore

Transacional: **backup atual → aplicar → verificar `tx.done` → evento**. Detalhe
verificado no código: `applyFullBackupPayload` (`packages/utils/backupPayload.js:37-86`)
**já faz `await tx.done` corretamente** nas linhas 67 e 74 — essa parte específica do
bug original está desatualizada. O que falta de verdade nos dois caminhos de restore
que existem hoje (esse e `googleDrive.js:449-480`, que ignora `journal-db` e usa
`alert()` em vez do padrão de toast do resto do app) é o passo 0: nenhum dos dois
salva o estado atual antes de sobrescrever. Nunca `clear()` sem esse passo — unificar
os dois caminhos num só (`applyFullBackupPayload`), deletar o outro.
