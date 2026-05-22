import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useThemeStore, useToastStore } from '@/store';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const { login } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const { notify } = useToastStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const user = await login(username, password);
      notify(`Signed in as ${user.fullName || user.username}`, 'success');
      navigate('/pos');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Login failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button type="button" className="theme-btn" onClick={toggle}>
            <span>{theme === 'dark' ? '☀' : '🌙'}</span>
            <span>{theme === 'dark' ? ' Day' : ' Night'}</span>
          </button>
        </div>
        
        <div className="login-logo">MODERNEX STONES LLP</div>
        <div className="login-sub">GST 33AABFM1234A1Z7 · HSN 2516</div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 8,
            color: 'var(--t3)',
            textAlign: 'center',
            marginTop: 2,
            marginBottom: 20,
          }}
        >
          Accounts & Operations v2.0
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="fl" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="fi"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <div className="fg">
            <label className="fl" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="fi"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button
            className="btn btn-p"
            style={{ width: '100%' }}
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  );
}
