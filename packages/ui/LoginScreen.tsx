// STAGE 7 — LoginScreen. Login/registro via Supabase Auth (email + senha, ou magic link).
// Uso pessoal (1 usuário): a tela só autentica; quem pode entrar é definido no Supabase.
// COMPOSIÇÃO: recebe callbacks; o container (AuthGate) chama `supabase.auth`.

import React, { useState } from 'react';

/**
 * @param {object} props
 * @param {(email:string, password:string)=>Promise<void>|void} props.onLogin
 * @param {(email:string)=>Promise<void>|void} [props.onMagicLink]
 * @param {()=>Promise<void>|void} [props.onLogout]
 * @param {{email?:string}} [props.user]
 * @param {boolean} [props.loading]
 * @param {string|null} [props.error]
 */
interface LoginUser {
  email?: string;
}

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void> | void;
  onMagicLink?: (email: string) => Promise<void> | void;
  onLogout?: () => Promise<void> | void;
  user?: LoginUser | null;
  loading?: boolean;
  error?: string | null;
}
export default function LoginScreen({ onLogin, onMagicLink, onLogout, user, loading = false, error = null }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('password');
  const [sent, setSent] = useState(false);

  if (user) {
    return (
      <div className="ls-root">
        <div className="ls-card">
          <div className="ls-logo" aria-hidden="true">📊</div>
          <h1 className="ls-title">Finance OS</h1>
          <p className="ls-sub">Conectado como <b>{user.email}</b></p>
          <button className="ls-btn ls-btn-primary" onClick={onLogout} disabled={loading}>Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ls-root">
      <div className="ls-card">
        <div className="ls-logo" aria-hidden="true">📊</div>
        <h1 className="ls-title">Finance OS</h1>
        <p className="ls-sub">Acesso pessoal — entre com sua conta.</p>

        <div className="ls-mode">
          <button className={`ls-mode-btn${mode === 'password' ? ' active' : ''}`} onClick={() => setMode('password')}>Senha</button>
          <button className={`ls-mode-btn${mode === 'magic' ? ' active' : ''}`} onClick={() => setMode('magic')}>Magic link</button>
        </div>

        <label className="ls-field">
          <span className="ls-label">E-mail</span>
          <input className="ls-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" />
        </label>

        {mode === 'password' && (
          <label className="ls-field">
            <span className="ls-label">Senha</span>
            <input className="ls-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
          </label>
        )}

        {sent && <div className="ls-ok" role="status">Link de acesso enviado para {email}. Confira seu e-mail.</div>}
        {error && <div className="ls-error" role="alert">{error}</div>}

        <button
          className="ls-btn ls-btn-primary"
          disabled={loading || !email || (mode === 'password' && !password)}
          onClick={async () => {
            setSent(false);
            if (mode === 'password') await onLogin(email, password);
            else { await onMagicLink?.(email); setSent(true); }
          }}
        >
          {loading ? 'Entrando…' : mode === 'password' ? 'Entrar' : 'Enviar magic link'}
        </button>
      </div>
    </div>
  );
}

const LS_CSS = `
.ls-root { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: linear-gradient(180deg, #0c0f14 0%, var(--bg, #0f1218) 100%); }
.ls-card { width: 100%; max-width: 380px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 28px; display: flex; flex-direction: column; gap: 14px; }
.ls-logo { font-size: 34px; text-align: center; }
.ls-title { font-size: 22px; font-weight: 800; text-align: center; margin: 0; }
.ls-sub { font-size: 13px; color: var(--muted, #a1a7b3); text-align: center; margin: 0; }
.ls-mode { display: flex; gap: 6px; }
.ls-mode-btn { flex: 1; padding: 9px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 13px; cursor: pointer; }
.ls-mode-btn.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); font-weight: 700; }
.ls-field { display: flex; flex-direction: column; gap: 5px; }
.ls-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.ls-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 11px 12px; color: var(--text, #e7eaf0); font-size: 14px; min-height: 44px; }
.ls-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.ls-btn { padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 14px; cursor: pointer; min-height: 44px; font-weight: 700; }
.ls-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; }
.ls-btn:disabled { opacity: 0.5; cursor: default; }
.ls-error { padding: 10px 12px; border-radius: 10px; background: rgba(231,76,60,0.12); border: 1px solid rgba(231,76,60,0.3); color: var(--red, #e74c3c); font-size: 13px; }
.ls-ok { padding: 10px 12px; border-radius: 10px; background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); font-size: 13px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('ls-styles')) {
  const style = document.createElement('style');
  style.id = 'ls-styles';
  style.textContent = LS_CSS;
  document.head.appendChild(style);
}
