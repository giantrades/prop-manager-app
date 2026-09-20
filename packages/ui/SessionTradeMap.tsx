// SessionTradeMap — mapa de um dia (0–24h) com as SESSÕES de mercado ao fundo e os TRADES
// desenhados da ABERTURA ao FECHAMENTO (bolinha → barra → seta). Cada trade é um objeto só,
// então nada é contado duas vezes; a cor = direção (long verde / short vermelho). Apresentação
// pura: só usa `entryDatetime`/`exitDatetime` e `tradeNetPnl`.
// Toque/clique num trade abre o detalhe (no celular não existe hover para o `title`).
import React, { useEffect, useMemo, useState } from 'react';
import type { Trade, SessionDef } from '@apps/lib/db';
import { parseDate, tradeNetPnl } from '@apps/lib/db';
import { sessionDisplaySegments, pct, fmtHM, dayKeyOfMs, dayStartMs } from './sessionTime';
import { SESSION_COLORS } from './sessionIcons';
import { fmtMoney } from './currency';
import { useNowTick } from './Usenowtick';

interface Props {
  trades: Trade[];
  sessions: SessionDef[];
  zone?: 'local' | 'utc';
  currency?: string;
  /** Dia exibido ('YYYY-MM-DD'; null = hoje), controlado pelo pai. Quando presente, o seletor de dia
   *  próprio some (o pai — HeatmapSection — mostra um só, no mapa-múndi). Sem ele: comportamento antigo. */
  day?: string | null;
}

const HOUR_LABELS = [0, 6, 12, 18, 24];
const ROW_H = 22; // altura da faixa (área de toque ≈ 22px)
const BAR_H = 16; // altura visual da barra
// Um trade de 5 min ocuparia ~1px; a barra tem largura mínima de 14px (bolinha + seta).
// Na hora de empacotar em faixas reservamos ao menos 1h, senão dois trades próximos se sobrepõem.
const MIN_LANE_H = 1;

function dayKeyOf(iso: string, zone: 'local' | 'utc'): string {
  return dayKeyOfMs(parseDate(iso).getTime(), zone);
}

