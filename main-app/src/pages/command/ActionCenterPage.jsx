// STAGE 6 — ActionCenterPage. Container do Action Center. Usa o snapshot do Command
// Center (flags que os motores já expõem) e renderiza o ActionCenter (composição).
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Alerts) + 01-tasks.md (T6.3).

import React from 'react';
import ActionCenter from '@apps/ui/ActionCenter';
import { useCommandSnapshot } from '@apps/state';

export default function ActionCenterPage() {
  const { loading, actions, refresh } = useCommandSnapshot();
  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Action Center</h1>
        <button className="cmd-refresh" onClick={() => refresh()} disabled={loading} aria-label="Atualizar">
          {loading ? '…' : 'Atualizar'}
        </button>
      </div>
      <ActionCenter actions={actions} loading={loading} />
    </div>
  );
}
