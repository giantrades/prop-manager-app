import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, CrosshairMode, createChart } from 'lightweight-charts';
import { fmtMoney } from '@apps/ui/currency';
import { X, SlidersHorizontal, Send, RefreshCw } from 'lucide-react';

const PERIODS = [
  ['1m', '1m'],
  ['5m', '5m'],
  ['15m', '15m'],
  ['30m', '30m'],
  ['1h', '1h'],
  ['4h', '4h'],
  ['1d', '1d'],
];

const UP = '#2ecc71';
const DOWN = '#e74c3c';
const BG = '#0f131b';
const GRID = 'rgba(255,255,255,0.045)';
const BORDER = 'rgba(255,255,255,0.10)';
const TEXT = '#a1a7b3';

function roundTo(v, precision) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(Math.max(0, Math.min(8, precision))));
}

function isLongSide(side) {
  return String(side ?? '').toLowerCase().startsWith('long');
}

function fmtPrice(v, precision = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: precision, maximumFractionDigits: precision });
}

function pricePrecision(bars) {
  let p = 2;
  for (const b of bars.slice(-40)) {
    const s = String(b.close);
    const i = s.indexOf('.');
    if (i >= 0) p = Math.max(p, Math.min(5, s.length - i - 1));
  }
  return p;
}

