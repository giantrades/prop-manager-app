# STAGE 2 — Offline-first + Quantower resiliente

> Exigência do dono: app funciona sem Quantower. Prop precisa dele para live, resto nunca pode quebrar.

## Princípio

```
Quantower = fonte live, nunca fonte de verdade.
Verdade = IndexedDB v3 + snapshot cacheado.
```

- App abre 100% offline com último snapshot (`accounts, equity, peak, lastSync HH:MM`).
- Banner de estado por conta: `🟢 LIVE | 🟡 STALE 12min | 🔴 OFFLINE — mostrando cache`.
- Nada bloqueia por falta de bridge: Wallets, Portfolio, Tax, Payouts, Journal manual funcionam sempre.

## Resiliência ao "atualizou e quebrou o link"

1. **Handshake de versão:** `GET /status` retorna `{ version, build }`. UI compara com `EXPECTED_BRIDGE_VERSION`, avisa "bridge desatualizada" em vez de falhar mudo.
2. **Health check:** `GET /health` 10s. 3 falhas seguidas = modo degraded + fila.
3. **Fila de sync:** trades/posições perdidos durante off entram em `sync_queue` e reconciliam por `quantowerId` (idempotente) ao voltar. Nunca duplicar `qt_*`.
4. **Fallback manual/CSV:** se bridge off, botão "Registrar manual / Importar CSV" no mesmo lugar do "Sync". Mesmo schema `source: manual|csv|quantower`.
5. **Bridge via Tailscale:** documentar `http://<tail-id>.ts.net:8787` + `X-Bridge-Token`. Em `https` prod, bridge `http` nunca conecta (bug atual `quantowerAdapter.js:8-11`) — desabilitar auto-sync e mostrar "só localhost/dev".

## O que o agente implementa

- [ ] Snapshot cache por conta + `lastSync` visível na Navbar e Risk Center
- [ ] `bridgeHealth` hook + banner degraded + fila `sync_queue`
- [ ] Version check + mensagem de atualização da DLL
- [ ] Teste: matar bridge 5min, operar offline, religar sem duplicar
