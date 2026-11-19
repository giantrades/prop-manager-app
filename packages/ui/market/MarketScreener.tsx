// SCANNER — Screener configurável estilo mercado: presets, filtros, regras em linguagem
// (com destaque), seção separada de fundamentos/earnings, campos personalizados, ordenação
// por coluna e export CSV. Só apresenta; cálculo em `marketScanner.ts`/`screenerRules.ts`.
import React, { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, fmtPrice, fmtVolume, injectMarketStyles } from './marketUi';
import RuleEditor from './RuleEditor';
import CustomFieldsPanel from './CustomFieldsPanel';
import {
  SCREENER_PRESETS,
  SECTORS,
  RULE_FIELDS,
  RULE_EXAMPLES,
  FUNDAMENTAL_FIELDS,
  FUNDAMENTAL_FIELD_KEYS,
  FUNDAMENTAL_RULE_EXAMPLES,
  applyPreset,
  customFieldIds,
  type CustomFieldCompiled,
  type CustomFieldDef,
  type ScreenerFilters,
  type ScreenerPreset,
  type ScreenerResult,
  type ScreenerSort,
} from '@apps/lib/db';

export type FundamentalsUiStatus = 'ok' | 'loading' | 'not_configured' | 'offline';

interface MarketScreenerProps {
  filters: ScreenerFilters;
  onChange: (next: ScreenerFilters) => void;
  result: ScreenerResult;
  customFields: CustomFieldDef[];
  compiledCustomFields: CustomFieldCompiled[];
  onCustomFieldsChange: (defs: CustomFieldDef[]) => void;
  fundamentalsStatus: FundamentalsUiStatus;
  fundamentalsAt?: string | null;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

function numOrNull(raw: string): number | null {
  const v = Number(raw);
  return raw.trim() === '' || Number.isNaN(v) ? null : v;
}

function exportCsv(rows: ScreenerResult['rows']): void {
  const header = ['Symbol', 'Name', 'Sector', 'Price', 'Change1d', 'Change5d', 'OffHigh5d', 'OffLow5d', 'Volume'];
  const escape = (v: unknown) => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.symbol, r.name, r.sector, r.price, r.changePct, r.change5d, r.offHigh5d, r.offLow5d, r.volume].map(escape).join(','),
  );
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screener-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_META: Record<FundamentalsUiStatus, { cls: string; label: string }> = {
  ok: { cls: 'ok', label: 'Feed ok' },
  loading: { cls: 'warn', label: 'Carregando feed…' },
  not_configured: { cls: 'warn', label: 'Aguardando feed' },
  offline: { cls: 'off', label: 'Feed indisponível (cache)' },
};

