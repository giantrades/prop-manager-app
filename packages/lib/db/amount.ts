// H4 — Parser de valor monetário (BR/US) + expressões simples.
// Aceita "1.234,56" (BR), "1,234.56" (US), "45,90" e expressões como "12*3".
// Puro, sem eval. Não é fórmula financeira — só interpretação de input.
//
// Regras de separador:
//  - com '.' e ',' juntos: o ÚLTIMO é o decimal, o outro é milhar.
//  - só ',': vírgula é decimal ("45,90" = 45.9); 2+ vírgulas => milhar ("1,234,567").
//  - só '.': ponto decimal se aparecer 1x; 2+ => milhar ("1.234.567").
//
// Expressões: apenas números + operadores `+ - * /` (sem parênteses), respeitando
// precedência. Qualquer outro caractere => `null` (nunca lança).

function r2(v: number): number {
  return Number(v.toFixed(2));
}

/** Converte um token numérico (já sem operadores) em número. */
export function parseNumberToken(tok: string): number | null {
  let t = tok.trim();
  if (!t) return null;
  const commas = (t.match(/,/g) ?? []).length;
  const dots = (t.match(/\./g) ?? []).length;
  if (commas > 0 && dots > 0) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) {
      // BR: "1.234,56" -> pontos são milhar, vírgula decimal
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      // US: "1,234.56"
      t = t.replace(/,/g, '');
    }
  } else if (commas > 1) {
    t = t.replace(/,/g, ''); // "1,234,567"
  } else if (commas === 1) {
    t = t.replace(',', '.'); // decimal BR
  } else if (dots > 1) {
    t = t.replace(/\./g, ''); // "1.234.567"
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Interpreta um valor digitado pelo usuário. Retorna `null` quando inválido
 * (nunca lança, nunca salva lixo).
 */
export function parseAmount(text: string | number | null | undefined): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? r2(text) : null;
  if (text == null) return null;
  let s = String(text).trim();
  if (!s) return null;
  // Remove símbolos/espacos comuns (R$, $, €, NBSP).
  s = s.replace(/[R$€\s\u00a0]/gi, '');
  if (!s) return null;

  const hasOperator = /[+\-*/]/.test(s);
  if (hasOperator) {
    if (!/^[0-9.,+\-*/]+$/.test(s)) return null;
    const parts = s.match(/(\d[\d.,]*)|([+\-*/])/g);
    if (!parts || parts.length === 0 || parts.length % 2 === 0) return null;
    const nums: number[] = [];
    const ops: string[] = [];
    for (let i = 0; i < parts.length; i += 1) {
      if (i % 2 === 0) {
        const n = parseNumberToken(parts[i]);
        if (n == null) return null;
        nums.push(n);
      } else {
        if (!/^[+\-*/]$/.test(parts[i])) return null;
        ops.push(parts[i]);
      }
    }
    // Pass 1: * e /
    for (let i = 0; i < ops.length; ) {
      if (ops[i] === '*' || ops[i] === '/') {
        const a = nums[i];
        const b = nums[i + 1];
        if (ops[i] === '/' && b === 0) return null;
        const v = ops[i] === '*' ? a * b : a / b;
        nums.splice(i, 2, v);
        ops.splice(i, 1);
      } else {
        i += 1;
      }
    }
    // Pass 2: + e -
    let acc = nums[0];
    for (let i = 0; i < ops.length; i += 1) {
      acc = ops[i] === '+' ? acc + nums[i + 1] : acc - nums[i + 1];
    }
    return Number.isFinite(acc) ? r2(acc) : null;
  }

  const n = parseNumberToken(s);
  return n == null ? null : r2(n);
}
