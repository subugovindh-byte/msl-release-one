import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useThemeStore, useToastStore } from '@/store';
import { useForgotPassword, useResetPassword } from '@/hooks/useApi';

type ForgotStep = 'idle' | 'request' | 'reset';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [forgotStep, setForgotStep] = useState<ForgotStep>('idle');
  const [forgotUsername, setForgotUsername] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const forgotPassword = useForgotPassword();
  const resetPassword  = useResetPassword();

  const { login } = useAuthStore();
  const { theme, toggle } = useThemeStore();
  const { notify } = useToastStore();
  const navigate = useNavigate();

  const handleForgotRequest = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res: any = await forgotPassword.mutateAsync(forgotUsername);
      if (res?.reset_token) {
        setResetToken(res.reset_token);
        setForgotStep('reset');
      } else {
        notify('If the username exists a reset token was generated — contact admin', 'info');
        setForgotStep('idle');
      }
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleResetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { notify('Passwords do not match', 'error'); return; }
    try {
      await resetPassword.mutateAsync({ token: resetToken, new_password: newPassword });
      notify('Password reset successfully — please sign in', 'success');
      setForgotStep('idle');
      setForgotUsername('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

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

        {forgotStep === 'idle' && (
          <>
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

            <button
              type="button"
              onClick={() => { setForgotStep('request'); setForgotUsername(''); }}
              style={{ marginTop: 14, width: '100%', background: 'none', border: 'none', color: 'var(--t3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Forgot password?
            </button>
          </>
        )}

        {forgotStep === 'request' && (
          <form onSubmit={handleForgotRequest}>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginTop: 0, marginBottom: 14 }}>
              Enter your username. A reset token will be generated — note it down and use it on the next step.
            </p>
            <div className="fg">
              <label className="fl">Username</label>
              <input className="fi" type="text" required autoFocus
                value={forgotUsername} onChange={e => setForgotUsername(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-p" type="submit" style={{ flex: 1 }}
                disabled={forgotPassword.isPending}>
                {forgotPassword.isPending ? 'Generating…' : 'Get Reset Token'}
              </button>
              <button type="button" className="btn"
                style={{ flex: 1, background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--bd)' }}
                onClick={() => setForgotStep('idle')}>
                Back
              </button>
            </div>
          </form>
        )}

        {forgotStep === 'reset' && (
          <form onSubmit={handleResetSubmit}>
            <p style={{ fontSize: 13, color: 'var(--t2)', marginTop: 0, marginBottom: 14 }}>
              Token generated. Enter it below along with your new password.
            </p>
            <div className="fg">
              <label className="fl">Reset Token</label>
              <input className="fi" type="text" required
                value={resetToken} onChange={e => setResetToken(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">New Password</label>
              <input className="fi" type="password" required minLength={8}
                value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="fg">
              <label className="fl">Confirm Password</label>
              <input className="fi" type="password" required minLength={8}
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-p" type="submit" style={{ flex: 1 }}
                disabled={resetPassword.isPending}>
                {resetPassword.isPending ? 'Resetting…' : 'Set New Password'}
              </button>
              <button type="button" className="btn"
                style={{ flex: 1, background: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--bd)' }}
                onClick={() => setForgotStep('idle')}>
                Cancel
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