export default function SessionTradeMap({ trades, sessions, zone = 'local', currency = 'USD', day: dayProp }: Props) {
  const now = useNowTick(); // o "agora" anda sozinho (a cada 60 s)
  const zoneLabel = zone === 'utc' ? 'UTC' : 'local';
  const offsetHours = -now.getTimezoneOffset() / 60;
  const delta = zone === 'utc' ? -offsetHours : 0;
  const nowH = zone === 'utc'
    ? now.getUTCHours() + now.getUTCMinutes() / 60
    : now.getHours() + now.getMinutes() / 60;

  // Dias disponíveis (da abertura e do fechamento).
  const days = useMemo(() => {
    const set = new Set<string>();
    for (const t of trades) {
      if (t.entryDatetime) set.add(dayKeyOf(t.entryDatetime, zone));
      if (t.exitDatetime) set.add(dayKeyOf(t.exitDatetime, zone));
    }
    return [...set].sort();
  }, [trades, zone]);

  const controlled = dayProp !== undefined;
  const todayKey = dayKeyOfMs(now.getTime(), zone);
  const [innerDay, setInnerDay] = useState<string | null>(null);
  const selectedDay = controlled ? (dayProp ?? todayKey) : innerDay;
  const setSelectedDay = setInnerDay;
  const [selectedId, setSelectedId] = useState<Trade['id'] | null>(null);
  // Só INICIALIZA o dia. Antes o efeito também "corrigia" qualquer dia fora de `days`,
  // então ◀/▶ e o seletor de data voltavam sozinhos ao último dia com trade ao cair
  // num fim de semana/feriado (e o "Sem trades neste dia." nunca aparecia).
  useEffect(() => {
    if (!controlled && innerDay === null && days.length > 0) setInnerDay(days[days.length - 1]);
  }, [controlled, days, innerDay]);

  const isToday = selectedDay === todayKey;

  const bars = useMemo(() => {
    if (!selectedDay) return [];
    const ds = dayStartMs(selectedDay, zone);
    const out: Array<{ t: Trade; start: number; end: number; open: boolean }> = [];
    for (const t of trades) {
      if (!t.entryDatetime) continue;
      const e0 = (parseDate(t.entryDatetime).getTime() - ds) / 3600000;
      const hasExit = !!t.exitDatetime;
      const x0 = hasExit ? (parseDate(t.exitDatetime as string).getTime() - ds) / 3600000 : NaN;
      const start = e0;
      const end = hasExit ? x0 : (dayKeyOf(t.entryDatetime, zone) === todayKey ? nowH : 24);
      if (end <= 0 || start >= 24) continue;
      out.push({
        t,
        start: Math.max(0, start),
        end: Math.min(24, Math.max(end, start + 0.1)),
        open: !hasExit,
      });
    }
    out.sort((a, b) => a.start - b.start);
    return out;
  }, [trades, selectedDay, zone, nowH, todayKey]);

  // Empacota em faixas: primeiro espaço livre sem sobrepor no tempo.
  const laid = useMemo(() => {
    const laneEnds: number[] = [];
    return bars.map((it) => {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = Math.max(it.end, it.start + MIN_LANE_H);
      return { ...it, lane };
    });
  }, [bars]);
  const laneCount = laid.reduce((m, x) => Math.max(m, x.lane + 1), 0);
  const plotH = Math.max(ROW_H, laneCount * ROW_H);

  const sessionSegs = useMemo(
    () => sessions.map((def, i) => ({ def, i, segs: sessionDisplaySegments(def, delta) })),
    [sessions, delta],
  );

  // ◀/▶ pulam entre dias COM trades; o seletor de data continua aceitando qualquer dia.
  const prevDay = useMemo(() => {
    if (!selectedDay) return null;
    for (let i = days.length - 1; i >= 0; i--) if (days[i] < selectedDay) return days[i];
    return null;
  }, [days, selectedDay]);
  const nextDay = useMemo(() => {
    if (!selectedDay) return null;
    for (let i = 0; i < days.length; i++) if (days[i] > selectedDay) return days[i];
    return null;
  }, [days, selectedDay]);

  const sel = laid.find((b) => b.t.id === selectedId) ?? null;
  const selPnl = sel ? tradeNetPnl(sel.t) : 0;
  const selLong = sel ? sel.t.direction !== 'short' : true;

  return (
    <div className="stm-root">
      <div className="stm-head">
        <div className="stm-legend" role="group" aria-label="Legenda do mapa">
          <span className="stm-chip"><i className="stm-lg stm-lg-long" aria-hidden="true" />long</span>
          <span className="stm-chip"><i className="stm-lg stm-lg-short" aria-hidden="true" />short</span>
          <span className="stm-chip"><i className="stm-lg-dot" aria-hidden="true" />abertura</span>
          <span className="stm-chip"><i className="stm-lg-arrow" aria-hidden="true" />fechamento</span>
        </div>
        {!controlled && (
          <div className="stm-day">
            <button
              type="button"
              className="stm-btn"
              onClick={() => prevDay && setSelectedDay(prevDay)}
              disabled={!prevDay}
              aria-label="Dia anterior com trades"
            >◀</button>
            <input
              className="stm-date"
              type="date"
              value={selectedDay ?? ''}
              onChange={(e) => e.target.value && setSelectedDay(e.target.value)}
              aria-label="Dia do mapa"
            />
            <button
              type="button"
              className="stm-btn"
              onClick={() => nextDay && setSelectedDay(nextDay)}
              disabled={!nextDay}
              aria-label="Próximo dia com trades"
            >▶</button>
          </div>
        )}
      </div>

      <div className="stm-axis">
        {HOUR_LABELS.map((h) => (
          <span key={h} className="stm-hour" style={{ left: pct(h) }}>{h}h</span>
        ))}
      </div>

      <div className="stm-plot" style={{ height: `${plotH}px` }}>
        {sessionSegs.map(({ def, i, segs }) => (
          <React.Fragment key={def.id}>
            {segs.map((s) => (
              <span
                key={`${def.id}-${s.start}`}
                className="stm-band"
                style={{
                  left: pct(s.start),
                  width: pct(s.end - s.start),
                  background: `${SESSION_COLORS[i % SESSION_COLORS.length]}28`,
                }}
                aria-hidden="true"
              />
            ))}
          </React.Fragment>
        ))}
        {[6, 12, 18].map((h) => (
          <span key={h} className="stm-grid" style={{ left: pct(h) }} aria-hidden="true" />
        ))}
        {isToday && <span className="stm-now" style={{ left: `${(nowH / 24) * 100}%` }} aria-hidden="true" />}

        {laid.map((b) => {
          const pnl = tradeNetPnl(b.t);
          const long = b.t.direction !== 'short';
          const w = Math.max(0.4, b.end - b.start);
          const title = `${b.t.symbol} ${long ? 'long' : 'short'} • ${fmtHM(b.start)} → ${b.open ? 'aberto' : fmtHM(b.end)} ${zoneLabel} • ${fmtMoney(pnl, currency)}${b.t.resultR != null ? ` • ${Number(b.t.resultR).toFixed(2)}R` : ''}`;
          const selected = b.t.id === selectedId;
          return (
            <button
              type="button"
              key={b.t.id}
              className={`stm-bar${b.open ? ' stm-bar-open' : ''} ${long ? 'stm-long' : 'stm-short'}${selected ? ' is-selected' : ''}`}
              style={{ left: pct(b.start), width: pct(w), top: `${b.lane * ROW_H + (ROW_H - BAR_H) / 2}px` }}
              title={title}
              aria-label={title}
              aria-pressed={selected}
              onClick={() => setSelectedId(selected ? null : b.t.id)}
            >
              <i className="stm-dot" aria-hidden="true" />
              <em className="stm-sym">{b.t.symbol}</em>
              {!b.open && <i className="stm-arrow" aria-hidden="true" />}
            </button>
          );
        })}

        {laid.length === 0 && <div className="stm-empty">Sem trades neste dia.</div>}
      </div>

      {sel && (
        <div className="stm-detail" role="status">
          <strong>{sel.t.symbol}</strong>
          <span className={selLong ? 'stm-up' : 'stm-down'}>{selLong ? 'long' : 'short'}</span>
          <span className="stm-num">{fmtHM(sel.start)} → {sel.open ? 'aberto' : fmtHM(sel.end)} {zoneLabel}</span>
          <span className={`stm-num ${selPnl >= 0 ? 'stm-up' : 'stm-down'}`}>{fmtMoney(selPnl, currency)}</span>
          {sel.t.resultR != null && <span className="stm-num">{Number(sel.t.resultR).toFixed(2)}R</span>}
        </div>
      )}

      <p className="stm-hint">
        Período exibido: 00:00–24:00 ({zoneLabel}){isToday ? ' • linha = agora' : ''} • toque num trade para ver o detalhe
      </p>
    </div>
  );
}

