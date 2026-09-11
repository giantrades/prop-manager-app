// STAGE 13 — monitoring. Inicializa o Sentry SOMENTE se `VITE_SENTRY_DSN` estiver
// definido (sem DSN = no-op, zero custo). Import dinâmico para não pesar o bundle.

export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({ dsn, tracesSampleRate: 0.1 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[monitoring] falha ao inicializar Sentry', err);
  }
}

/** Reporta um erro ao Sentry quando ativo (silencioso sem DSN). */
export async function reportError(err: unknown): Promise<void> {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.captureException(err);
  } catch {
    /* noop */
  }
}
