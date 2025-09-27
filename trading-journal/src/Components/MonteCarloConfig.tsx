// @apps/trading-journal/src/components/MonteCarloConfig.tsx
import React, { useEffect, useState } from 'react';
import type { MonteCarloConfig } from '../types/monteCarlo';
import { Input } from '../Components/ui/Input';
import { Label } from '../Components/ui/Label';
import { Button } from '../Components/ui/Button';
import { Card } from '../Components/ui/Card';

// fallback UI components if shadcn isn't present
function FallbackInput(props: any) { return <input {...props} className="input w-full" />; }
const ShadInput: any = (Input as any) ?? FallbackInput;

type Props = {
  initial?: Partial<MonteCarloConfig>;
  onRun: (config: MonteCarloConfig) => void;
  onQuickScenario?: (preset: string) => void;
  defaultWinRate?: number;
  defaultExpectancyR?: number;
  strategies?: string[];
  categories?: string[];
};

export const MonteCarloConfigPanel: React.FC<Props> = ({
  initial = {},
  onRun,
  defaultWinRate,
  defaultExpectancyR,
  strategies = [],
  categories = [],
}) => {
  const [simulations, setSimulations] = useState(initial.simulations ?? 10000);
  const [maxTrades, setMaxTrades] = useState(initial.maxTradesPerRun ?? 500);
  const [winProb, setWinProb] = useState<number>(initial.winProb ?? (defaultWinRate ?? 0.5));
  const [expectancyR, setExpectancyR] = useState<number>(initial.expectancyR ?? (defaultExpectancyR ?? 0.2));
  const [riskPct, setRiskPct] = useState<number | undefined>(initial.riskPerTradePct ?? 0.01);
  const [riskValue, setRiskValue] = useState<number | undefined>(initial.riskPerTradeValue);
  const [initialCap, setInitialCap] = useState<number>(initial.initialCapital ?? 10000);
  const [strategy, setStrategy] = useState<string | null>(initial.strategy ?? null);
  const [category, setCategory] = useState<string | null>(initial.category ?? null);
  const [tradesPerYear, setTradesPerYear] = useState<number>(initial.tradesPerYear ?? 252);

  useEffect(() => {
    // keep either riskPct or riskValue only; if both provided, prefer value
    if (riskValue && riskValue > 0) {
      setRiskPct(undefined);
    }
  }, [riskValue]);

  function run() {
    const config: MonteCarloConfig = {
      simulations,
      maxTradesPerRun: maxTrades,
      winProb: Math.max(0, Math.min(1, winProb)),
      expectancyR,
      riskPerTradePct: riskPct,
      riskPerTradeValue: riskValue,
      initialCapital: initialCap,
      strategy: strategy || undefined,
      category: category || undefined,
      tradesPerYear,
    };
    onRun(config);
  }

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-3">Configuração da simulação</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>№ de simulações</Label>
          <ShadInput type="number" value={simulations} onChange={(e:any)=>setSimulations(Number(e.target.value))}/>
        </div>
        <div>
          <Label>Max trades / sim</Label>
          <ShadInput type="number" value={maxTrades} onChange={(e:any)=>setMaxTrades(Number(e.target.value))}/>
        </div>
        <div>
          <Label>Trades por ano</Label>
          <ShadInput type="number" value={tradesPerYear} onChange={(e:any)=>setTradesPerYear(Number(e.target.value))}/>
        </div>

        <div>
          <Label>Probabilidade de win (%)</Label>
          <ShadInput type="number" value={(winProb*100).toFixed(1)} onChange={(e:any)=>setWinProb(Number(e.target.value)/100)}/>
        </div>
        <div>
          <Label>Expectancy (R)</Label>
          <ShadInput type="number" step="0.01" value={expectancyR} onChange={(e:any)=>setExpectancyR(Number(e.target.value))}/>
        </div>
        <div>
          <Label>Risco por trade (% do capital)</Label>
          <ShadInput type="number" step="0.001" value={riskPct ?? ''} onChange={(e:any)=>setRiskPct(Number(e.target.value))}/>
        </div>

        <div>
          <Label>Risco por trade (valor fixo $)</Label>
          <ShadInput type="number" value={riskValue ?? ''} onChange={(e:any)=>setRiskValue(Number(e.target.value) || undefined)}/>
        </div>
        <div>
          <Label>Capital inicial ($)</Label>
          <ShadInput type="number" value={initialCap} onChange={(e:any)=>setInitialCap(Number(e.target.value))}/>
        </div>

        <div>
          <Label>Estratégia</Label>
          <select className="input w-full" value={strategy ?? ''} onChange={(e)=>setStrategy(e.target.value || null)}>
            <option value="">-- qualquer --</option>
            {strategies.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label>Categoria</Label>
          <select className="input w-full" value={category ?? ''} onChange={(e)=>setCategory(e.target.value || null)}>
            <option value="">-- qualquer --</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={run}>Rodar simulação</Button>
        <Button variant="ghost" onClick={()=>{ setSimulations(10000); setMaxTrades(500); setWinProb(defaultWinRate ?? 0.5); setExpectancyR(defaultExpectancyR ?? 0.2); }}>
          Reset
        </Button>
      </div>
    </Card>
  );
};
