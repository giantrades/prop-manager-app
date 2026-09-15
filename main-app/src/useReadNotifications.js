// Estado das notificações (ações em aberto): lido, dismissado e snooze.
// Persistido no `meta` (sincroniza) com cache em localStorage p/ paint instantâneo.
// A contagem da navbar = ações ainda não lidas, não dismissadas e fora do snooze.
import { useCallback, useEffect, useState } from 'react';
import { useFinance } from '@apps/state';

const READ_KEY = 'notifications:read';
const DISMISS_KEY = 'notifications:dismissed';
const SNOOZE_KEY = 'notifications:snoozed';

function readLocal(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function loadReadSet() {
  return new Set(readLocal(READ_KEY, []));
}

export default function useReadNotifications(actions) {
  const finance = useFinance();
  const [read, setRead] = useState(loadReadSet);
  const [dismissed, setDismissed] = useState(() => new Set(readLocal(DISMISS_KEY, [])));
  const [snoozed, setSnoozed] = useState(() => readLocal(SNOOZE_KEY, {}));

  // Hidrata do meta sincronizado e mescla.
  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const [r, d, s] = await Promise.all([
          finance.ds.meta.getKey(READ_KEY),
          finance.ds.meta.getKey(DISMISS_KEY),
          finance.ds.meta.getKey(SNOOZE_KEY),
        ]);
        if (!alive) return;
        if (Array.isArray(r?.value)) setRead((prev) => new Set([...prev, ...r.value]));
        if (Array.isArray(d?.value)) setDismissed((prev) => new Set([...prev, ...d.value]));
        if (s?.value && typeof s.value === 'object') setSnoozed((prev) => ({ ...prev, ...s.value }));
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance]);

  const persist = useCallback((key, value) => {
    writeLocal(key, value);
    try {
      finance?.ds?.meta.setKey(key, value);
    } catch {
      /* noop */
    }
  }, [finance]);

  const unread = actions.filter(
    (a) => !read.has(a.id)
      && !dismissed.has(a.id)
      && !(snoozed[a.id] && Date.parse(snoozed[a.id]) > Date.now()),
  );

  const markRead = useCallback((id) => {
    setRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      persist(READ_KEY, [...next]);
      return next;
    });
  }, [persist]);

  const markAllRead = useCallback(() => {
    setRead((prev) => {
      const next = new Set(prev);
      actions.forEach((a) => next.add(a.id));
      persist(READ_KEY, [...next]);
      return next;
    });
  }, [actions, persist]);

  const dismiss = useCallback((id) => {
    setDismissed((prev) => { const next = new Set(prev); next.add(id); persist(DISMISS_KEY, [...next]); return next; });
  }, [persist]);

  const snooze = useCallback((id, hours = 24) => {
    setSnoozed((prev) => {
      const next = { ...prev, [id]: new Date(Date.now() + hours * 3600 * 1000).toISOString() };
      persist(SNOOZE_KEY, next);
      return next;
    });
  }, [persist]);

  return { unread, markRead, markAllRead, dismiss, snooze };
}
