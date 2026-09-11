// A2 — Templates de regras por firm (FTMO/E8/Apex). Presets versionados para
// criar conta prop sem digitar target/DD/consistency à mão (erro que invalida o Risk).
//
// ATENÇÃO: valores são ESTIMATIVAS da comunidade e regulamentos mudam. Todo template
// carrega `verified:false` + `checkedAt`; a UI mostra aviso até você confirmar.
// Nenhuma fórmula nova — só preenche campos de Account/PropExtension.

export interface FirmTemplate {
  id: string;
  firm: string;
  plan: string;
  version: number;
  checkedAt: string; // ISO da última conferência do regulamento
  verified: boolean; // true só após conferir o regulamento atual
  nominalSize: number;
  target: number;
  maxDD: number; // fração (0.10)
  trailingDD: number; // fração; = maxDD quando a firm usa limite estático
  trailing: boolean; // false = estático (não acompanha pico)
  dailyDD: number; // fração; 0 = sem limite diário
  consistencyPct: number | null; // null = sem regra
  minDays: number;
  profitSplit: number;
  payoutFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  payoutRules: { minProfit: number; minDaysSincePayout: number; feePct: number; method: string };
  challengeCost: number;
  notes: string;
}

export const FIRM_TEMPLATES: FirmTemplate[] = [
  {
    id: 'ftmo-challenge-100k',
    firm: 'FTMO',
    plan: 'Challenge 100K',
    version: 1,
    checkedAt: '2026-09-09',
    verified: false,
    nominalSize: 100000,
    target: 10000,
    maxDD: 0.1,
    trailingDD: 0.1,
    trailing: false,
    dailyDD: 0.05,
    consistencyPct: null,
    minDays: 4,
    profitSplit: 0.8,
    payoutFrequency: 'monthly',
    payoutRules: { minProfit: 0, minDaysSincePayout: 14, feePct: 0.2, method: 'Rise' },
    challengeCost: 540,
    notes: 'Estimativa — conferir regulamento FTMO atual (perda máxima/dia e split mudam).',
  },
  {
    id: 'e8-evaluation-50k',
    firm: 'E8',
    plan: 'Evaluation 50K',
    version: 1,
    checkedAt: '2026-09-09',
    verified: false,
    nominalSize: 50000,
    target: 4000,
    maxDD: 0.08,
    trailingDD: 0.08,
    trailing: true,
    dailyDD: 0.04,
    consistencyPct: 0.5,
    minDays: 1,
    profitSplit: 0.8,
    payoutFrequency: 'biweekly',
    payoutRules: { minProfit: 0, minDaysSincePayout: 8, feePct: 0.2, method: 'Rise' },
    challengeCost: 228,
    notes: 'Estimativa — conferir regulamento E8 atual (consistency e payout mudam).',
  },
  {
    id: 'apex-150k-rithmic',
    firm: 'Apex',
    plan: '150K Rithmic',
    version: 1,
    checkedAt: '2026-09-09',
    verified: false,
    nominalSize: 150000,
    target: 9000,
    maxDD: 0.05,
    trailingDD: 0.05,
    trailing: true,
    dailyDD: 0,
    consistencyPct: 0.5,
    minDays: 7,
    profitSplit: 0.9,
    payoutFrequency: 'monthly',
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.1, method: 'Rise' },
    challengeCost: 147,
    notes: 'Estimativa — conferir regulamento Apex atual (threshold trailing e min days mudam).',
  },
];

/** Dias desde a conferência; >90 dias ou não verificado => aviso na UI. */
export function templateAgeDays(t: FirmTemplate, now: string | Date = new Date()): number {
  const at = new Date(t.checkedAt).getTime();
  const n = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Math.max(0, Math.floor((n - at) / 86400000));
}

export function templateNeedsCheck(t: FirmTemplate, now?: string | Date): boolean {
  return !t.verified || templateAgeDays(t, now) > 90;
}

export interface AppliedTemplate {
  accountPatch: { kind: 'prop'; institution: string; name: string };
  prop: {
    nominalSize: number;
    challengeCost: number;
    phase: 'challenge1';
    target: number;
    maxDD: number;
    trailingDD: number;
    dailyDD: number;
    consistencyPct: number;
    minDays: number;
    profitSplit: number;
    payoutFrequency: FirmTemplate['payoutFrequency'];
    payoutRules: FirmTemplate['payoutRules'];
  };
}

/** Aplica o preset num rascunho de conta (editável depois). Sem regra = 1 (100%). */
export function applyTemplate(currentName: string, templateId: string): AppliedTemplate | null {
  const t = FIRM_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return null;
  return {
    accountPatch: {
      kind: 'prop',
      institution: t.firm,
      name: currentName.trim() ? currentName : `${t.firm} ${t.plan}`,
    },
    prop: {
      nominalSize: t.nominalSize,
      challengeCost: t.challengeCost,
      phase: 'challenge1',
      target: t.target,
      maxDD: t.maxDD,
      trailingDD: t.trailingDD,
      dailyDD: t.dailyDD,
      consistencyPct: t.consistencyPct ?? 1,
      minDays: t.minDays,
      profitSplit: t.profitSplit,
      payoutFrequency: t.payoutFrequency,
      payoutRules: { ...t.payoutRules },
    },
  };
}
