# PWA MOBILE SPEC (novo)

> Shell (manifest + SW básico) pode sair já no Stage 0 (T0.0b) — não depende de nenhum
> contrato do Stage 1. Cache de dado real (leitura offline) e fila de escrita dependem
> do `DataChainEngine` do Stage 2, entram no Stage 3 (T3.9).

## Manifest

```json
{
  "name": "Personal Finance OS",
  "short_name": "FinanceOS",
  "display": "standalone",
  "theme_color": "#0f1218",
  "background_color": "#0f1218",
  "start_url": "/",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

iOS: `<meta name="apple-mobile-web-app-capable" content="yes">`,
`<link rel="apple-touch-icon" href="/icons/icon-192.png">` (iOS ignora o manifest pra
ícone de home screen, precisa do link tag específico).

**Atenção — achado do audit**: `logoUrl` hoje é relativo no código atual, o que quebra
sob `/journal/` (base path da segunda SPA). Ícones do manifest/apple-touch-icon
precisam de path absoluto (`/icons/...`), nunca relativo, justamente por causa dos 2
apps convivendo sob paths diferentes.

## Service Worker — estratégia de cache por rota (faltava no doc original)

"Nunca cachear POST" é uma restrição, não uma estratégia. Por tipo de request:

| Tipo | Estratégia | Motivo |
|---|---|---|
| App shell (JS/CSS/HTML do build) | Cache-first, atualiza em background | Não muda entre sessões, velocidade > frescor |
| `GET` de leitura de dado (accounts, trades, positions) | Stale-while-revalidate | Mostra cache instantâneo, atualiza assim que a rede responder — é o que sustenta o banner STALE/OFFLINE |
| `GET /status`, `/health` do bridge | Network-only, timeout curto (3s) | Esse dado nunca pode fingir estar fresco — é exatamente o que decide se o resto é STALE |
| Qualquer `POST`/`PUT`/`DELETE` | **Nunca cacheado**, nunca servido do cache. Se offline, entra na fila (`sync_queue`), nunca finge sucesso | Escrita financeira não pode ser "otimista" sem o usuário saber que ainda não confirmou |
| Imagens/anexos de comprovante | Cache-first com expiração longa (30 dias) | Baixo custo de storage, alto valor de acesso offline |

## Estados 360px obrigatórios

Todo componente de Stage 3+ desenhado 360px primeiro (regra já existente,
reforçada aqui com critério mensurável):

- Risk Center: banner de status + tabela de contas legíveis **sem scroll horizontal**
  em 360×640.
- Positions: lista + botão fechar operável com o polegar (alvo de toque ≥44×44px,
  padrão de acessibilidade mobile).
- Nenhum texto abaixo de `--text-xs 11px` (regra já existente no `02-design.md`,
  vale também pra qualquer tela nova de PWA).

## Critério de aceite (número, não adjetivo)

- Lighthouse PWA = **100**.
- Lighthouse Performance ≥ **90** em perfil mobile simulado (throttling 4G padrão do
  Lighthouse).
- Time-to-Interactive < **3s** no mesmo perfil.
- "Add to Home Screen" funcional testado manualmente em iOS Safari **e** Android
  Chrome (os dois, não só um — o comportamento de manifest diverge entre eles).
- Risk Center e Positions usáveis com uma mão, testado em dispositivo físico, não só
  emulador de browser.

## Teste de campo (Tailscale, fora do PC)

- [ ] Celular fora da rede do PC (dados móveis, não Wi-Fi da mesma casa), bridge
      exposto via Tailscale, abre o app.
- [ ] Abre + edita SL/TP + fecha posição em conta demo, confirma no terminal
      Quantower que refletiu.
- [ ] Desliga o PC (mata o bridge) com o app aberto no celular: banner OFFLINE aparece
      em até 15min ou 3 falhas de `/health` (o que vier primeiro), cache continua
      legível, nenhuma ação de escrita finge sucesso.
- [ ] Religa o bridge: reconecta sem duplicar posições/trades (`clientOrderId` e
      `quantowerId` fazem a dedup — ver `04-BRIDGE_V2_SPEC.md`).
- [ ] Push notification futura (fora de escopo agora, mas o SW já precisa registrar
      `pushManager` vazio pra não exigir reinstall do PWA quando essa feature chegar).
