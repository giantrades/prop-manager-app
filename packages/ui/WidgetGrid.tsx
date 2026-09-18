// WidgetGrid — grade de 2 colunas com reordenar (arrastar) e largura (1x/2x),
// persistido por página. Aceita `items` ({id,node,defaultSpan}) OU `children` (cada
// filho precisa de `key`; largura via prop data-span={2}). Sem lógica financeira.
import React, { useCallback, useEffect, useMemo, useState } from 'react';

export interface WidgetItem {
  id: string;
  node: React.ReactNode;
  defaultSpan?: number;
}

export interface WidgetLayout {
  order: string[];
  spans: Record<string, number>;
}

export interface WidgetGridProps {
  storageKey: string;
  items?: WidgetItem[] | null;
  children?: React.ReactNode;
  columns?: number;
}

function loadLayout(storageKey: string, ids: string[]): WidgetLayout {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(`widgetLayout:${storageKey}`) || 'null');
    if (typeof raw === 'object' && raw !== null && 'order' in raw) {
      const maybe = raw as { order: unknown; spans?: unknown };
      if (Array.isArray(maybe.order)) {
        const order: string[] = (maybe.order as unknown[])
          .filter((id): id is string => typeof id === 'string')
          .filter((id) => ids.includes(id));
        for (const id of ids) if (!order.includes(id)) order.push(id);
        const spans: Record<string, number> =
          maybe.spans != null && typeof maybe.spans === 'object' ? (maybe.spans as Record<string, number>) : {};
        return { order, spans };
      }
    }
  } catch {
    /* noop */
  }
  return { order: ids, spans: {} };
}

function readDefaultSpan(child: React.ReactNode): number {
  if (React.isValidElement<{ 'data-span'?: unknown }>(child)) {
    const raw = child.props['data-span'];
    return Number(raw) === 2 ? 2 : 1;
  }
  return 1;
}

export default function WidgetGrid({ storageKey, items = null, children = null, columns = 2 }: WidgetGridProps) {
  const list: WidgetItem[] = useMemo(() => {
    if (items) return items;
    return React.Children.toArray(children).map((child): WidgetItem => ({
      id: String(React.isValidElement(child) ? child.key ?? '' : '').replace(/^\.\$/, '') || `w-${Math.random().toString(36).slice(2, 5)}`,
      node: child,
      defaultSpan: readDefaultSpan(child),
    }));
  }, [items, children]);

  const ids: string[] = list.map((i) => i.id);
  const idsKey: string = ids.join('|');
  const [layout, setLayout] = useState<WidgetLayout>(() => loadLayout(storageKey, ids));
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => setLayout(loadLayout(storageKey, idsKey.split('|'))), [storageKey, idsKey]);

  const persist = useCallback((next: WidgetLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(`widgetLayout:${storageKey}`, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }, [storageKey]);

  const spanOf = (it: WidgetItem): number => layout.spans[it.id] ?? it.defaultSpan ?? 1;
  const toggleSpan = (id: string, span: number): void => persist({ ...layout, spans: { ...layout.spans, [id]: span === 2 ? 1 : 2 } });

  const onDrop = (targetId: string): void => {
    if (!dragId || dragId === targetId) return;
    const order: string[] = layout.order.filter((id) => id !== dragId);
    order.splice(order.indexOf(targetId), 0, dragId);
    persist({ ...layout, order });
    setDragId(null);
  };

  const byId = new Map<string, WidgetItem>(list.map((i): [string, WidgetItem] => [i.id, i]));
  const ordered: WidgetItem[] = layout.order.map((id) => byId.get(id)).filter((it): it is WidgetItem => it !== undefined);

  return (
    <div className="wg" style={{ ['--wg-cols']: columns } as React.CSSProperties}>
      {ordered.map((it) => {
        const span = spanOf(it);
        return (
          <div
            key={it.id}
            className={`wg-item${span === 2 ? ' wg-span2' : ''}${dragId === it.id ? ' wg-dragging' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(it.id)}
          >
            <div className="wg-tools no-print">
              <button type="button" className="wg-handle" draggable onDragStart={() => setDragId(it.id)} onDragEnd={() => setDragId(null)} title="Arraste para reordenar" aria-label="Reordenar">⠿</button>
              <button type="button" className="wg-size" onClick={() => toggleSpan(it.id, span)} title="Alternar largura" aria-label="Alternar largura">{span === 2 ? '1x' : '2x'}</button>
            </div>
            <div className="wg-body">{it.node}</div>
          </div>
        );
      })}
    </div>
  );
}

const WG_CSS = `
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
@media (max-width: 900px) { .wg { grid-template-columns: 1fr; } .wg-span2 { grid-column: auto; } .wg-tools { display: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('wg-styles')) {
  const style = document.createElement('style');
  style.id = 'wg-styles';
  style.textContent = WG_CSS;
  document.head.appendChild(style);
}