export default function MarketScreener({
  filters, onChange, result, customFields, compiledCustomFields, onCustomFieldsChange,
  fundamentalsStatus, fundamentalsAt, at, loading = false, stale = false, error = null, onRefresh,
}: MarketScreenerProps) {
  const [activePreset, setActivePreset] = useState<ScreenerPreset | null>(null);
  useEffect(() => { injectMarketStyles(); }, []);
  const customIds = customFieldIds(compiledCustomFields);
  const mainExtraFields = [...FUNDAMENTAL_FIELD_KEYS, ...customIds];
  const status = STATUS_META[fundamentalsStatus] ?? STATUS_META.not_configured;

  const set = <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    setActivePreset(null);
    onChange({ ...filters, [key]: value });
  };

  const preset = (id: ScreenerPreset) => {
    setActivePreset(id === 'reset' ? null : id);
    onChange(applyPreset(id, filters));
  };

  const toggleSort = (key: ScreenerSort) => {
    setActivePreset(null);
    if (filters.sortBy === key) {
      onChange({ ...filters, sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' });
    } else {
      const asc = key === 'offHigh5d' || key === 'offLow5d';
      onChange({ ...filters, sortBy: key, sortDir: asc ? 'asc' : 'desc' });
    }
  };

  const SortHead = ({ label, sortKey, numeric }: { label: string; sortKey: ScreenerSort; numeric?: boolean }) => (
    <span className={numeric ? 'mk-num' : undefined}>
      <button type="button" className="mk-th-btn" onClick={() => toggleSort(sortKey)} title={`Ordenar por ${label}`}>
        {label}
        {filters.sortBy === sortKey && <span className="mk-sort-ind" aria-hidden="true">{filters.sortDir === 'desc' ? '▼' : '▲'}</span>}
      </button>
    </span>
  );

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : `Screener · ${result.matched} de ${result.withData} com dados`}
        </span>
        {at && <span className="mk-status">atualizado {new Date(at).toLocaleTimeString('pt-BR')}</span>}
        <span className="mk-toolbar-spacer" />
        <button type="button" className="mk-btn" onClick={() => exportCsv(result.rows)} disabled={result.rows.length === 0}>
          <Download size={14} /> CSV
        </button>
        {onRefresh && (
          <button type="button" className="mk-btn" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            <RefreshCw size={14} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
      </div>

      {error && <div className="cmd-warn" role="alert">Feed indisponível ({error}). Mostrando cache quando houver.</div>}

      <div className="mk-presets" role="group" aria-label="Presets de scan">
        {SCREENER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`mk-btn${activePreset === p.id ? ' is-active' : ''}`}
            onClick={() => preset(p.id)}
            aria-pressed={activePreset === p.id}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mk-field" style={{ marginBottom: 12 }}>
        <span className="mk-field-label">Regras do scan (linguagem)</span>
        <RuleEditor
          value={filters.rules}
          onChange={(v) => set('rules', v)}
          placeholder="ex: change > 2% AND volume > 1M"
          error={result.ruleError ? `Erro na regra: ${result.ruleError}` : null}
          extraNumericFields={mainExtraFields}
          helpId="screener-rules-help"
          ariaLabel="Regras do scan"
        />
        <details className="mk-help" id="screener-rules-help">
          <summary>Como escrever as regras</summary>
          <h4>Campos (percentuais em pontos: 2 = 2%)</h4>
          <div className="mk-help-grid">
            {RULE_FIELDS.map((f) => (
              <div className="mk-help-row" key={f.key}>
                <span className="mk-help-key"><code>{f.key}</code></span>
                <span>{f.label}{f.unit ? ` (${f.unit})` : ''} · {f.aliases.join(', ')}</span>
              </div>
            ))}
          </div>
          {customIds.length > 0 && (
            <>
              <h4>Seus campos personalizados</h4>
              <div className="mk-help-grid">
                {customIds.map((id) => (
                  <div className="mk-help-row" key={id}><span className="mk-help-key"><code>{id}</code></span></div>
                ))}
              </div>
            </>
          )}
          <h4>Operadores</h4>
          <div>A comparação: <code>&gt;</code> <code>&gt;=</code> <code>&lt;</code> <code>&lt;=</code> <code>=</code> <code>!=</code></div>
          <div>Faixa: <code>between X and Y</code> · Texto: <code>contains</code> · Lista: <code>in (a, b)</code></div>
          <div>Lógica: <code>AND</code>, <code>OR</code>, <code>NOT</code>, parênteses. Números aceitam <code>%</code>, <code>k</code>, <code>M</code>, <code>B</code>.</div>
          <h4>Exemplos (clique para usar)</h4>
          <div className="mk-example-list">
            {RULE_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="mk-example" onClick={() => set('rules', ex)}>{ex}</button>
            ))}
          </div>
        </details>
      </div>

      <section className="mk-group" aria-label="Fundamentos e earnings">
        <div className="mk-group-head">
          <span className="mk-group-title">Fundamentos &amp; Earnings</span>
          <span className={`mk-pill ${status.cls}`}>
            {status.label}
            {fundamentalsStatus === 'ok' && fundamentalsAt ? ` · ${new Date(fundamentalsAt).toLocaleTimeString('pt-BR')}` : ''}
          </span>
        </div>

        {fundamentalsStatus === 'not_configured' && (
          <p className="mk-subtitle" style={{ marginTop: 0 }}>
            Sem feed configurado. Defina <code>VITE_FUNDAMENTALS_ENDPOINT</code> (ver
            {' '}DOCS/10_MODULES/market/02-fundamentals-feed.md). Até lá, regras de fundamentos
            não retornam ativos.
          </p>
        )}
        {fundamentalsStatus === 'offline' && (
          <p className="mk-subtitle" style={{ marginTop: 0 }}>Feed de fundamentos indisponível; usando cache quando houver.</p>
        )}

        <RuleEditor
          value={filters.fundamentalRules}
          onChange={(v) => set('fundamentalRules', v)}
          placeholder="ex: pe < 25 AND revenuegrowth > 10"
          error={result.fundamentalRuleError ? `Erro na regra de fundamentos: ${result.fundamentalRuleError}` : null}
          extraNumericFields={FUNDAMENTAL_FIELD_KEYS}
          helpId="fundamentals-help"
          ariaLabel="Regras de fundamentos e earnings"
        />

        <details className="mk-help" id="fundamentals-help">
          <summary>Campos de fundamentos</summary>
          <div className="mk-help-grid">
            {FUNDAMENTAL_FIELDS.map((f) => (
              <div className="mk-help-row" key={f.key}>
                <span className="mk-help-key"><code>{f.key}</code></span>
                <span>{f.label}{f.unit ? ` (${f.unit})` : ''} · {f.aliases.join(', ')}</span>
              </div>
            ))}
          </div>
          <h4>Exemplos (clique para usar)</h4>
          <div className="mk-example-list">
            {FUNDAMENTAL_RULE_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="mk-example" onClick={() => set('fundamentalRules', ex)}>{ex}</button>
            ))}
          </div>
          <p className="mk-subtitle" style={{ marginTop: 6 }}>
            Combinam por <strong>AND</strong> com as regras técnicas e os filtros do formulário.
          </p>
        </details>
      </section>

      <details className="mk-help" style={{ marginBottom: 12 }}>
        <summary>Campos personalizados (avançado)</summary>
        <CustomFieldsPanel defs={customFields} compiled={compiledCustomFields} onChange={onCustomFieldsChange} />
      </details>

      <div className="mk-filters">
        <label className="mk-field">
          <span className="mk-field-label">Universo</span>
          <select className="mk-select" value={filters.universe} onChange={(e) => set('universe', e.target.value as ScreenerFilters['universe'])}>
            <option value="stocks">Ações (S&P-like)</option>
            <option value="sectors">Setores (SPDR)</option>
            <option value="baskets">Cestas (temas/fatores/ETF)</option>
            <option value="all">Tudo (rastreado)</option>
          </select>
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Setor</span>
          <select className="mk-select" value={filters.sector} onChange={(e) => set('sector', e.target.value)}>
            <option value="all">Todos</option>
            {SECTORS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Direção</span>
          <select className="mk-select" value={filters.direction} onChange={(e) => set('direction', e.target.value as ScreenerFilters['direction'])}>
            <option value="all">Todas</option>
            <option value="up">Em alta</option>
            <option value="down">Em queda</option>
          </select>
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Var. mín. (%)</span>
          <input className="mk-input" type="number" inputMode="decimal" step="0.5" placeholder="ex: 2"
            value={filters.minChangePct != null ? (filters.minChangePct * 100).toString() : ''}
            onChange={(e) => { const v = numOrNull(e.target.value); set('minChangePct', v == null ? null : v / 100); }} />
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Var. máx. (%)</span>
          <input className="mk-input" type="number" inputMode="decimal" step="0.5" placeholder="ex: -2"
            value={filters.maxChangePct != null ? (filters.maxChangePct * 100).toString() : ''}
            onChange={(e) => { const v = numOrNull(e.target.value); set('maxChangePct', v == null ? null : v / 100); }} />
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Preço mín.</span>
          <input className="mk-input" type="number" inputMode="decimal" step="1" placeholder="ex: 10"
            value={filters.minPrice != null ? String(filters.minPrice) : ''}
            onChange={(e) => set('minPrice', numOrNull(e.target.value))} />
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Preço máx.</span>
          <input className="mk-input" type="number" inputMode="decimal" step="1" placeholder="ex: 500"
            value={filters.maxPrice != null ? String(filters.maxPrice) : ''}
            onChange={(e) => set('maxPrice', numOrNull(e.target.value))} />
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Volume mín.</span>
          <input className="mk-input" type="number" inputMode="numeric" step="100000" placeholder="ex: 1000000"
            value={filters.minVolume != null ? String(filters.minVolume) : ''}
            onChange={(e) => set('minVolume', numOrNull(e.target.value))} />
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Buscar</span>
          <input className="mk-input" type="search" placeholder="símbolo ou nome"
            value={filters.query} onChange={(e) => set('query', e.target.value)} />
        </label>

        <label className="mk-field">
          <span className="mk-field-label">Limite</span>
          <select className="mk-select" value={String(filters.limit)} onChange={(e) => set('limit', Number(e.target.value))}>
            <option value="30">30</option>
            <option value="60">60</option>
            <option value="120">120</option>
          </select>
        </label>
      </div>

      <p className="mk-subtitle">
        Universo rastreado: {result.withData} de {result.universeTotal} símbolos com dados · {result.matched} após filtros
        {filters.rules.trim() && !result.ruleError ? ' · regra ativa' : ''}
        {filters.fundamentalRules.trim() && !result.fundamentalRuleError ? ' · fundamentos ativos' : ''}.
        {' '}Sem open/gap/RVOL no feed grátis.
      </p>

      {result.rows.length === 0 ? (
        <div className="mk-empty">Nenhum ativo atende aos filtros.</div>
      ) : (
        <section className="mk-group" aria-label="Resultados do screener">
          <div className="mk-table-scroll">
            <div className="mk-table mk-table--screener">
              <div className="mk-table-head">
                <span>Ativo</span>
                <span>Setor</span>
                <SortHead label="Preço" sortKey="price" numeric />
                <SortHead label="1d" sortKey="changePct" numeric />
                <SortHead label="5d" sortKey="change5d" numeric />
                <SortHead label="Volume" sortKey="volume" numeric />
              </div>
              {result.rows.map((r) => (
                <div key={r.symbol} className="mk-table-row">
                  <span className="mk-table-name">
                    <span className="mk-table-sym">{r.symbol}</span>
                    <span className="mk-table-sub">{r.name}</span>
                  </span>
                  <span className="mk-table-sub">{r.sector}</span>
                  <span className="mk-num">{fmtPrice(r.price)}</span>
                  <span className={`mk-num ${changeClass(r.changePct)}`}>{fmtPct(r.changePct, 2)}</span>
                  <span className={`mk-num ${changeClass(r.change5d)}`}>{fmtPct(r.change5d, 1)}</span>
                  <span className="mk-num">{fmtVolume(r.volume)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
