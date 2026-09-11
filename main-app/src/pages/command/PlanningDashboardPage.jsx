// Batch G4 — Dashboard do módulo Planejamento (porta de entrada).
// Composição pura: metas (progresso derivado) + forecast 30/60/90 + calendário.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import Goals from '@apps/ui/Goals';
import Forecast from '@apps/ui/Forecast';


export default function PlanningDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [goals, forecast, safeAvailable] = await Promise.all([
      f.wealth.goals(),
      f.wealth.forecast(),
      f.wealth.safeAvailable(),
    ]);
    return { goals, forecast, safeAvailable };
  });

  const goals = data?.goals ?? [];
  const completed = goals.filter((g) => g.completed).length;

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
            <div className={`card ${data.forecast.netMonthly >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Fluxo mensal</h3>
              <div className="stat">{fmtMoney(data.forecast.netMonthly)}</div>
              <div className="muted">líquido/mês</div>
            </div>
            <div className="card accent3">
              <h3>Em 90 dias</h3>
              <div className="stat">{fmtMoney(data.forecast.d90)}</div>
              <div className="muted">projeção</div>
            </div>
          </div>

          <div className="dash-section">
            <div className="dash-title">
              <span>Projeção de caixa</span>
              <NavLink className="dash-link" to="/forecast">forecast →</NavLink>
            </div>
            <Forecast forecast={data.forecast} safeAvailable={data.safeAvailable} loading={false} />
          </div>

          <div className="dash-section">
            <div className="dash-title">
              <span>Metas</span>
              <NavLink className="dash-link" to="/goals">gerenciar →</NavLink>
            </div>
            <Goals goals={goals} loading={false} />
          </div>
        </>
      )}
    </div>
  );
}
