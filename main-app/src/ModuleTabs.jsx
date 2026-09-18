// Abas de módulo — cada módulo (âncora da sidebar) é um workspace: a dashboard
// dele mostra estas abas para navegar às demais páginas do módulo. Fonte única:
// `navConfig.js` (mesma lista que a sidebar e a palette usam).
//
// Uso: <ModuleTabs module="dinheiro" />
// Ver DOCS/11_PAGE_MAP.md.
import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { MODULES } from './navConfig';
import { prefetchPage } from './routeLoaders';
import { useLivePositionCount } from '@apps/state';

// Rotas que "possuem" posições abertas — recebem a bolinha verde quando há posição viva.
const LIVE_ROUTES = ['/live-positions', '/journal'];

export default function ModuleTabs({ module: moduleId }) {
  const mod = MODULES.find((m) => m.id === moduleId);
  const liveCount = useLivePositionCount();
  // Prefetch dos chunks das abas ao montar — trocar de aba fica instantâneo.
  useEffect(() => {
    if (!mod) return;
    for (const c of mod.children) prefetchPage(c.to);
  }, [mod]);
  if (!mod) return null;
  return (
    <nav className="ws-tabs" aria-label={`Seções de ${mod.label}`}>
      {mod.children.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}
          onMouseEnter={() => prefetchPage(to)}
          onFocus={() => prefetchPage(to)}
        >
          {label}
          {liveCount > 0 && LIVE_ROUTES.includes(to) && (
            <span className="ws-tab-dot" title={`${liveCount} posição(ões) aberta(s)`} aria-label={`${liveCount} posição(ões) aberta(s)`} />
          )}
        </NavLink>
      ))}
    </nav>
  );
}