function fmtBarTime(t, period) {
  const d = new Date(Number(t) * 1000);
  if (!Number.isFinite(d.getTime())) return '';
  if (period === '1d') return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function PositionChart({ position, order, adapter, online, onClose, onRefresh, onSaveLevels, onPlaceOrder }) {
  const isOrder = !position && !!order;
  const symbol = String(position?.symbol ?? order?.symbol ?? '').toUpperCase();
  const long = isLongSide(position?.side ?? order?.side);
  const entry = isOrder
    ? (Number(order?.price) || Number(order?.triggerPrice) || 0)
    : (Number(position?.openPrice) || 0);
  const current = Number(position?.currentPrice) || 0;
  const baseSl = position ? position.sl : order?.sl;
  const baseTp = position ? position.tp : order?.tp;

  const [period, setPeriod] = useState('5m');
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const [drag, setDrag] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState(null);
  const [phantom, setPhantom] = useState({});
  const [orderSide, setOrderSide] = useState(long ? 'sell' : 'buy');
  const [orderQty, setOrderQty] = useState(String(position?.quantity ?? order?.quantity ?? 1));
  const [orderSl, setOrderSl] = useState('');
  const [orderTp, setOrderTp] = useState('');
  const [sending, setSending] = useState(false);
  const [lines, setLines] = useState({ sl: null, tp: null, entry: null, current: null, paneW: 0 });

  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const precisionRef = useRef(2);
  const fitRef = useRef(true);
  const periodRef = useRef(period);
  const dragRef = useRef(null);
  const levelsRef = useRef({});
  const editorRef = useRef(null);

  const precision = useMemo(() => pricePrecision(bars), [bars]);
  const step = Math.pow(10, -precision);
  const orderIsStop = String(order?.type ?? '').toLowerCase().includes('stop');
  const orderBasePrice = isOrder
    ? (orderIsStop ? Number(order?.triggerPrice) : Number(order?.price)) || 0
    : 0;
  const displayEntry = isOrder ? (pendingOrder ?? (orderBasePrice || entry)) : entry;

  const slPrice = drag?.kind === 'sl' ? drag.price : pending?.sl ?? baseSl ?? phantom.sl ?? null;
  const tpPrice = drag?.kind === 'tp' ? drag.price : pending?.tp ?? baseTp ?? phantom.tp ?? null;
  const slNew = !(Number(baseSl) > 0) && phantom.sl != null;
  const tpNew = !(Number(baseTp) > 0) && phantom.tp != null;
  const markPrice = Number(live?.last ?? live?.bid ?? live?.ask) || current || entry;

  useEffect(() => {
    periodRef.current = period;
    precisionRef.current = precision;
    levelsRef.current = { sl: Number(slPrice), tp: Number(tpPrice), entry: displayEntry, current: markPrice };
  }, [period, precision, slPrice, tpPrice, displayEntry, markPrice]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: BG }, textColor: TEXT, fontSize: 11 },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      rightPriceScale: { borderColor: BORDER, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: {
        borderColor: BORDER,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        tickMarkFormatter: (t) => fmtBarTime(t, periodRef.current),
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale: 'pt-BR',
        timeFormatter: (t) => fmtBarTime(t, periodRef.current),
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
      lastValueVisible: true,
      autoscaleInfoProvider: (original) => {
        const base = original();
        if (!base?.priceRange) return base;
        const { sl, tp, entry: e, current: c } = levelsRef.current;
        const prices = [sl, tp, e, c].filter((v) => Number.isFinite(v) && v > 0);
        if (!prices.length) return base;
        let min = base.priceRange.minValue;
        let max = base.priceRange.maxValue;
        for (const p of prices) { min = Math.min(min, p); max = Math.max(max, p); }
        const pad = (max - min) * 0.06 || 1;
        return { ...base, priceRange: { minValue: min - pad, maxValue: max + pad } };
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    fitRef.current = true;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const onClick = (param) => {
      if (!param?.point || !seriesRef.current) return;
      const price = seriesRef.current.coordinateToPrice(param.point.y);
      const rounded = roundTo(price, precisionRef.current);
      if (rounded == null) return;
      setDraft({ price: rounded });
      setOrderSide(long ? 'sell' : 'buy');
      setOrderQty(String(position?.quantity ?? order?.quantity ?? 1));
      setOrderSl('');
      setOrderTp('');
    };
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
  }, [long, position?.quantity, order?.quantity]);

  useEffect(() => {
    let alive = true;
    const load = async (silent) => {
      if (!adapter || !symbol) return;
      if (!silent) setLoading(true);
      try {
        const data = await adapter.getHistory(symbol, period, 300);
        if (!alive) return;
        setBars(data);
        setError(data.length ? '' : 'Sem candles para este símbolo.');
      } catch (err) {
        if (!alive) return;
        if (!silent) setBars([]);
        setError(err instanceof Error ? err.message : 'Falha ao carregar o gráfico.');
      } finally {
        if (alive && !silent) setLoading(false);
      }
    };
    load(false);
    const t = setInterval(() => load(true), 5000);
    return () => { alive = false; clearInterval(t); };
  }, [adapter, symbol, period]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!adapter || !symbol) return;
      try {
        const q = await adapter.getQuote(symbol);
        if (alive) setLive(q);
      } catch { /* cotação é opcional */ }
    };
    tick();
    const t = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [adapter, symbol]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.applyOptions({
      priceFormat: { type: 'price', precision, minMove: step },
    });
    series.setData(bars);
    if (fitRef.current && bars.length) {
      chartRef.current?.timeScale().fitContent();
      fitRef.current = false;
    }
  }, [bars, precision, step]);

  useEffect(() => { fitRef.current = true; }, [period]);

  const recalc = useCallback(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    const el = wrapRef.current;
    if (!series || !chart || !el) return;
    const y = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return null;
      const c = series.priceToCoordinate(n);
      return Number.isFinite(c) ? c : null;
    };
    const paneW = Math.max(0, el.clientWidth - chart.priceScale('right').width());
    const next = {
      sl: y(slPrice),
      tp: y(tpPrice),
      entry: y(displayEntry),
      current: y(markPrice),
      paneW,
    };
    setLines((prev) => (
      prev.sl === next.sl && prev.tp === next.tp && prev.entry === next.entry
      && prev.current === next.current && prev.paneW === next.paneW
        ? prev
        : next
    ));
  }, [slPrice, tpPrice, displayEntry, markPrice]);

  useEffect(() => {
    recalc();
    const t = setInterval(recalc, 250);
    return () => clearInterval(t);
  }, [recalc]);

  useEffect(() => {
    if (!pending) return undefined;
    const t = setTimeout(() => setPending(null), 6000);
    return () => clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    if (pendingOrder == null) return undefined;
    if (orderBasePrice > 0 && Math.abs(Number(pendingOrder) - orderBasePrice) < step / 2) {
      setPendingOrder(null);
      return undefined;
    }
    const t = setTimeout(() => setPendingOrder(null), 6000);
    return () => clearTimeout(t);
  }, [pendingOrder, orderBasePrice, step]);

  useEffect(() => {
    setPhantom((p) => {
      if (!p || (!('sl' in p) && !('tp' in p))) return p;
      const n = { ...p };
      if (Number(baseSl) > 0) delete n.sl;
      if (Number(baseTp) > 0) delete n.tp;
      return n;
    });
  }, [baseSl, baseTp]);

  useEffect(() => {
    if (!pending) return;
    setPending((p) => {
      if (!p) return p;
      const n = { ...p };
      if (n.sl != null && Math.abs(Number(baseSl) - n.sl) < step / 2) delete n.sl;
      if (n.tp != null && Math.abs(Number(baseTp) - n.tp) < step / 2) delete n.tp;
      return n.sl == null && n.tp == null ? null : n;
    });
  }, [baseSl, baseTp, step]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clampLevel = (kind, price) => {
    const ref = isOrder ? Number(displayEntry) : (Number(markPrice) || Number(entry));
    if (!Number.isFinite(ref) || ref <= 0) return price;
    if (kind === 'sl') {
      return long ? Math.min(price, ref - step) : Math.max(price, ref + step);
    }
    return long ? Math.max(price, ref + step) : Math.min(price, ref - step);
  };

  const clampOrderPrice = (price) => {
    const ref = Number(markPrice) || Number(displayEntry);
    if (!Number.isFinite(ref) || ref <= 0) return price;
    if (orderIsStop) {
      return long ? Math.max(price, ref + step) : Math.min(price, ref - step);
    }
    return long ? Math.min(price, ref - step) : Math.max(price, ref + step);
  };

  const createLevel = (kind) => {
    const base = isOrder ? Number(displayEntry) : (Number(markPrice) || Number(entry));
    if (!(base > 0)) return;
    const dist = 30 * step;
    const raw = kind === 'sl'
      ? (long ? base - dist : base + dist)
      : (long ? base + dist : base - dist);
    const price = roundTo(raw, precision);
    if (price == null) return;
    setPhantom((p) => ({ ...p, [kind]: price }));
  };

  const shiftBrackets = (oldPrice, newPrice) => {
    const delta = Number(newPrice) - Number(oldPrice);
    if (!Number.isFinite(delta) || delta === 0) return;
    setPending((p) => {
      const n = { ...(p ?? {}) };
      if (Number(slPrice) > 0) n.sl = roundTo(Number(slPrice) + delta, precisionRef.current);
      if (Number(tpPrice) > 0) n.tp = roundTo(Number(tpPrice) + delta, precisionRef.current);
      return n;
    });
  };

  const openEditor = (kind) => {
    const current = kind === 'order' ? displayEntry : kind === 'sl' ? slPrice : tpPrice;
    if (!(Number(current) > 0)) return;
    if (kind === 'order' ? !onSaveOrderPrice : !onSaveLevels) return;
    setDraft(null);
    setEditor({
      kind,
      value: String(current),
      qty: kind === 'order' ? String(order?.remainingQuantity ?? order?.quantity ?? '') : '',
    });
  };

  const confirmEditor = () => {
    if (!editor) return;
    const price = roundTo(Number(String(editor.value).replace(',', '.')), precisionRef.current);
    if (price == null || !(price > 0)) return;
    const qty = editor.kind === 'order'
      ? Number(String(editor.qty).replace(',', '.'))
      : null;
    if (editor.kind === 'order' && !(qty > 0)) return;
    if (editor.kind === 'order') {
      setPendingOrder(price);
      shiftBrackets(Number(displayEntry), price);
      onSaveOrderPrice?.(price, qty);
    } else {
      setPending((p) => ({ ...(p ?? {}), [editor.kind]: price }));
      setPhantom((p) => { const n = { ...p }; delete n[editor.kind]; return n; });
      onSaveLevels?.(editor.kind === 'sl' ? { sl: price } : { tp: price });
    }
    setEditor(null);
  };

  const beginDrag = (kind, e) => {
    if (!online) return;
    if (kind === 'order' ? !onSaveOrderPrice : !onSaveLevels) return;
    const series = seriesRef.current;
    const el = wrapRef.current;
    const start = kind === 'order' ? displayEntry : kind === 'sl' ? slPrice : tpPrice;
    if (!series || !el || !Number.isFinite(Number(start))) return;
    e.preventDefault();
    e.stopPropagation();
    const startPrice = Number(start);
    const isNew = kind === 'order' ? false : kind === 'sl' ? slNew : tpNew;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let last = null;

    const move = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) <= 4) return;
        moved = true;
      }
      const rect = el.getBoundingClientRect();
      const raw = series.coordinateToPrice(ev.clientY - rect.top);
      const rounded = roundTo(raw, precisionRef.current);
      if (rounded == null) return;
      last = { kind, price: kind === 'order' ? clampOrderPrice(rounded) : clampLevel(kind, rounded) };
      dragRef.current = last;
      setDrag(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) {
        dragRef.current = null;
        setDrag(null);
        openEditor(kind);
        return;
      }
      const d = last || dragRef.current;
      dragRef.current = null;
      setDrag(null);
      const finalPrice = d ? Number(d.price) : (isNew ? startPrice : null);
      if (finalPrice != null && (isNew || Math.abs(finalPrice - startPrice) >= step / 2)) {
        const next = roundTo(finalPrice, precisionRef.current);
        if (next != null) {
          if (kind === 'order') {
            setPendingOrder(next);
            // Bracket do Quantower é offset em ticks: move SL/TP junto com o preço.
            const delta = next - startPrice;
            setPending((p) => {
              const n = { ...(p ?? {}) };
              if (Number(slPrice) > 0) n.sl = roundTo(Number(slPrice) + delta, precisionRef.current);
              if (Number(tpPrice) > 0) n.tp = roundTo(Number(tpPrice) + delta, precisionRef.current);
              return n;
            });
            onSaveOrderPrice(next);
          } else {
            setPending((p) => ({ ...(p ?? {}), [kind]: next }));
            setPhantom((p) => { const n = { ...p }; delete n[kind]; return n; });
            onSaveLevels(kind === 'sl' ? { sl: next } : { tp: next });
          }
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const sendDraft = async () => {
    const qty = Number(String(orderQty).replace(',', '.'));
    const sl = Number(String(orderSl).replace(',', '.')) || null;
    const tp = Number(String(orderTp).replace(',', '.')) || null;
    if (!draft || !(qty > 0) || !onPlaceOrder) return;
    setSending(true);
    try {
      await onPlaceOrder({ side: orderSide, qty, price: draft.price, sl, tp });
      setDraft(null);
    } finally {
      setSending(false);
    }
  };

  const pnl = Number(position?.netPnl);
  const varPct = (() => {
    if (!(entry > 0) || !Number.isFinite(Number(position?.currentPrice))) return null;
    const dir = long ? 1 : -1;
    return ((Number(position.currentPrice) - entry) / entry) * 100 * dir;
  })();

  const editorLabel = editor?.kind === 'order'
    ? (orderIsStop ? 'Gatilho da ordem' : 'Preço da ordem')
    : editor?.kind === 'sl' ? 'Stop loss' : 'Take profit';
  const editorTop = (() => {
    if (!editor) return '50%';
    const y = editor.kind === 'order' ? lines.entry : editor.kind === 'sl' ? lines.sl : lines.tp;
    const h = wrapRef.current?.clientHeight || 320;
    const top = Number.isFinite(y) ? y : h / 2;
    return `${Math.max(64, Math.min(top, h - 64))}px`;
  })();

  return (
    <div className="pc-backdrop" role="dialog" aria-modal="true" aria-label={`Gráfico de ${symbol}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="pc-panel">
        <div className="pc-head">
          <div className="pc-title">
            <b>{symbol}</b>
            {isOrder && <span className="pc-side pc-order-badge">ordem</span>}
            <span className={`pc-side ${long ? 'pc-long' : 'pc-short'}`}>{position?.side ?? order?.side}</span>
            <span className="pc-muted">{position?.quantity ?? order?.quantity} @ {fmtPrice(displayEntry, precision)}</span>
            {Number.isFinite(pnl) && (
              <span className={`pc-pnl ${pnl >= 0 ? 'pc-long' : 'pc-short'}`}>{fmtMoney(pnl)}</span>
            )}
            {varPct != null && <span className={`pc-muted ${varPct >= 0 ? 'pc-long' : 'pc-short'}`}>{varPct.toFixed(2)}%</span>}
          </div>
          <div className="pc-head-actions">
            <span className="pc-live">{online ? 'LIVE' : 'offline'}</span>
            <button className="pc-x" onClick={() => onRefresh?.()} title="Atualizar ordens/posições" aria-label="Atualizar ordens e posições"><RefreshCw size={15} /></button>
            <button className="pc-x" onClick={() => onClose?.()} aria-label="Fechar gráfico"><X size={18} /></button>
          </div>
        </div>

        <div className="pc-toolbar">
          {PERIODS.map(([id, label]) => (
            <button key={id} className={`pc-period ${period === id ? 'on' : ''}`} onClick={() => setPeriod(id)}>{label}</button>
          ))}
          {slPrice == null && <button className="pc-period pc-add pc-add-sl" onClick={() => createLevel('sl')}>+ SL</button>}
          {tpPrice == null && <button className="pc-period pc-add pc-add-tp" onClick={() => createLevel('tp')}>+ TP</button>}
          <span className="pc-levels">SL {slPrice != null ? fmtPrice(slPrice, precision) : '—'} · TP {tpPrice != null ? fmtPrice(tpPrice, precision) : '—'}</span>
          <span className="pc-hint"><SlidersHorizontal size={12} /> arraste a ordem e SL/TP</span>
        </div>

        <div className="pc-chart" ref={wrapRef}>
          <div className="pc-lines">
            {lines.current != null && (
              <div className="pc-guide pc-guide-current" style={{ top: lines.current, width: lines.paneW }}>
                <span className="pc-guide-tag">{fmtPrice(markPrice, precision)}</span>
              </div>
            )}
            {lines.entry != null && (
              isOrder ? (
                <div
                  className="pc-level pc-level-order"
                  style={{ top: lines.entry, width: lines.paneW }}
                  onPointerDown={(e) => beginDrag('order', e)}
                  role="slider"
                  aria-label="Preço da ordem"
                  aria-valuenow={Number(displayEntry) || 0}
                  tabIndex={0}
                >
                  <span className="pc-level-tag">ordem {orderIsStop ? 'stop' : 'limit'} {fmtPrice(displayEntry, precision)}</span>
                </div>
              ) : (
                <div className="pc-guide pc-guide-entry" style={{ top: lines.entry, width: lines.paneW }}>
                  <span className="pc-guide-tag">entrada {fmtPrice(displayEntry, precision)}</span>
                </div>
              )
            )}
            {lines.tp != null && (
              <div
                className={`pc-level pc-level-tp${tpNew ? ' pc-level-new' : ''}`}
                style={{ top: lines.tp, width: lines.paneW }}
                onPointerDown={(e) => beginDrag('tp', e)}
                role="slider"
                aria-label="Take profit"
                aria-valuenow={Number(tpPrice) || 0}
                tabIndex={0}
              >
                <span className="pc-level-tag">{tpNew ? 'arraste TP' : 'TP'} {fmtPrice(tpPrice, precision)}</span>
              </div>
            )}
            {lines.sl != null && (
              <div
                className={`pc-level pc-level-sl${slNew ? ' pc-level-new' : ''}`}
                style={{ top: lines.sl, width: lines.paneW }}
                onPointerDown={(e) => beginDrag('sl', e)}
                role="slider"
                aria-label="Stop loss"
                aria-valuenow={Number(slPrice) || 0}
                tabIndex={0}
              >
                <span className="pc-level-tag">{slNew ? 'arraste SL' : 'SL'} {fmtPrice(slPrice, precision)}</span>
              </div>
            )}
          </div>
          {editor && (
            <>
              <div className="pc-edit-backdrop" onPointerDown={() => setEditor(null)} />
              <div
                className="pc-editor"
                role="dialog"
                aria-modal="true"
                aria-label={editorLabel}
                ref={editorRef}
                style={{ top: editorTop }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="pc-editor-head">
                  <span>{editorLabel}</span>
                  <button className="pc-editor-x" onClick={() => setEditor(null)} aria-label="Cancelar edição"><X size={14} /></button>
                </div>
                {editor.kind === 'order' && (
                  <label className="pc-editor-field">
                    <span>Quantidade</span>
                    <input
                      className="pc-input pc-editor-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editor.qty ?? ''}
                      onChange={(e) => setEditor((s) => ({ ...s, qty: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmEditor();
                        if (e.key === 'Escape') setEditor(null);
                      }}
                      aria-label="Quantidade da ordem"
                    />
                  </label>
                )}
                <label className="pc-editor-field">
                  <span>{editor.kind === 'order' ? (orderIsStop ? 'Gatilho' : 'Preço') : 'Preço'}</span>
                  <input
                    className="pc-input pc-editor-input"
                    type="number"
                    step="0.00001"
                    autoFocus
                    value={editor.value}
                    onChange={(e) => setEditor((s) => ({ ...s, value: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmEditor();
                      if (e.key === 'Escape') setEditor(null);
                    }}
                    aria-label={editorLabel}
                  />
                </label>
                <div className="pc-editor-actions">
                  <button className="pc-send" onClick={confirmEditor}>Salvar</button>
                  <button className="pc-editor-cancel" onClick={() => setEditor(null)}>Cancelar</button>
                </div>
              </div>
            </>
          )}
          {!loading && (error || bars.length === 0) && (
            <div className="pc-empty">
              {error || 'Sem dados de gráfico.'}
              <small>Atualize o bridge (2.1.3+) para liberar o endpoint /history.</small>
            </div>
          )}
          {loading && bars.length === 0 && <div className="pc-empty">Carregando candles…</div>}
        </div>

        {draft && (
          <div className="pc-orderbar">
            <span className="pc-orderprice">Limit @ <b>{fmtPrice(draft.price, precision)}</b></span>
            <select className="pc-input" value={orderSide} onChange={(e) => setOrderSide(e.target.value)} aria-label="Lado da ordem">
              <option value="buy">Compra</option>
              <option value="sell">Venda</option>
            </select>
            <input className="pc-input pc-qty" type="number" min="0" step="1" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} aria-label="Quantidade" />
            <input className="pc-input pc-bracket" type="number" step="0.00001" placeholder="SL (OCO)" value={orderSl} onChange={(e) => setOrderSl(e.target.value)} aria-label="Stop loss da ordem (OCO)" />
            <input className="pc-input pc-bracket" type="number" step="0.00001" placeholder="TP (OCO)" value={orderTp} onChange={(e) => setOrderTp(e.target.value)} aria-label="Take profit da ordem (OCO)" />
            <span className="pc-oco">OCO</span>
            <button className="pc-send" onClick={sendDraft} disabled={sending || !online}>
              <Send size={13} /> Enviar
            </button>
            <button className="pc-x" onClick={() => setDraft(null)} aria-label="Cancelar ordem"><X size={15} /></button>
          </div>
        )}
      </div>
      <style>{PC_CSS}</style>
    </div>
  );
}

const PC_CSS = `
.pc-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0,0,0,0.66); backdrop-filter: blur(3px); }
.pc-panel { width: min(1040px, 100%); height: min(88vh, 760px); display: flex; flex-direction: column; background: #0f131b; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; overflow: hidden; box-shadow: 0 24px 70px rgba(0,0,0,0.55); }
.pc-head { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.pc-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 13px; min-width: 0; }
.pc-title b { font-size: 15px; letter-spacing: 0.3px; }
.pc-side { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; border: 1px solid currentColor; }
.pc-order-badge { color: #e1b12c; border-color: rgba(225,177,44,0.55); }
.pc-long { color: #2ecc71; }
.pc-short { color: #ff6b5b; }
.pc-muted { color: var(--muted, #a1a7b3); font-size: 12px; font-variant-numeric: tabular-nums; }
.pc-pnl { font-weight: 700; font-variant-numeric: tabular-nums; }
.pc-head-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.pc-live { font-size: 9px; font-weight: 800; letter-spacing: 0.5px; padding: 2px 7px; border-radius: 999px; background: rgba(46,204,113,0.12); color: #2ecc71; border: 1px solid rgba(46,204,113,0.4); }
.pc-x { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: var(--text, #e7eaf0); cursor: pointer; }
.pc-x:hover { filter: brightness(1.15); }
.pc-toolbar { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap; }
.pc-period { padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); font-size: 11px; font-weight: 700; cursor: pointer; }
.pc-period.on { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; }
.pc-add { font-weight: 800; }
.pc-add-sl { color: #ff8b84; border-color: rgba(231,76,60,0.45); }
.pc-add-tp { color: #7bed9f; border-color: rgba(46,204,113,0.45); }
.pc-levels { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--text, #e7eaf0); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pc-hint { margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; color: var(--muted, #a1a7b3); font-size: 10px; }
.pc-chart { position: relative; flex: 1; min-height: 240px; }
.pc-lines { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 3; }
.pc-guide { position: absolute; left: 0; height: 1px; margin-top: 0; display: flex; align-items: center; }
.pc-guide-current { background: rgba(120,190,255,0.75); }
.pc-guide-entry { background: rgba(180,180,180,0.6); border-top: 1px dashed rgba(180,180,180,0.8); }
.pc-guide-tag { position: absolute; right: 4px; transform: translateY(-14px); font-size: 9px; color: #cfe6ff; background: rgba(15,19,27,0.85); padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); white-space: nowrap; }
.pc-guide-entry .pc-guide-tag { color: var(--muted, #a1a7b3); }
.pc-level { position: absolute; left: 0; height: 18px; margin-top: -9px; display: flex; align-items: center; pointer-events: auto; cursor: ns-resize; touch-action: none; }
.pc-level::before { content: ''; position: absolute; left: 0; right: 0; height: 1px; }
.pc-level-sl::before { background: rgba(255,90,100,0.95); box-shadow: 0 0 8px rgba(231,76,60,0.5); }
.pc-level-tp::before { background: rgba(80,220,140,0.95); box-shadow: 0 0 8px rgba(46,204,113,0.5); }
.pc-level-order::before { background: rgba(240,190,60,0.95); box-shadow: 0 0 8px rgba(225,177,44,0.5); }
.pc-level-tag { position: absolute; right: 4px; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pc-level-sl .pc-level-tag { color: #ffd7d4; background: rgba(231,76,60,0.22); border: 1px solid rgba(231,76,60,0.6); }
.pc-level-tp .pc-level-tag { color: #c9ffdf; background: rgba(46,204,113,0.18); border: 1px solid rgba(46,204,113,0.6); }
.pc-level-order .pc-level-tag { color: #fff3c4; background: rgba(225,177,44,0.2); border: 1px solid rgba(225,177,44,0.6); }
.pc-level-new { opacity: 0.9; }
.pc-level-new .pc-level-tag { border-style: dashed; animation: pc-pulse 1.4s ease-in-out infinite; }
@keyframes pc-pulse { 0%,100% { opacity: 0.65; } 50% { opacity: 1; } }
.pc-empty { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 24px; color: var(--muted, #a1a7b3); font-size: 12px; pointer-events: none; background: rgba(15,19,27,0.72); }
.pc-empty small { font-size: 10px; opacity: 0.8; }
.pc-orderbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(124,92,255,0.06); }
.pc-orderprice { font-size: 12px; color: var(--muted, #a1a7b3); }
.pc-orderprice b { color: var(--text, #e7eaf0); font-variant-numeric: tabular-nums; }
.pc-input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: var(--text, #e7eaf0); font-size: 12px; padding: 7px 8px; min-height: 34px; font-family: inherit; }
.pc-qty { width: 82px; }
.pc-bracket { width: 104px; }
.pc-oco { font-size: 9px; font-weight: 800; letter-spacing: 0.4px; color: #e1b12c; border: 1px solid rgba(225,177,44,0.5); border-radius: 999px; padding: 2px 6px; }
.pc-send { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 6px 12px; border-radius: 8px; border: 0; background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
.pc-send:disabled { opacity: 0.5; cursor: not-allowed; }
.pc-edit-backdrop { position: absolute; inset: 0; z-index: 8; background: rgba(0,0,0,0.22); }
.pc-editor { position: absolute; left: 50%; transform: translate(-50%, -50%); z-index: 9; width: min(300px, 92%); display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; background: #161b25; border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 14px 34px rgba(0,0,0,0.55); }
.pc-editor-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.pc-editor-x { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); cursor: pointer; }
.pc-editor-field { display: flex; flex-direction: column; gap: 4px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: var(--muted, #a1a7b3); }
.pc-editor-input { width: 100%; font-size: 15px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
.pc-editor-actions { display: flex; justify-content: flex-end; gap: 6px; }
.pc-editor-cancel { min-height: 34px; padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); font-size: 12px; font-weight: 600; cursor: pointer; }
@media (max-width: 640px) {
  .pc-backdrop { padding: 0; }
  .pc-panel { width: 100%; height: 100%; border-radius: 0; }
  .pc-hint { display: none; }
}
`;
