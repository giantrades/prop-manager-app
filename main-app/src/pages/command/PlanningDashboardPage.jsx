// Dashboard do módulo Planejamento (porta de entrada).
// Composição pura: metas (progresso derivado) + marcos + safável.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import Goals from '@apps/ui/Goals';
import WidgetGrid from '@apps/ui/WidgetGrid';
import StatRow from '@apps/ui/StatRow';
import { Sparkles } from 'lucide-react';


export default function PlanningDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [goals, safeAvailable, marcos] = await Promise.all([
      f.wealth.goals(),
      f.wealth.safeAvailable(),
      f.wealth.listJournalEvents(),
    ]);
    return { goals, safeAvailable, marcos };
  });

  const goals = data?.goals ?? [];
  const completed = goals.filter((g) => g.completed).length;
  const marcos = data?.marcos ?? [];

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Planejamento</h1>
      </div>
      <ModuleTabs module="planejamento" />

      {loading || !data ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando planejamento…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent1">
              <h3>Metas</h3>
              <div className="stat">{goals.length}</div>
              <div className="muted">{completed} concluída(s)</div>
            </div>
            <div className="card accent4">
              <h3>Safe Available</h3>
              <div className="stat">{fmtMoney(data.safeAvailable)}</div>
              <div className="muted">posso comprar isso?</div>
            </div>
            <div className="card accent3">
              <h3>Marcos</h3>
              <div className="stat">{marcos.length}</div>
              <div className="muted">momentos registrados</div>
            </div>
          </div>

          <WidgetGrid storageKey="planejamento">
          <div className="dash-section" key="marcos">
            <div className="dash-title">
              <span>Marcos recentes</span>
              <NavLink className="dash-link" to="/journal-events">ver todos →</NavLink>
            </div>
            {marcos.length === 0 ? (
              <div className="muted">Nenhum marco ainda — crie em Marcos.</div>
            ) : marcos.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5).map((m) => (
              <StatRow
                key={m.id}
                icon={<Sparkles size={14} />}
                color="#7c5cff"
                label={m.title}
                sub={String(m.date).slice(0, 10)}
                value={m.amount != null ? fmtMoney(m.amount) : ''}
              />
            ))}
          </div>

          <div className="dash-section" key="metas">
            <div className="dash-title">
              <span>Metas</span>
              <NavLink className="dash-link" to="/goals">gerenciar →</NavLink>
            </div>
            <Goals goals={goals} loading={false} />
          </div>
          </WidgetGrid>
        </>
      )}
    </div>
  );
}
