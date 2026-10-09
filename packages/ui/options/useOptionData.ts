// useOptionData — carrega do DataService (e reage a `datastore:change`) o que os widgets
// de opções precisam: pernas, cotações, posições de ações, spots salvos nos parâmetros do
// módulo e dividendos anunciados (data-com). Somente leitura; sem fórmula.
import { useEffect, useState } from 'react';
import { useFinance } from '@apps/state';
import { getAnnouncedDividends } from '@apps/lib/db';
import type { DividendEvent, OptionChainQuote, OptionLeg, Position } from '@apps/lib/db';

export const OPTION_SETTINGS_KEY = 'options.settings';

export interface OptionData {
  loading: boolean;
  legs: OptionLeg[];
  quotes: OptionChainQuote[];
  positions: Position[];
  spots: Record<string, number>;
  dividends: DividendEvent[];
}

const EMPTY: OptionData = { loading: true, legs: [], quotes: [], positions: [], spots: {}, dividends: [] };

export function useOptionData(): OptionData {
  // useFinance() não é tipado (JS): estreita só o que este hook usa.
  const finance = useFinance() as unknown as { ds?: any } | null;
  const [data, setData] = useState<OptionData>(EMPTY);

  useEffect(() => {
    let alive = true;
    const ds = finance?.ds;
    if (!ds) { setData((d) => ({ ...d, loading: false })); return undefined; }
    const load = async () => {
      try {
        const [legs, quotes, positions, settings, dividends] = await Promise.all([
          ds.optionLegs.list(),
          ds.optionChain.list(),
          ds.positions.list(),
          ds.meta.getKey(OPTION_SETTINGS_KEY),
          getAnnouncedDividends(ds),
        ]);
        const raw = (settings?.value as { spots?: Record<string, number> } | undefined)?.spots ?? {};
        const spots: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0) spots[k] = v;
        if (alive) setData({ loading: false, legs, quotes, positions, spots, dividends });
      } catch {
        if (alive) setData((d) => ({ ...d, loading: false }));
      }
    };
    load();
    const off = ds.bus?.on?.('datastore:change', load);
    return () => { alive = false; if (typeof off === 'function') off(); };
  }, [finance]);

  return data;
}
