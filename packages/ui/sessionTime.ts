// Util de posicionamento no eixo 0–24h das sessões de mercado (apresentação pura).
import type { SessionDef } from '@apps/lib/db';

export function mod24(h: number): number {
  return ((h % 24) + 24) % 24;
}

/** Segmentos (0–24) de uma sessão deslocada `delta` horas; quebra na virada de meia-noite. */
export function sessionDisplaySegments(
  def: SessionDef,
  delta: number,
): Array<{ start: number; end: number }> {
  const dur = mod24(def.endH - def.startH);
  if (dur === 0) return [];
  const s = mod24(def.startH + delta);
  const end = s + dur;
  if (end <= 24) return [{ start: s, end }];
  return [
    { start: s, end: 24 },
    { start: 0, end: end - 24 },
  ];
}

export function pct(h: number): string {
  return `${(h / 24) * 100}%`;
}
