import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import {
  DEFAULT_CHECKLIST,
  getChecklistTemplate,
  saveChecklistTemplate,
  getDayCheck,
  setDayCheck,
  isDayComplete,
  getDiaryEntry,
  saveDiaryEntry,
  checklistDayKey,
} from '../checklist';

function makeDs() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  return new DataService({ adapter, deviceId: 'dev-check', bus, channel: null });
}

describe('Fase 12 — checklist pré-trade + diário emocional', () => {
  let ds: DataService;
  beforeEach(() => {
    ds = makeDs();
  });

  it('template default quando nunca salvo; salva e lê de volta', async () => {
    expect(await getChecklistTemplate(ds)).toEqual(DEFAULT_CHECKLIST);
    await saveChecklistTemplate(ds, ['A', 'B']);
    expect(await getChecklistTemplate(ds)).toEqual(['A', 'B']);
  });

  it('dia incompleto até marcar tudo; completo quando todos marcados', async () => {
    await saveChecklistTemplate(ds, ['A', 'B', 'C']);
    expect(await isDayComplete(ds, '2026-03-10T10:00:00Z')).toBe(false);
    await setDayCheck(ds, 0, true, '2026-03-10T10:00:00Z');
    await setDayCheck(ds, 1, true, '2026-03-10T10:00:00Z');
    expect(await isDayComplete(ds, '2026-03-10T10:00:00Z')).toBe(false);
    await setDayCheck(ds, 2, true, '2026-03-10T10:00:00Z');
    expect(await isDayComplete(ds, '2026-03-10T10:00:00Z')).toBe(true);
    // outro dia continua incompleto (chave por dia)
    expect(await isDayComplete(ds, '2026-03-11T10:00:00Z')).toBe(false);
    expect(checklistDayKey('2026-03-10T10:00:00Z')).toBe('checklist:2026-03-10');
  });

  it('desmarcar volta a incompleto', async () => {
    await saveChecklistTemplate(ds, ['A']);
    await setDayCheck(ds, 0, true, '2026-03-10T10:00:00Z');
    expect(await isDayComplete(ds, '2026-03-10T10:00:00Z')).toBe(true);
    await setDayCheck(ds, 0, false, '2026-03-10T10:00:00Z');
    expect(await isDayComplete(ds, '2026-03-10T10:00:00Z')).toBe(false);
    expect(await getDayCheck(ds, '2026-03-10T10:00:00Z')).toEqual({ '0': false });
  });

  it('diário: null quando vazio; salva com clamp 1..5 e lê de volta', async () => {
    expect(await getDiaryEntry(ds, '2026-03-10T10:00:00Z')).toBeNull();
    await saveDiaryEntry(ds, { sleep: 9, mood: 0, fomo: true, note: 'operei news' }, '2026-03-10T10:00:00Z');
    expect(await getDiaryEntry(ds, '2026-03-10T10:00:00Z')).toEqual({
      sleep: 5,
      mood: 1,
      fomo: true,
      note: 'operei news',
    });
  });
});
