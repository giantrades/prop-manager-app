// MARKET — layout de treemap "squarified" (Bruls, Huizing & van Wijk), puro.
// Usado pelo heatmap para posicionar setores (nível 1) e nomes (nível 2).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapCell<T> extends Rect {
  item: T;
}

function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((a, b) => a + b, 0);
  if (sum <= 0 || side <= 0) return Infinity;
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  const s2 = sum * sum;
  const side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/**
 * Distribui `items` em `bounds` respeitando `valueOf` (proporcional à área).
 * Ordena por valor desc e cresce linhas ao longo do lado curto.
 */
export function squarify<T>(items: T[], valueOf: (t: T) => number, bounds: Rect): TreemapCell<T>[] {
  const total = items.reduce((s, i) => s + Math.max(0, valueOf(i)), 0);
  if (!(total > 0) || bounds.w <= 0 || bounds.h <= 0) return [];
  const scale = (bounds.w * bounds.h) / total;
  const entries = items
    .map((item) => ({ item, area: Math.max(0, valueOf(item)) * scale }))
    .filter((e) => e.area > 0)
    .sort((a, b) => b.area - a.area);

  const out: TreemapCell<T>[] = [];
  let { x, y, w, h } = bounds;
  let i = 0;
  while (i < entries.length && w > 0.5 && h > 0.5) {
    const side = Math.min(w, h);
    const row: typeof entries = [];
    const rowAreas: number[] = [];
    let best = Infinity;
    let j = i;
    while (j < entries.length) {
      const cand = [...rowAreas, entries[j].area];
      const ratio = worstRatio(cand, side);
      if (row.length === 0 || ratio <= best) {
        best = ratio;
        rowAreas.push(entries[j].area);
        row.push(entries[j]);
        j += 1;
      } else {
        break;
      }
    }
    const rowSum = rowAreas.reduce((a, b) => a + b, 0);
    if (rowSum <= 0) break;
    if (w >= h) {
      const colW = rowSum / h;
      let cy = y;
      for (let k = 0; k < row.length; k += 1) {
        const cellH = (rowAreas[k] / rowSum) * h;
        out.push({ item: row[k].item, x, y: cy, w: colW, h: cellH });
        cy += cellH;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = rowSum / w;
      let cx = x;
      for (let k = 0; k < row.length; k += 1) {
        const cellW = (rowAreas[k] / rowSum) * w;
        out.push({ item: row[k].item, x: cx, y, w: cellW, h: rowH });
        cx += cellW;
      }
      y += rowH;
      h -= rowH;
    }
    i = j;
  }
  return out;
}
