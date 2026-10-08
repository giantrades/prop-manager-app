// WidgetGrid — grade de 2 colunas com reordenar (arrastar OU ↑/↓), largura (1x/2x),
// mostrar/ocultar por widget e "restaurar padrão". Persiste em localStorage e, se
// `layout`/`onLayoutChange` forem passados, o layout é CONTROLADO (ex.: meta
// `ui:widgets:gastos`, que sincroniza entre dispositivos). Aceita `items`
// ({id,node,defaultSpan}) OU `children` (cada filho precisa de `key`; largura via
// prop data-span={2}). Sem lógica financeira.
import React, { useCallback, useEffect, useMemo, useState } from 'react';

export interface WidgetItem {
  id: string;
  node: React.ReactNode;
  defaultSpan?: number;
  /** Rótulo amigável (chips de "ocultos"); default = id. */
  label?: string;
}

export interface WidgetLayout {
  order: string[];
  spans: Record<string, number>;
  hidden?: Record<string, boolean>;
}

export interface WidgetGridProps {
  storageKey: string;
  items?: WidgetItem[] | null;
  children?: React.ReactNode;
  columns?: number;
  /** Layout controlado (ex.: vindo do meta). Quando presente, sobrepõe o localStorage. */
  layout?: WidgetLayout | null;
  /** Chamado a cada mudança (reordenar/largura/ocultar/restaurar). */
  onLayoutChange?: (layout: WidgetLayout) => void;
  /** Rótulo do botão restaurar (default: "Restaurar padrão"). */
  restoreLabel?: string;
}

function storageOf(storageKey: string): string {
  return `widgetLayout:${storageKey}`;
}

/** Mescla um layout salvo com a lista atual de ids (append dos novos, drop dos antigos). */
function normalize(raw: unknown, ids: string[]): WidgetLayout {
  if (typeof raw !== 'object' || raw === null || !('order' in raw)) {
    return { order: ids, spans: {}, hidden: {} };
  }
  const maybe = raw as { order: unknown; spans?: unknown; hidden?: unknown };
  const order: string[] = Array.isArray(maybe.order)
    ? (maybe.order as unknown[]).filter((id): id is string => typeof id === 'string').filter((id) => ids.includes(id))
    : [];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  const spans: Record<string, number> =
    maybe.spans != null && typeof maybe.spans === 'object' ? (maybe.spans as Record<string, number>) : {};
  const hidden: Record<string, boolean> =
    maybe.hidden != null && typeof maybe.hidden === 'object' ? (maybe.hidden as Record<string, boolean>) : {};
  return { order, spans, hidden };
}

function loadLayout(storageKey: string, ids: string[]): WidgetLayout {
  try {
    return normalize(JSON.parse(localStorage.getItem(storageOf(storageKey)) || 'null'), ids);
  } catch {
    return normalize(null, ids);
  }
}

function readDefaultSpan(child: React.ReactNode): number {
  if (React.isValidElement<{ 'data-span'?: unknown }>(child)) {
    const raw = child.props['data-span'];
    return Number(raw) === 2 ? 2 : 1;
  }
  return 1;
}

