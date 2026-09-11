// Firms — registro em meta (cadastro de empresas). Sem fórmula financeira.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import { listFirms, saveFirm, deleteFirm, firmColorById, DEFAULT_FIRM_COLOR } from '../firms';

function makeDs() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const ds = new DataService({ adapter, deviceId: 'dev-firms', bus: new EventBus(), channel: null });
  return ds;
}

describe('firms — registro', () => {
  it('começa vazio e salva/ordena por nome', async () => {
    const ds = makeDs();
    expect(await listFirms(ds)).toEqual([]);
    await saveFirm(ds, { name: 'FTMO', type: 'Futures', color: '#22c55e' });
    await saveFirm(ds, { name: 'Alpha', type: 'Forex' });
    const list = await listFirms(ds);
    expect(list.map((f) => f.name)).toEqual(['Alpha', 'FTMO']);
    expect(list.find((f) => f.name === 'Alpha').color).toBe(DEFAULT_FIRM_COLOR);
  });

  it('id derivado do nome é estável; editar não duplica', async () => {
    const ds = makeDs();
    const [a] = await saveFirm(ds, { name: 'E8 Markets' });
    expect(a.id).toContain('e8-markets');
    await saveFirm(ds, { id: a.id, name: 'E8 Markets', color: '#e74c3c', type: 'Futures' });
    const list = await listFirms(ds);
    expect(list).toHaveLength(1);
    expect(list[0].color).toBe('#e74c3c');
  });

  it('deleteFirm remove e firmColorById mapeia id->cor', async () => {
    const ds = makeDs();
    const [a] = await saveFirm(ds, { name: 'A', color: '#111111' });
    await saveFirm(ds, { name: 'B', color: '#222222' });
    expect(firmColorById(await listFirms(ds))).toMatchObject({ [a.id]: '#111111' });
    await deleteFirm(ds, a.id);
    const list = await listFirms(ds);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('B');
  });

  it('ignora nome vazio', async () => {
    const ds = makeDs();
    expect(await saveFirm(ds, { name: '   ' })).toEqual([]);
  });

  it('persiste ícone (emoji) da firm', async () => {
    const ds = makeDs();
    await saveFirm(ds, { name: 'FTMO', icon: '🏦' });
    const list = await listFirms(ds);
    expect(list[0].icon).toBe('🏦');
  });
});
