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
  // Sessão de 24h inteiras (0→24): `sessionContains` a trata como sempre aberta, mas
  // mod24(24) = 0 fazia a faixa SUMIR. Aqui ela ocupa o eixo todo.
  if (def.endH - def.startH >= 24) return [{ start: 0, end: 24 }];
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

/** Hora fracionária (0–24) → "HH:MM". Nunca devolve "24:00" (arredonda e dá a volta). */
export function fmtHM(h: number): string {
  const total = Math.round(mod24(h) * 60) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}