function readLabel(child: React.ReactNode): string | undefined {
  if (React.isValidElement<{ 'data-label'?: unknown }>(child)) {
    const raw = child.props['data-label'];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return undefined;
}

export default function WidgetGrid({
  storageKey, items = null, children = null, columns = 2,
  layout: layoutProp = null, onLayoutChange = null, restoreLabel = 'Restaurar padrão',
}: WidgetGridProps) {
  const list: WidgetItem[] = useMemo(() => {
    if (items) return items;
    return React.Children.toArray(children).map((child): WidgetItem => ({
      id: String(React.isValidElement(child) ? child.key ?? '' : '').replace(/^\.\$/, '') || `w-${Math.random().toString(36).slice(2, 5)}`,
      node: child,
      defaultSpan: readDefaultSpan(child),
      label: readLabel(child),
    }));
  }, [items, children]);

  const ids: string[] = list.map((i) => i.id);
  const idsKey: string = ids.join('|');
  const [layout, setLayout] = useState<WidgetLayout>(() => (layoutProp ? normalize(layoutProp, ids) : loadLayout(storageKey, ids)));
  const [dragId, setDragId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // Layout controlado (meta) tem prioridade; senão relê o localStorage quando os ids mudam.
  useEffect(() => {
    const nextIds = idsKey ? idsKey.split('|') : [];
    if (layoutProp) setLayout(normalize(layoutProp, nextIds));
    else setLayout(loadLayout(storageKey, nextIds));
  }, [storageKey, idsKey, layoutProp]);

  const persist = useCallback((next: WidgetLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(storageOf(storageKey), JSON.stringify(next));
    } catch {
      /* noop */
    }
    onLayoutChange?.(next);
  }, [storageKey, onLayoutChange]);

  const spanOf = (it: WidgetItem): number => layout.spans[it.id] ?? it.defaultSpan ?? 1;
  const isHidden = (id: string): boolean => layout.hidden?.[id] === true;
  const toggleSpan = (id: string, span: number): void => persist({ ...layout, spans: { ...layout.spans, [id]: span === 2 ? 1 : 2 } });
  const toggleHidden = (id: string): void => {
    const hidden = { ...(layout.hidden ?? {}) };
    if (hidden[id]) delete hidden[id];
    else hidden[id] = true;
    persist({ ...layout, hidden });
  };
  const move = (id: string, delta: number): void => {
    const order = layout.order.filter((x) => x !== id);
    const at = layout.order.indexOf(id);
    const to = Math.max(0, Math.min(order.length, at + delta));
    order.splice(to, 0, id);
    persist({ ...layout, order });
  };
  const restore = (): void => persist({ order: ids, spans: {}, hidden: {} });

  const onDrop = (targetId: string): void => {
    if (!dragId || dragId === targetId) return;
    const order: string[] = layout.order.filter((id) => id !== dragId);
    order.splice(order.indexOf(targetId), 0, dragId);
    persist({ ...layout, order });
    setDragId(null);
  };

  const byId = new Map<string, WidgetItem>(list.map((i): [string, WidgetItem] => [i.id, i]));
  const ordered: WidgetItem[] = layout.order.map((id) => byId.get(id)).filter((it): it is WidgetItem => it !== undefined);
  const visible = ordered.filter((it) => !isHidden(it.id));
  const hiddenItems = ordered.filter((it) => isHidden(it.id));
  const orderIndex = new Map(ordered.map((it, i) => [it.id, i]));

  return (
    <div className="wg-root">
      <div className="wg-bar no-print">
        {hiddenItems.length > 0 && (
          <button type="button" className="wg-bar-btn" aria-expanded={showHidden} onClick={() => setShowHidden((s) => !s)}>
            {showHidden ? 'Fechar ocultos' : `Mostrar ocultos (${hiddenItems.length})`}
          </button>
        )}
        <span className="wg-bar-spacer" />
        <button type="button" className="wg-bar-btn" onClick={restore}>{restoreLabel}</button>
      </div>

      {showHidden && hiddenItems.length > 0 && (
        <div className="wg-hidden-list no-print" role="group" aria-label="Widgets ocultos">
          {hiddenItems.map((it) => (
            <button key={it.id} type="button" className="wg-hidden-chip" onClick={() => toggleHidden(it.id)}>
              + {it.label ?? it.id}
            </button>
          ))}
        </div>
      )}

      <div className="wg" style={{ ['--wg-cols']: columns } as React.CSSProperties}>
        {visible.map((it) => {
          const span = spanOf(it);
          const idx = orderIndex.get(it.id) ?? 0;
          return (
            <div
              key={it.id}
              className={`wg-item${span === 2 ? ' wg-span2' : ''}${dragId === it.id ? ' wg-dragging' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(it.id)}
            >
              <div className="wg-tools no-print">
                <button type="button" className="wg-handle" draggable onDragStart={() => setDragId(it.id)} onDragEnd={() => setDragId(null)} title="Arraste para reordenar" aria-label={`Reordenar ${it.id}`}>⠿</button>
                <button type="button" className="wg-size" onClick={() => move(it.id, -1)} disabled={idx === 0} title="Mover para cima" aria-label={`Mover ${it.id} para cima`}>↑</button>
                <button type="button" className="wg-size" onClick={() => move(it.id, 1)} disabled={idx === ordered.length - 1} title="Mover para baixo" aria-label={`Mover ${it.id} para baixo`}>↓</button>
                <button type="button" className="wg-size" onClick={() => toggleSpan(it.id, span)} title="Alternar largura" aria-label={`Alternar largura de ${it.id}`}>{span === 2 ? '1x' : '2x'}</button>
                <button type="button" className="wg-size" onClick={() => toggleHidden(it.id)} title="Ocultar widget" aria-label={`Ocultar ${it.id}`}>–</button>
              </div>
              <div className="wg-body">{it.node}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WG_CSS = `
.wg-root { display: flex; flex-direction: column; gap: 8px; }
.wg-bar { display: flex; align-items: center; gap: 8px; min-height: 28px; }
.wg-bar-spacer { flex: 1; }
.wg-bar-btn { background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 9px; color: var(--muted, #a1a7b3); font-size: 11px; font-weight: 700; padding: 5px 10px; cursor: pointer; }
.wg-bar-btn:hover { background: rgba(255,255,255,0.05); color: var(--text, #e7eaf0); }
.wg-hidden-list { display: flex; flex-wrap: wrap; gap: 6px; }
.wg-hidden-chip { background: rgba(124,92,255,0.1); border: 1px solid rgba(124,92,255,0.3); color: var(--brand, #7c5cff); border-radius: 999px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
.wg { display: grid; grid-template-columns: repeat(var(--wg-cols, 2), minmax(0, 1fr)); gap: 14px; align-items: stretch; }
.wg-item { position: relative; display: flex; min-width: 0; }
.wg-body { flex: 1; min-width: 0; display: flex; }
.wg-body > * { flex: 1; min-width: 0; }
.wg-span2 { grid-column: 1 / -1; }
.wg-dragging { opacity: 0.5; }
.wg-tools { position: absolute; bottom: 8px; right: 8px; z-index: 3; display: flex; gap: 4px; opacity: 0; transition: opacity 120ms ease; }
.wg-item:hover .wg-tools, .wg-item:focus-within .wg-tools { opacity: 1; }
.wg-handle, .wg-size { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; background: rgba(15,18,24,0.75); border: 1px solid rgba(255,255,255,0.14); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; }
.wg-handle { cursor: grab; }
.wg-handle:active { cursor: grabbing; }
.wg-size { font-size: 11px; font-weight: 800; }
.wg-size:disabled { opacity: 0.35; cursor: not-allowed; }
@media (max-width: 900px) {
  .wg { grid-template-columns: 1fr; }
  .wg-span2 { grid-column: auto; }
  /* No mobile não há hover: ferramentas sempre visíveis (permite reordenar por ↑/↓). */
  .wg-tools { opacity: 0.9; }
  .wg-handle { display: none; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('wg-styles')) {
  const style = document.createElement('style');
  style.id = 'wg-styles';
  style.textContent = WG_CSS;
  document.head.appendChild(style);
}
