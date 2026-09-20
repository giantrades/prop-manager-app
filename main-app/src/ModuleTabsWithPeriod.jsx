// ModuleTabsWithPeriod — abas do módulo + seletor de período na MESMA linha (ganha
// espaço vertical). Abas à esquerda (com scroll se necessário), controles à direita.
// Aceita `children` para controles extras (ex.: AccountPicker no Trading).
// No mobile (≤560px) quebra em duas linhas.
import React from 'react';
import ModuleTabs from './ModuleTabs';
import PeriodPicker from '@apps/ui/PeriodPicker';

export default function ModuleTabsWithPeriod({ module: moduleId, period, onChange, children }) {
  return (
    <div className="mtp-row">
      <div className="mtp-tabs"><ModuleTabs module={moduleId} /></div>
      <div className="mtp-period">
        <PeriodPicker period={period} onChange={onChange} compact />
        {children}
      </div>
    </div>
  );
}

const MTP_CSS = `
.mtp-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mtp-row .ws-tabs { margin: 0; flex: 1 1 auto; min-width: 0; }
.mtp-period { margin-left: auto; flex: 0 0 auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
@media (max-width: 560px) {
  .mtp-row { flex-direction: column; align-items: stretch; gap: 8px; }
  .mtp-period { margin-left: 0; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('mtp-styles')) {
  const style = document.createElement('style');
  style.id = 'mtp-styles';
  style.textContent = MTP_CSS;
  document.head.appendChild(style);
}
