// Reconciliação de posições ao vivo por conexão. Cada conexão conecta em um tempo e a
// plataforma pode demorar a carregar; o mapa só fecha o que a conexão deixou de reportar.
import { describe, it, expect } from 'vitest';
import { createReconcileState, reconcilePositions, posKey } from '../positionReconcile';

const p = (id: string, conn: string) => ({ platformPositionId: id, connectionId: conn, symbol: 'XAUUSD' });
const ids = (list: Array<{ platformPositionId?: string }>) => list.map(posKey).sort();

describe('positionReconcile', () => {
  it('conexão conectada e madura: o que não veio, fechou', () => {
    const st = createReconcileState();
    let now = 1000;
    let out = reconcilePositions(st, { reported: [p('a', 'c1'), p('b', 'c1')], connectedIds: ['c1'], now });
    expect(ids(out)).toEqual(['a', 'b']);
    now += 20000; // passou o grace
    out = reconcilePositions(st, { reported: [p('a', 'c1')], connectedIds: ['c1'], now });
    expect(ids(out)).toEqual(['a']); // b fechou
  });

  it('conexão recém-conectada não fecha posições antigas', () => {
    const st = createReconcileState([p('a', 'c1')]);
    const out = reconcilePositions(st, { reported: [], connectedIds: ['c1'], now: 1000 });
    expect(ids(out)).toEqual(['a']); // dentro do grace: mantém
  });

  it('conexão madura reportando vazio: só fecha após a confirmação', () => {
    const st = createReconcileState([p('a', 'c1')]);
    st.connectedSince.set('c1', 0);
    let now = 20000;
    let out = reconcilePositions(st, { reported: [], connectedIds: ['c1'], now, clearConfirmMs: 8000 });
    expect(ids(out)).toEqual(['a']); // aguardando
    now += 4000;
    out = reconcilePositions(st, { reported: [], connectedIds: ['c1'], now, clearConfirmMs: 8000 });
    expect(ids(out)).toEqual(['a']);
    now += 5000; // 9000 >= 8000
    out = reconcilePositions(st, { reported: [], connectedIds: ['c1'], now, clearConfirmMs: 8000 });
    expect(out).toEqual([]);
  });

  it('posição que reaparece cancela a confirmação de vazio', () => {
    const st = createReconcileState([p('a', 'c1')]);
    st.connectedSince.set('c1', 0);
    reconcilePositions(st, { reported: [], connectedIds: ['c1'], now: 20000, clearConfirmMs: 8000 });
    expect(st.pendingClear.has('c1')).toBe(true);
    const out = reconcilePositions(st, { reported: [p('a', 'c1')], connectedIds: ['c1'], now: 21000 });
    expect(ids(out)).toEqual(['a']);
    expect(st.pendingClear.has('c1')).toBe(false);
  });

  it('conexão desconectada/desconhecida nunca fecha', () => {
    const st = createReconcileState([p('a', 'c1')]);
    const out = reconcilePositions(st, { reported: [], connectedIds: [], now: 999999 });
    expect(ids(out)).toEqual(['a']);
  });

  it('posição sem connectionId nunca fecha', () => {
    const st = createReconcileState([p('a', '')]);
    const out = reconcilePositions(st, { reported: [], connectedIds: ['c1'], now: 999999 });
    expect(ids(out)).toEqual(['a']);
  });

  it('posição nova numa conexão conectada aparece na hora', () => {
    const st = createReconcileState();
    st.connectedSince.set('c1', 0);
    const out = reconcilePositions(st, { reported: [p('x', 'c1')], connectedIds: ['c1'], now: 20000 });
    expect(ids(out)).toEqual(['x']);
  });
});
