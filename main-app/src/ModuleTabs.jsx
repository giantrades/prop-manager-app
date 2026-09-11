// Abas de módulo — cada módulo (âncora da sidebar) é um workspace: a dashboard
// dele mostra estas abas para navegar às demais páginas do módulo. Fonte única:
// `navConfig.js` (mesma lista que a sidebar e a palette usam).
//
// Uso: <ModuleTabs module="dinheiro" />
// Ver DOCS/11_PAGE_MAP.md.
import React from 'react';
import { NavLink } from 'react-router-dom';
import { MODULES } from './navConfig';

export default function ModuleTabs({ module: moduleId }) {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return null;
  return (
    <nav className="ws-tabs" aria-label={`Seções de ${mod.label}`}>
      {mod.children.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `ws-tab${isActive ? ' active' : ''}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
