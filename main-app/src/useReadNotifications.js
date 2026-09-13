// Estado de "lida" das notificações (ações em aberto do Command Center).
// Persistido no `meta` (sincroniza entre devices) com cache em localStorage p/ paint
// instantâneo. A contagem da navbar = ações ainda não lidas.
import { useCallback, useEffect, useState } from 'react';
import { useFinance } from '@apps/state';

const KEY = 'notifications:read';

export function loadReadSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function cacheRead(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

export default function useReadNotifications(actions) {
  const finance = useFinance();
  const [read, setRead] = useState(loadReadSet);

  // Hidrata do meta sincronizado e mescla com o cache local.
  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const rec = await finance.ds.meta.getKey(KEY);
        const remote = Array.isArray(rec?.value) ? rec.value : [];
        if (!alive) return;
        setRead((prev) => {
          const merged = new Set([...prev, ...remote]);
          if (merged.size !== prev.size) cacheRead(merged);
          return merged;
        });
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance]);

  const persist = useCallback((set) => {
    cacheRead(set);
    try {
      finance?.ds?.meta.setKey(KEY, [...set]);
    } catch {
      /* noop */
    }
  }, [finance]);

  const unread = actions.filter((a) => !read.has(a.id));

  const markRead = useCallback((id) => {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persist(next);
      return next;
    });
  }, [persist]);

  const markAllRead = useCallback(() => {
    setRead((prev) => {
      const next = new Set(prev);
      actions.forEach((a) => next.add(a.id));
      persist(next);
      return next;
    });
  }, [actions, persist]);

  return { unread, markRead, markAllRead };
}
