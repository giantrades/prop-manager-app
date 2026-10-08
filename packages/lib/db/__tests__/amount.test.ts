// H4 — parser de valor (BR/US + expressões). Valores calculados à mão.
import { describe, it, expect } from 'vitest';
import { parseAmount, parseNumberToken } from '../amount';

describe('parseAmount — formatos BR/US', () => {
  it('aceita decimal BR e US', () => {
    expect(parseAmount('45,90')).toBe(45.9);
    expect(parseAmount('45.90')).toBe(45.9);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });

  it('trata milhar sem decimal', () => {
    expect(parseAmount('1.234.567')).toBe(1234567);
    expect(parseAmount('1,234,567')).toBe(1234567);
    expect(parseAmount('1234')).toBe(1234);
  });

  it('ignora símbolo de moeda e espaços', () => {
    expect(parseAmount('R$ 1.234,56')).toBe(1234.56);
    expect(parseAmount(' $ 12.5 ')).toBe(12.5);
  });

  it('número cru e vazio/inválido', () => {
    expect(parseAmount(12.5)).toBe(12.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12abc')).toBeNull();
    expect(parseAmount('1.2.3,4.5')).toBeNull();
  });
});

describe('parseAmount — expressões', () => {
  it('multiplicação/divisão/soma/subtração', () => {
    expect(parseAmount('12*3')).toBe(36);
    expect(parseAmount('10+5')).toBe(15);
    expect(parseAmount('100/4')).toBe(25);
    expect(parseAmount('10-5')).toBe(5);
  });

  it('respeita precedência', () => {
    expect(parseAmount('10+2*3')).toBe(16);
    expect(parseAmount('2*3+10')).toBe(16);
    expect(parseAmount('20-4/2')).toBe(18);
  });

  it('funciona com decimais BR', () => {
    expect(parseAmount('1.234,56*2')).toBe(2469.12);
    expect(parseAmount('45,90+4,10')).toBe(50);
  });

  it('inválido não vira número (divisão por zero, operador solto)', () => {
    expect(parseAmount('10/0')).toBeNull();
    expect(parseAmount('*3')).toBeNull();
    expect(parseAmount('10+')).toBeNull();
    expect(parseAmount('10+abc')).toBeNull();
  });
});

describe('parseNumberToken', () => {
  it('rejeita token não numérico', () => {
    expect(parseNumberToken('')).toBeNull();
    expect(parseNumberToken('x')).toBeNull();
    expect(parseNumberToken('.')).toBeNull();
  });
});
