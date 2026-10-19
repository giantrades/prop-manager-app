// Fase 2 — limpeza do texto vindo do OCR (PURO, testável). O OCR troca dígitos por
// letras parecidas ("1.O00,OO", "S0,00"). Corrigimos SÓ dentro de tokens que, após a
// troca, viram um valor monetário válido — para não estragar palavras.

/** Confusões comuns do OCR: letra → dígito. Conservador (só as mais seguras). */
const CONFUSABLES: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0',
  I: '1', l: '1', '|': '1',
  S: '5', s: '5',
  B: '8', Z: '2',
};

/** Um token "parece dinheiro" (BR/US, com ou sem R$, sinal/parênteses)? */
function isMoneyLike(tok: string): boolean {
  return /^\(?-?R?\$?\d{1,3}(?:\.\d{3})*(?:,\d{2})?\)?$/.test(tok)
    || /^\(?-?\d+(?:[.,]\d{1,2})?\)?$/.test(tok);
}

/** Corrige confusões do OCR apenas em tokens numéricos (preserva palavras). */
export function fixOcrNumbers(line: string): string {
  return String(line ?? '').replace(/\S+/g, (tok) => {
    if (!/\d/.test(tok)) return tok;
    const candidate = tok.replace(/[OoDQIl|SsBZ]/g, (c) => CONFUSABLES[c] ?? c);
    return isMoneyLike(candidate) ? candidate : tok;
  });
}

/** Texto bruto do OCR → linhas limpas (trim, sem vazias, sem ruído de 1 caractere). */
export function ocrTextToLines(text: string): string[] {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2 && /[0-9A-Za-z]/.test(l));
}

/** Aplica `fixOcrNumbers` linha a linha (atalho para a UI). */
export function cleanOcrLines(lines: string[]): string[] {
  return lines.map(fixOcrNumbers);
}
