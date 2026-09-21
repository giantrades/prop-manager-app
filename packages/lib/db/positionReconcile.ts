// Reconciliação de posições ao vivo POR CONEXÃO (estado/apresentação — nenhuma fórmula).
//
// A ponte devolve todas as posições abertas (`/positions`, cada uma com `connectionId`) e a
// lista das conexões CONECTADAS (`/status.connections`). Conexões diferentes conectam em
// tempos diferentes e a plataforma pode demorar a carregar as posições de cada uma. Regra:
//
//  • Conexão desconhecida/desconectada → só adiciona/atualiza; NUNCA fecha (não há como
//    confirmar que a posição fechou — pode ser só a conexão fora do ar).
//  • Conexão conectada e recém-vista (`age < graceMs`) → só adiciona/atualiza; não fecha ainda
//    (a Quantower pode ainda não ter carregado as posições dessa conexão).
//  • Conexão conectada e "madura":
//      - respondeu com posições → o que não veio FECHOU (fecha na hora).
//      - respondeu vazio e não tinha nada → nada a fechar.
//      - respondeu vazio e TINHA posições → espera `clearConfirmMs` de vazio contínuo para
//        fechar (protege contra o vazio transitório do stream quando o JSON falha).
//
// Assim o mapa fecha só o que a conexão realmente deixou de reportar, sem "piscar" e sem
// depender de um tempo global (cada conexão tem o seu).

/** Posição ao vivo como vem do adapter (`quantowerAdapter.getPositions`). */
export interface LivePositionLike {
  platformPositionId?: string;
  connectionId?: string;
  symbol?: string;
  openTime?: string;
  entryTime?: string;
  /** 1º instante (ms) em que o app viu a posição — fallback de início. */
  firstSeenAt?: number;
  [k: string]: unknown;
}

export interface ReconcileState {
  /** platformPositionId → última posição conhecida (aberta). */
  known: Map<string, LivePositionLike>;
  /** connectionId → instante em que a conexão foi vista conectada pela 1ª vez. */
  connectedSince: Map<string, number>;
  /** connectionId → instante em que passou a reportar vazio tendo posições conhecidas. */
  pendingClear: Map<string, number>;
  /** platformPositionId → 1º instante em que o app viu a posição. Fallback de "início" quando a
   *  plataforma não informa o horário de abertura (`openTime` vazio/`0001`). */
  firstSeen: Map<string, number>;
}

/** Chave estável de uma posição (id da plataforma; fallback símbolo+conexão+abertura). */
export function posKey(p: LivePositionLike): string {
  return p.platformPositionId || `${p.connectionId ?? ''}:${p.symbol ?? ''}:${p.openTime ?? p.entryTime ?? ''}`;
}

/**
 * Estado inicial (opcionalmente semeado com o último snapshot, para não "piscar" ao carregar).
 * `seedAt` (ms) é o instante do snapshot — vira o "primeiro visto" das posições semeadas.
 */
export function createReconcileState(seed: LivePositionLike[] = [], seedAt = Date.now()): ReconcileState {
  const known = new Map<string, LivePositionLike>();
  const firstSeen = new Map<string, number>();
  for (const p of seed) {
    const k = posKey(p);
    known.set(k, p);
    firstSeen.set(k, seedAt);
    if (p.firstSeenAt == null) p.firstSeenAt = seedAt;
  }
  return { known, connectedSince: new Map(), pendingClear: new Map(), firstSeen };
}

export interface ReconcileOptions {
  reported: LivePositionLike[];
  /** Ids das conexões CONECTADAS (de `/status.connections`). */
  connectedIds: Array<string | null | undefined>;
  now: number;
  /** Tempo mínimo após a conexão aparecer conectada antes de confiar no que ela (não) reportou. */
  graceMs?: number;
  /** Confirmação de "vazio" para uma conexão que já tinha posições conhecidas. */
  clearConfirmMs?: number;
}

function groupByConn(list: Iterable<LivePositionLike>): Map<string, LivePositionLike[]> {
  const m = new Map<string, LivePositionLike[]>();
  for (const p of list) {
    const c = p.connectionId || '';
    const arr = m.get(c);
    if (arr) arr.push(p);
    else m.set(c, [p]);
  }
  return m;
}

function unionByKey(prev: LivePositionLike[], rep: LivePositionLike[]): LivePositionLike[] {
  const m = new Map<string, LivePositionLike>();
  for (const p of prev) m.set(posKey(p), p);
  for (const p of rep) m.set(posKey(p), p);
  return [...m.values()];
}

/**
 * Reconcilia a leitura `reported` com o estado, mutando `state` (known/connectedSince/pendingClear)
 * e devolvendo a lista de posições que devem ser consideradas ABERTAS agora.
 */
export function reconcilePositions(state: ReconcileState, opts: ReconcileOptions): LivePositionLike[] {
  const graceMs = opts.graceMs ?? 10000;
  const clearConfirmMs = opts.clearConfirmMs ?? 8000;
  const now = opts.now;
  const connected = new Set(opts.connectedIds.filter((x): x is string => !!x));

  // Marca quando cada conexão conectada foi vista pela 1ª vez; esquece as que sumiram.
  for (const id of connected) if (!state.connectedSince.has(id)) state.connectedSince.set(id, now);
  for (const id of [...state.connectedSince.keys()]) if (!connected.has(id)) state.connectedSince.delete(id);

  const repByConn = groupByConn(opts.reported);
  const knownByConn = groupByConn(state.known.values());
  const connIds = new Set<string>([...repByConn.keys(), ...knownByConn.keys()]);

  const result: LivePositionLike[] = [];
  const nextKnown = new Map<string, LivePositionLike>();
  const keep = (list: LivePositionLike[]) => {
    for (const p of list) {
      const k = posKey(p);
      if (!state.firstSeen.has(k)) state.firstSeen.set(k, now);
      p.firstSeenAt = state.firstSeen.get(k); // fallback de início (quando a plataforma não informa)
      result.push(p);
      nextKnown.set(k, p);
    }
  };

  for (const c of connIds) {
    const prev = knownByConn.get(c) ?? [];
    const rep = repByConn.get(c) ?? [];

    // Conexão desconhecida/desconectada: nunca fecha (só adiciona/atualiza).
    if (!c || !connected.has(c)) {
      state.pendingClear.delete(c);
      keep(unionByKey(prev, rep));
      continue;
    }

    const age = now - (state.connectedSince.get(c) ?? now);
    if (age < graceMs) {
      // Recém-conectada: ainda não confiamos no vazio dela.
      keep(unionByKey(prev, rep));
    } else if (rep.length > 0) {
      // Respondeu: o que não veio fechou.
      state.pendingClear.delete(c);
      keep(rep);
    } else if (prev.length === 0) {
      state.pendingClear.delete(c);
    } else {
      // Conectada e madura, mas reportando vazio com posições conhecidas: confirma.
      const started = state.pendingClear.get(c);
      if (started == null) {
        state.pendingClear.set(c, now);
        keep(prev);
      } else if (now - started >= clearConfirmMs) {
        state.pendingClear.delete(c);
      } else {
        keep(prev);
      }
    }
  }

  state.known = nextKnown;
  // Esquece o "primeiro visto" das posições que fecharam.
  for (const k of [...state.firstSeen.keys()]) if (!nextKnown.has(k)) state.firstSeen.delete(k);
  return result;
}
