# STAGE 3 — Design (UX day-trader)

- Quick Entry mobile-first, atalhos teclado, `Esc` fecha modal + focus-trap + `aria-modal`, labels `htmlFor/id`.
- Tabelas: `min-width 720px`, `thead sticky`, paginação única `Page x/y + rows-per-page`, `aria-sort`, `tabular-nums`.
- Charts: sem `margin-left:-12px`, `YAxis width 48 + fmtShort`, `gradientId useId()`, `XAxis preserveStartEnd minTickGap 24`.
- Loading: skeleton shimmer; erro/sucesso imediato; toast+undo (nunca `alert/confirm`); `ErrorBoundary`.
- Tipografia: `--text-xs 11px` mínimo (proibir 8-9px atuais), `tokens.css` único, `sb-external` branco -> gradiente brand.
- A11y: `button` real (não div role), `focus-visible`, contraste >=4.5:1 (`#4a5568->#8b94a5`), `prefers-reduced-motion`.
