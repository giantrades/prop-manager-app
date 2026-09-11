import { describe, it, expect, beforeEach } from 'vitest';
import { parseCsv, csvToTrades, inferColumnMap, previewCsv, dedupTrades } from '../csvImport';
import type { Trade } from '../types';

const SAMPLE_CSV = [
  'symbol,side,qty,entryprice,exitprice,entrydatetime,exitdatetime,commission,fee,brokerid,accountid',
  'EURUSD,buy,1.0,1.10000,1.10500,2026-01-01T10:00:00Z,2026-01-01T11:00:00Z,0.5,0.2,12345,acct-1',
  'EURUSD,sell,0.5,1.10500,1.10000,2026-01-02T10:00:00Z,2026-01-02T11:00:00Z,0.5,0.2,12346,acct-1',
  'invalid,,0,0,,,', // inválida: sem qty/preço
].join('\n');

describe('csvImport — parseCsv', () => {
  it('parseia linhas com aspas e vírgulas', () => {
    const rows = parseCsv('a,b,c\n"1,2",x,y\n');
    expect(rows[0]).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual(['1,2', 'x', 'y']);
  });

  it('ignora linhas totalmente vazias', () => {
    const rows = parseCsv('a,b\n\n1,2\n\n');
    expect(rows.length).toBe(2);
  });
});

describe('csvImport — inferColumnMap', () => {
  it('mapeia colunas por alias (case-insensitive, sem acento)', () => {
    const map = inferColumnMap(['Symbol', 'Side', 'Qty', 'EntryPrice', 'ExitPrice', 'EntryDateTime', 'ExitDateTime', 'Commission', 'Fee', 'BrokerID', 'AccountID']);
    expect(map.symbol).toBe('Symbol');
    expect(map.qty).toBe('Qty');
    expect(map.direction).toBe('Side');
    expect(map.brokerId).toBe('BrokerID');
  });
});

describe('csvImport — csvToTrades', () => {
  it('converte linhas válidas em Trades com PnL/R corretos', () => {
    const parsed = csvToTrades(SAMPLE_CSV);
    expect(parsed.length).toBe(2);
    const first = parsed[0].trade;
    expect(first.symbol).toBe('EURUSD');
    expect(first.direction).toBe('long');
    expect(first.qty).toBe(1);
    expect(first.entryPrice).toBe(1.1);
    // PnL = (1.105 - 1.1)*1*1 - 0.5 - 0.2 = -0.695, arredondado p/ 2 casas = -0.69
    expect(first.resultNet).toBeCloseTo(-0.69, 2);
    expect(first.source).toBe('csv');
    expect(first.quantowerId).toBe('csv_12345');
  });

  it('dedupKey = quantowerId(brokerId) + entryDatetime', () => {
    const parsed = csvToTrades(SAMPLE_CSV);
    expect(parsed[0].dedupKey).toBe('csv_12345|2026-01-01T10:00:00.000Z');
  });

  it('aceita data BR dd/MM/yyyy', () => {
    const csv = 'symbol,side,qty,entryprice,entrydatetime\nEURUSD,buy,1,1.1,15/01/2026 09:30\n';
    const parsed = csvToTrades(csv);
    expect(parsed.length).toBe(1);
    expect(parsed[0].trade.entryDatetime.startsWith('2026-01-15')).toBe(true);
  });
});

describe('csvImport — previewCsv', () => {
  it('retorna total/valid/invalid + sample', () => {
    const preview = previewCsv(SAMPLE_CSV);
    expect(preview.totalRows).toBe(3);
    expect(preview.valid).toBe(2);
    expect(preview.invalid).toBe(1);
    expect(preview.sample.length).toBe(2);
  });
});

describe('csvImport — dedupTrades', () => {
  it('remove duplicados dentro do lote e contra o banco (brokerId + openTime)', () => {
    const parsed = csvToTrades(SAMPLE_CSV);
    const existing: Trade[] = [
      parsed[0].trade, // já existe no banco
    ];
    const { newTrades, skipped } = dedupTrades(parsed, existing);
    expect(newTrades.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(newTrades[0].trade.quantowerId).toBe('csv_12346');
  });
});

import { csvToPositions } from '../csvImport';

describe('csvToPositions (P7)', () => {
  it('parse symbol,qty,avgPrice + aliases PT', () => {
    const { positions, errors } = csvToPositions(['ativo,quantidade,precomedio', 'PETR4,100,42.10', 'BTC,0.05,350000'].join('\n'));
    expect(errors).toHaveLength(0);
    expect(positions).toEqual([
      { symbol: 'PETR4', qty: 100, avgPrice: 42.1 },
      { symbol: 'BTC', qty: 0.05, avgPrice: 350000 },
    ]);
  });

  it('linhas inv�lidas v�o para errors sem derrubar o lote', () => {
    const { positions, errors } = csvToPositions(['symbol,qty,avgPrice', ',10,5', 'X,0,5', 'Y,1,0', 'VALE3,50,60'].join('\n'));
    expect(positions).toEqual([{ symbol: 'VALE3', qty: 50, avgPrice: 60 }]);
    expect(errors).toHaveLength(3);
  });

  it('header sem colunas => erro expl�cito', () => {
    const { positions, errors } = csvToPositions(['a,b,c', '1,2,3'].join('\n'));
    expect(positions).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});

