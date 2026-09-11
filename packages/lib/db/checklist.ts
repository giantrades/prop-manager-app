// STAGE 8/12 — checklist pré-trade (bloqueante) + chaves do diário emocional.
// Não é lógica financeira: guarda template e marcações do dia no store `meta`.
// O bloqueio acontece no container (JournalPage só submete com o dia completo).

import type { DataService } from './DataService';
import { nowIso } from './dateUtils';

export const CHECKLIST_TEMPLATE_KEY = 'checklist:template';

export const DEFAULT_CHECKLIST: string[] = [
  'Risco por trade definido (stop em todo trade)',
  'Máximo de trades do dia definido',
  'Limite de loss do dia definido',
  'Sem operar 30min antes/depois de evento high impact',
  'Setup do dia escolhido (só operar o plano)',
  'Sono e humor ok (sem tilt)',
];

export function dayKey(date = nowIso()): string {
  return date.slice(0, 10);
}

export function checklistDayKey(date = nowIso()): string {
  return `checklist:${dayKey(date)}`;
}

export function diaryDayKey(date = nowIso()): string {
  return `diary:${dayKey(date)}`;
}

/** Template atual (ou o default se nunca salvo). */
export async function getChecklistTemplate(ds: DataService): Promise<string[]> {
  const rec = await ds.meta.getKey(CHECKLIST_TEMPLATE_KEY);
  if (Array.isArray(rec?.value) && (rec.value as unknown[]).length > 0) {
    return (rec.value as unknown[]).map(String);
  }
  return [...DEFAULT_CHECKLIST];
}

export async function saveChecklistTemplate(ds: DataService, items: string[]): Promise<void> {
  await ds.meta.setKey(CHECKLIST_TEMPLATE_KEY, items.filter((s) => s.trim()));
}

/** Marcações do dia: `Record<index, boolean>`. */
export async function getDayCheck(ds: DataService, date = nowIso()): Promise<Record<string, boolean>> {
  const rec = await ds.meta.getKey(checklistDayKey(date));
  const v = rec?.value;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, boolean>;
  }
  return {};
}

export async function setDayCheck(
  ds: DataService,
  index: number,
  done: boolean,
  date = nowIso(),
): Promise<Record<string, boolean>> {
  const cur = await getDayCheck(ds, date);
  const next = { ...cur, [String(index)]: done };
  await ds.meta.setKey(checklistDayKey(date), next);
  return next;
}

/** Dia completo = todos os itens do template marcados. */
export async function isDayComplete(ds: DataService, date = nowIso()): Promise<boolean> {
  const template = await getChecklistTemplate(ds);
  if (template.length === 0) return true;
  const cur = await getDayCheck(ds, date);
  return template.every((_, i) => cur[String(i)] === true);
}

// ---------------------------------------------------------------------------
// Diário emocional: { sleep 1..5, mood 1..5, fomo bool, note }
// ---------------------------------------------------------------------------

export interface DiaryEntry {
  sleep: number; // 1..5
  mood: number; // 1..5
  fomo: boolean;
  note?: string;
}

export async function getDiaryEntry(ds: DataService, date = nowIso()): Promise<DiaryEntry | null> {
  const rec = await ds.meta.getKey(diaryDayKey(date));
  const v = rec?.value as DiaryEntry | undefined;
  if (v && typeof v.sleep === 'number' && typeof v.mood === 'number') return v;
  return null;
}

export async function saveDiaryEntry(ds: DataService, entry: DiaryEntry, date = nowIso()): Promise<void> {
  const clean: DiaryEntry = {
    sleep: Math.min(5, Math.max(1, Math.round(entry.sleep))),
    mood: Math.min(5, Math.max(1, Math.round(entry.mood))),
    fomo: !!entry.fomo,
    note: entry.note?.slice(0, 500),
  };
  await ds.meta.setKey(diaryDayKey(date), clean);
}
