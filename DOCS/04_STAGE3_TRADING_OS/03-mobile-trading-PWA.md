# STAGE 3 — Mobile Trading + PWA (exigência: fecha E abre pelo celular)

## Estado atual (verificado)

- Bridge só tem `GET /status|/accounts|/trades|/positions|/orders` + `POST /positions/close` (`QuantowerBridge.cs:56,319-320,373-412`).
- App só faz close "local-first, bridge best-effort" (`usePlatform.js:419-447`): tenta `adapter.closePosition`, se falhar faz cleanup local.
- Não existe abrir posição, nem editar SL/TP, nem copy-trade mapping pelo celular.

## Alvo

1. **PWA instalável:** `manifest.json` (nome, ícones 192/512, `display: standalone`, `theme_color #0f1218`), `service worker` (cache shell + dados leitura, nunca cachear POST), iOS meta + `apple-touch-icon`. Critério: Lighthouse PWA verde + "Add to Home Screen" funcionando + Risk + Positions legíveis em 360px.
2. **Mobile-first obrigatório:** todo Stage 3+ desenhado 360px primeiro. Mega-app só presta se Risk/Positions/Home forem usáveis com uma mão. Teste real no celular fora do PC (Tailscale).
3. **Bridge v2 (endpoints novos, com token):**
   - `POST /positions/open { accountId, symbol, side, qty, sl, tp, note }` -> retorna `platformPositionId`
   - `POST /positions/modify { platformPositionId, sl, tp }`
   - `POST /orders/place|cancel` (limit/stop)
   - `POST /positions/close` já existe — adicionar `X-Bridge-Token` (hoje CORS `*` sem auth)
   - Toda resposta `{ success, platformPositionId, error }` idempotente via `clientOrderId`.
4. **Copy-trade aware:** `Account { copyGroup?, copyMultiplier? }`. Ao abrir pelo celular, UI mostra "vai replicar para E8 50K x0.5, Apex x1" e envia para conta certa (a que o Quantower vê via `quantowerAccountId`). Deep-link "abrir no Quantower na conta X" quando precisar do desktop.
5. **Segurança remota:** bridge exposta via Tailscale Funnel = internet pública. Sem token, qualquer um fecha suas posições. Ordem: token primeiro (`usePlatform` envia header), só depois liberar `AllowExternal=true`.

## Tasks

- [x] T-M1 PWA shell (manifest + SW + instalável + offline leitura) — manifest + SW por rota (`main-app/public`, `trading-journal/public`)
- [x] T-M2 Positions mobile: lista live + P&L + botão Fechar com confirm + retry fila
      (`packages/ui/LivePositions.jsx` + SW `sync_queue`)
- [x] T-M3 Bridge `/open` + `/modify` + token + `clientOrderId` + teste em demo — `04-BRIDGE_V2_SPEC.md`
- [x] T-M4 Copy-group UI (multiplier, conta alvo, preview antes de enviar) — `packages/lib/db/copyTrade.ts`
- [~] T-M5 Teste campo: celular fora do PC via Tailscale abre/fecha/edita SL/TP sem duplicar
      (teste manual — bridge compilado + pareado; executar no dispositivo físico)

Gate: abrir + editar SL/TP + fechar pelo celular em conta demo, bridge off mostra cache + fila.

