// Fase 2 — limpeza do texto de OCR (puro). Valores à mão.
import { describe, it, expect } from 'vitest';
import { fixOcrNumbers, ocrTextToLines, cleanOcrLines } from '../ocrText';

describe('Fase 2 — fixOcrNumbers (confusões do OCR)', () => {
  it('conserta O/l/S/B em tokens numéricos', () => {
    expect(fixOcrNumbers('1.O00,OO')).toBe('1.000,00');
    expect(fixOcrNumbers('S0,00')).toBe('50,00');
    expect(fixOcrNumbers('l2,3S')).toBe('12,35');
    expect(fixOcrNumbers('R$ 1O0,OO')).toBe('R$ 100,00');
  });

  it('NÃO mexe em palavras (sem dígito) nem em token não-numérico', () => {
    expect(fixOcrNumbers('SALARIO')).toBe('SALARIO');
    expect(fixOcrNumbers('PIX RECEBIDO JOAO')).toBe('PIX RECEBIDO JOAO');
    expect(fixOcrNumbers('LOJA')).toBe('LOJA');
  });

  it('conserta a linha inteira preservando data/descrição', () => {
    expect(fixOcrNumbers('05/09/2026 PIX 1.O00,OO C')).toBe('05/09/2026 PIX 1.000,00 C');
  });

  it('negativos com parênteses', () => {
    expect(fixOcrNumbers('(1SO,OO)')).toBe('(150,00)');
  });
});

describe('Fase 2 — ocrTextToLines', () => {
  it('limpa linhas vazias e ruído de 1 caractere', () => {
    expect(ocrTextToLines('05/09/2026 LOJA 10,00\n\nx\n  UBER  30,00 \n')).toEqual(['05/09/2026 LOJA 10,00', 'UBER 30,00']);
  });

  it('cleanOcrLines aplica a correção linha a linha', () => {
    expect(cleanOcrLines(['1.O00,OO', 'SALARIO 2.000,00'])).toEqual(['1.000,00', 'SALARIO 2.000,00']);
  });
});
