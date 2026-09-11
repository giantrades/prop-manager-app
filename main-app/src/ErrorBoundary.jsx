// STAGE 8 — ErrorBoundary. Captura erros de renderização da árvore e mostra um fallback
// em vez de derrubar o app. Requisito do AGENTS.md (regras duras).

import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[error-boundary]', error, info);
    import('./monitoring').then((m) => m.reportError(error)).catch(() => undefined);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="eb-root" role="alert">
          <div className="eb-title">Algo deu errado</div>
          <div className="eb-msg">{this.state.error instanceof Error ? this.state.error.message : String(this.state.error)}</div>
          <button className="eb-btn" onClick={() => this.setState({ error: null })}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EB_CSS = `
.eb-root { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; }
.eb-title { font-size: 20px; font-weight: 800; }
.eb-msg { font-size: 13px; color: var(--muted, #a1a7b3); max-width: 480px; }
.eb-btn { padding: 10px 18px; border-radius: 10px; background: var(--brand, #7c5cff); border: 1px solid var(--brand, #7c5cff); color: #fff; font-size: 13px; cursor: pointer; min-height: 42px; font-weight: 700; }
`;
if (typeof document !== 'undefined' && !document.getElementById('eb-styles')) {
  const style = document.createElement('style');
  style.id = 'eb-styles';
  style.textContent = EB_CSS;
  document.head.appendChild(style);
}
