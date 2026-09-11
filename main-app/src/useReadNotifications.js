// Estado de "lida" das notificações (ações em aberto do Command Center).
// Persistido em localStorage. A contagem da navbar = ações ainda não lidas.
import { useCallback, useState } from 'react';

const KEY = 'notifications:read';

export function loadReadSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
}

function persist(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

export default function useReadNotifications(actions) {
  const [read, setRead] = useState(loadReadSet);
  const unread = actions.filter((a) => !read.has(a.id));

  const markRead = useCallback((id) => {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setRead((prev) => {
      const next = new Set(prev);
      actions.forEach((a) => next.add(a.id));
      persist(next);
      return next;
    });
  }, [actions]);

  return { unread, markRead, markAllRead };
}
