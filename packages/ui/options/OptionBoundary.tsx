// ErrorBoundary local do módulo Opções: um erro de render numa sub-aba (gráfico, cadeia
// corrompida…) não derruba a página inteira nem as outras abas. `resetKey` limpa o erro
// ao trocar de aba.
import React from 'react';
import { ensureOptionStyles } from './optionStyles';

interface Props {
  children: React.ReactNode;
  resetKey?: string;
  label?: string;
}
interface State {
  error: Error | null;
}

export default class OptionBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[Opções]', error);
  }

  render() {
    ensureOptionStyles();
    if (!this.state.error) return this.props.children;
    return (
      <div className="card opx-alert bad" role="alert">
        <b>Não foi possível exibir {this.props.label ?? 'esta área'}.</b>
        <span className="opx-muted">{this.state.error.message || 'Erro inesperado.'} Seus dados não foram alterados.</span>
        <div className="opx-row">
          <button type="button" className="opx-btn" onClick={() => this.setState({ error: null })}>Tentar novamente</button>
        </div>
      </div>
    );
  }
}