const STM_CSS = `
.stm-root {
  --stm-long: var(--green, #2ecc71);
  --stm-short: var(--red, #e74c3c);
  display: flex; flex-direction: column; gap: 8px;
}
.stm-head { display: flex; flex-direction: column; gap: 8px; }
.stm-legend { display: flex; flex-wrap: wrap; gap: 6px; }
.stm-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text, #e7eaf0); background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 2px 9px; }
.stm-lg { display: inline-block; width: 14px; height: 8px; border-radius: 4px; border: 1px solid transparent; }
.stm-lg-long { border-color: var(--stm-long); background: color-mix(in srgb, var(--stm-long) 45%, transparent); }
.stm-lg-short { border-color: var(--stm-short); background: color-mix(in srgb, var(--stm-short) 45%, transparent); }
.stm-lg-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; box-sizing: border-box; background: var(--text, #e7eaf0); border: 2px solid var(--muted, #a1a7b3); }
.stm-lg-arrow { display: inline-block; width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid var(--muted, #a1a7b3); }
.stm-day { display: flex; align-items: center; gap: 6px; }
.stm-btn { min-height: 40px; min-width: 40px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); cursor: pointer; }
.stm-btn:disabled { opacity: 0.4; cursor: default; }
.stm-date { flex: 1; min-height: 40px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 4px 8px; color: var(--text, #e7eaf0); font-size: 13px; font-family: inherit; color-scheme: dark; }
.stm-axis { position: relative; height: 15px; margin: 0 2px; }
.stm-hour { position: absolute; top: 0; transform: translateX(-50%); font-size: 10px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.stm-hour:first-child { transform: translateX(0); }
.stm-hour:last-child { transform: translateX(-100%); }
.stm-plot { position: relative; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
.stm-band { position: absolute; top: 0; bottom: 0; }
.stm-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.06); }
.stm-now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--brand, #7c5cff); box-shadow: 0 0 6px var(--brand, #7c5cff); z-index: 3; pointer-events: none; }

/* Barra do trade: <button> (foco por teclado + toque). Largura mínima = bolinha + seta. */
.stm-bar { position: absolute; height: 16px; min-width: 14px; margin: 0; padding: 0; border-radius: 8px; border: 1px solid transparent; display: flex; align-items: center; z-index: 2; cursor: pointer; font: inherit; color: var(--text, #e7eaf0); text-align: left; }
.stm-bar::before { content: ''; position: absolute; inset: -3px -4px; } /* área de toque ≈ 22px */
.stm-bar:focus-visible { outline: 2px solid var(--text, #e7eaf0); outline-offset: 2px; z-index: 4; }
.stm-bar.is-selected { box-shadow: 0 0 0 2px var(--text, #e7eaf0); z-index: 4; }
.stm-long { border-color: var(--stm-long); background: color-mix(in srgb, var(--stm-long) 45%, transparent); }
.stm-short { border-color: var(--stm-short); background: color-mix(in srgb, var(--stm-short) 45%, transparent); }
.stm-bar.stm-bar-open { background: transparent; border-style: dashed; }
.stm-dot { position: absolute; left: 1px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: var(--text, #e7eaf0); border: 2px solid currentColor; box-sizing: border-box; }
.stm-long .stm-dot { color: var(--stm-long); }
.stm-short .stm-dot { color: var(--stm-short); }
.stm-arrow { position: absolute; right: 0; top: 50%; margin-top: -4px; width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid currentColor; }
.stm-long .stm-arrow { color: var(--stm-long); }
.stm-short .stm-arrow { color: var(--stm-short); }
/* Símbolo: posicionado por left/right, então encolhe até sumir em barras curtas (sem vazar). */
.stm-sym { position: absolute; left: 12px; right: 9px; top: 50%; transform: translateY(-50%); font-style: normal; font-size: 10px; font-weight: 700; line-height: 1.2; color: var(--text, #e7eaf0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.stm-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--muted, #a1a7b3); font-size: 12px; }

.stm-detail { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); font-size: 12px; color: var(--text, #e7eaf0); }
.stm-detail strong { font-size: 13px; }
.stm-num { font-variant-numeric: tabular-nums; }
.stm-up { color: var(--stm-long); }
.stm-down { color: var(--stm-short); }
.stm-hint { margin: 0; font-size: 11px; color: var(--muted, #a1a7b3); }
`;
if (typeof document !== 'undefined' && !document.getElementById('stm-styles')) {
  const style = document.createElement('style');
  style.id = 'stm-styles';
  style.textContent = STM_CSS;
  document.head.appendChild(style);
}