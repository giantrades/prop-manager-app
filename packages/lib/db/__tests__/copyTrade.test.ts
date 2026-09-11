import { describe, it, expect } from 'vitest';
import {
  previewCopyTrade,
  roundToLotStep,
  copyPreviewMessage,
  executeCopyTrade,
  type OrderSender,
} from '../copyTrade';
import type { Account } from '../types';

function account(overrides: Partial<Account> = {}): Account {
  return { id: 'a', kind: 'prop', name: 'A', currency: 'USD', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

describe('copyTrade — roundToLotStep', () => {
  it('arredonda qty ao menor incremento negociável', () => {
    expect(roundToLotStep(0.35, 0.1)).toEqual({ qty: 0.4, rounded: true });
    expect(roundToLotStep(0.4, 0.1)).toEqual({ qty: 0.4, rounded: false });
    expect(roundToLotStep(1.5, undefined)).toEqual({ qty: 1.5, rounded: false });
  });
});

describe('copyTrade — previewCopyTrade', () => {
  it('replica para contas do mesmo copyGroup, aplicando multiplier e lotStep', () => {
    const master = account({ id: 'm', copyGroup: 'g1', copyMultiplier: 1 });
    const e8 = account({ id: 'e8', copyGroup: 'g1', copyMultiplier: 0.5, lotStep: 0.1 });
    const apex = account({ id: 'apex', copyGroup: 'g1', copyMultiplier: 1, lotStep: 0.01 });
    const other = account({ id: 'x', copyGroup: 'g2' });

    const preview = previewCopyTrade(master, [master, e8, apex, other], 1);
    expect(preview.none).toBe(false);
    expect(preview.targets.length).toBe(2);
    const e8Target = preview.targets.find((t) => t.account.id === 'e8');
    expect(e8Target?.multiplier).toBe(0.5);
    expect(e8Target?.qty).toBe(0.5);
    const apexTarget = preview.targets.find((t) => t.account.id === 'apex');
    expect(apexTarget?.qty).toBe(1);
  });

  it('sem copyGroup ou sem destinos -> none=true', () => {
    const master = account({ id: 'm' });
    const preview = previewCopyTrade(master, [master], 1);
    expect(preview.none).toBe(true);
  });

  it('copyPreviewMessage monta a mensagem de preview', () => {
    const master = account({ id: 'm', copyGroup: 'g1' });
    const e8 = account({ id: 'e8', name: 'E8 50K', copyGroup: 'g1', copyMultiplier: 0.5 });
    const preview = previewCopyTrade(master, [master, e8], 1);
    expect(copyPreviewMessage(preview)).toContain('E8 50K ×0.5');
  });
});

describe('copyTrade — executeCopyTrade', () => {
  it('envia uma ordem por réplica, cada uma com clientOrderId próprio', async () => {
    const sent: Array<{ accountId: string; qty: number; clientOrderId: string }> = [];
    const sender: OrderSender = {
      async openPosition(p) {
        sent.push({ accountId: p.accountId, qty: p.qty, clientOrderId: p.clientOrderId });
        return { success: true };
      },
    };
    const master = account({ id: 'm', copyGroup: 'g1' });
    const e8 = account({ id: 'e8', copyGroup: 'g1', copyMultiplier: 0.5 });
    const apex = account({ id: 'apex', copyGroup: 'g1', copyMultiplier: 1 });
    let i = 0;
    const result = await executeCopyTrade(sender, master, [master, e8, apex], {
      symbol: 'EURUSD',
      side: 'buy',
      qty: 1,
      newClientOrderId: () => `cid-${(i += 1)}`,
    });

    expect(result.failed).toBe(0);
    expect(sent.length).toBe(2);
    expect(new Set(sent.map((s) => s.clientOrderId)).size).toBe(2); // clientOrderId distintos
    expect(sent[0].qty).toBe(0.5); // e8 ×0.5
    expect(sent[1].qty).toBe(1); // apex ×1
  });

  it('se uma réplica falha, as outras não são desfeitas (reporta qual falhou)', async () => {
    const sent: string[] = [];
    const sender: OrderSender = {
      async openPosition(p) {
        if (p.accountId === 'e8') throw new Error('rejected');
        sent.push(p.accountId);
        return { success: true };
      },
    };
    const master = account({ id: 'm', copyGroup: 'g1' });
    const e8 = account({ id: 'e8', copyGroup: 'g1', copyMultiplier: 0.5 });
    const apex = account({ id: 'apex', copyGroup: 'g1', copyMultiplier: 1 });
    let i = 0;
    const result = await executeCopyTrade(sender, master, [master, e8, apex], {
      symbol: 'EURUSD', side: 'buy', qty: 1,
      newClientOrderId: () => `cid-${(i += 1)}`,
    });

    expect(result.failed).toBe(1);
    expect(sent).toContain('apex'); // a que não falhou foi enviada
    expect(result.sent.find((s) => s.accountId === 'e8')?.ok).toBe(false);
  });
});
