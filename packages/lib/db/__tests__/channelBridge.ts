// Test helper: bridge de BroadcastChannel entre duas "abas". No node não existe
// BroadcastChannel real, então simulamos um par de endpoints conectados onde o que
// A posta chega em B (e vice-versa), mas NUNCA no próprio remetente — igual ao
// comportamento real do BroadcastChannel (o remetente não recebe a própria msg).

import type { BroadcastChannelLike } from '../events';

interface Endpoint extends BroadcastChannelLike {
  _deliver(data: unknown): void;
  peer: Endpoint;
}

export interface ChannelPair {
  a: Endpoint;
  b: Endpoint;
}

function makeEndpoint(): Endpoint {
  const listeners = new Set<(ev: { data: unknown }) => void>();
  const ep: Partial<Endpoint> = {
    _deliver(data: unknown) {
      for (const cb of [...listeners]) cb({ data });
    },
    postMessage(data: unknown) {
      ep.peer._deliver(data);
    },
    addEventListener(_type, cb) {
      listeners.add(cb);
    },
    removeEventListener(_type, cb) {
      listeners.delete(cb);
    },
    close() {
      listeners.clear();
    },
  };
  return ep as Endpoint;
}

export function createChannelPair(): ChannelPair {
  const a = makeEndpoint();
  const b = makeEndpoint();
  Object.defineProperty(a, 'peer', { value: b });
  Object.defineProperty(b, 'peer', { value: a });
  return { a, b };
}
