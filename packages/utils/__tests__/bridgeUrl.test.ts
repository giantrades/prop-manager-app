// Normalização da URL do bridge: em página HTTPS nunca tentar http (mixed content) e
// nunca apontar para 127.0.0.1 (no celular isso é o próprio celular -> "Failed to fetch").
import { describe, it, expect } from 'vitest';
import { normalizeBridgeUrl, BRIDGE_HTTPS_URL } from '../adapters/quantowerAdapter.js';

describe('normalizeBridgeUrl', () => {
  it('página segura: adiciona https quando não há esquema', () => {
    expect(normalizeBridgeUrl('gian-note.tailbafabd.ts.net', true)).toBe(BRIDGE_HTTPS_URL);
  });

  it('página segura: IP do Tailscale (com porta ou não) vira o host do Funnel', () => {
    expect(normalizeBridgeUrl('http://100.80.100.89:8787', true)).toBe(BRIDGE_HTTPS_URL);
    expect(normalizeBridgeUrl('100.80.100.89:8787', true)).toBe(BRIDGE_HTTPS_URL);
  });

  it('página segura: host do Funnel com :8787 é normalizado para a URL correta (443)', () => {
    expect(normalizeBridgeUrl('http://gian-note.tailbafabd.ts.net:8787', true)).toBe(BRIDGE_HTTPS_URL);
  });

  it('página segura: http genérico NÃO é promovido a https (host pode não ter TLS)', () => {
    expect(normalizeBridgeUrl('http://192.168.0.10:8787', true)).toBe('http://192.168.0.10:8787');
  });

  it('página insegura: mantém http e loopback', () => {
    expect(normalizeBridgeUrl('127.0.0.1:8787', false)).toBe('http://127.0.0.1:8787');
    expect(normalizeBridgeUrl('http://127.0.0.1:8787/', false)).toBe('http://127.0.0.1:8787');
  });

  it('vazio continua vazio', () => {
    expect(normalizeBridgeUrl('', true)).toBe('');
    expect(normalizeBridgeUrl('   ', false)).toBe('');
  });
});
