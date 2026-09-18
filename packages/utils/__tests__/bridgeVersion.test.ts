// Handshake de versão do bridge: a ponte pode ser IGUAL ou MAIS NOVA que a esperada.
// (Antes exigia igualdade exata: uma ponte atualizada era acusada de "desatualizada".)
import { describe, it, expect } from 'vitest';
import { versionAtLeast, EXPECTED_BRIDGE_VERSION } from '../adapters/quantowerAdapter.js';

describe('versionAtLeast', () => {
  it('aceita igual ou mais nova', () => {
    expect(versionAtLeast('2.1.0', '2.1.0')).toBe(true);
    expect(versionAtLeast('2.2.0', '2.1.0')).toBe(true);
    expect(versionAtLeast('3.0.0', '2.1.0')).toBe(true);
    expect(versionAtLeast('2.1.1', '2.1.0')).toBe(true);
  });

  it('recusa mais velha', () => {
    expect(versionAtLeast('2.0.0', '2.1.0')).toBe(false);
    expect(versionAtLeast('1.9.9', '2.1.0')).toBe(false);
    expect(versionAtLeast('2.0.9', '2.1.0')).toBe(false);
  });

  it('a versão esperada acompanha a do bridge (2.1.0 = contractSize + SL/TP em disco)', () => {
    expect(EXPECTED_BRIDGE_VERSION).toBe('2.1.0');
  });
});
