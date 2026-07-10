import { useState } from 'react';
import { useAuth } from '@apps/auth';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError('');
    
    try {
      await signIn(email);
      // Success - redirect handled by auth callback
    } catch (err) {
      setError(err.message || 'Erro ao enviar link de login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'var(--bg, #0f1218)',
      color: 'var(--text, #e7eaf0)',
      padding: 20
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: 420, 
        padding: 32, 
        background: 'var(--panel, #151a23)', 
        borderRadius: 16, 
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Giantrades</h1>
          <p style={{ margin: 8, color: 'var(--muted)' }}>Entre com seu email para acessar</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--muted)' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                color: 'var(--text)',
                fontSize: 16,
                outline: 'none'
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--brand, #7c5cff)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {error && (
            <div style={{ 
              padding: '10px 12px', 
              background: 'rgba(239,68,68,0.15)', 
              border: '1px solid rgba(239,68,68,0.3)', 
              borderRadius: 8, 
              color: '#ef4444', 
              fontSize: 13 
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? 'rgba(16,185,129,0.5)' : 'var(--brand, #7c5cff)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginTop: 8
            }}
          >
            {loading ? 'Enviando...' : '📧 Enviar Link de Login'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Enviamos um link mágico para seu email.<br/>
          Sem senhas, sem complicação.
        </p>
      </div>
    </div>
  );
}