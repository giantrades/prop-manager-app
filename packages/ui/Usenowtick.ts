// "Agora" que se mexe sozinho: devolve um Date novo a cada minuto (alinhado à virada do
// minuto) e também quando a aba volta a ficar visível (no celular/PWA os timers são
// pausados em segundo plano). Com `fixed` (prop `now` dos componentes) não faz nada —
// útil para teste e para quem quer congelar o horário.
import { useEffect, useState } from 'react';

export function useNowTick(fixed?: Date, everyMs = 60_000): Date {
    const [tick, setTick] = useState<Date>(() => new Date());

    useEffect(() => {
        if (fixed) return undefined;
        let interval: ReturnType<typeof setInterval> | undefined;
        const sync = () => setTick(new Date());
        // 1º disparo na próxima virada de minuto; depois, a cada `everyMs`.
        const timeout = setTimeout(() => {
            sync();
            interval = setInterval(sync, everyMs);
        }, everyMs - (Date.now() % everyMs));
        const onVisible = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') sync();
        };
        document.addEventListener('visibilitychange', onVisible);
        sync(); // corrige qualquer atraso entre o render inicial e o efeito
        return () => {
            clearTimeout(timeout);
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [fixed, everyMs]);

    return fixed ?? tick;
}