import { useState, useEffect } from 'react';
import { useMyProfile, useUpdateProfile, useChangeOwnPassword, useSetPasswordRecovery } from '@/hooks/useApi';
import { useToastStore } from '@/store';
import { PageHeader } from '@/components/Shared';

export function ProfilePage() {
  const { notify } = useToastStore();
  const { data, isLoading } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangeOwnPassword();
  const setPasswordRecovery = useSetPasswordRecovery();

  const user = (data as any)?.user ?? {};

  const [profile, setProfile] = useState({
    full_name: '', email: '', phone: '', address: '', contact: '',
  });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [recovery, setRecovery] = useState({ current: '', hint: '', answer: '' });
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => {
    if (user.full_name !== undefined) {
      setProfile({
        full_name: user.full_name ?? '',
        email: user.email ?? '',
        phone: user.phone ?? '',
        address: user.address ?? '',
        contact: user.contact ?? '',
      });
    }
  }, [user.full_name, user.email, user.phone, user.address, user.contact]);

  function setP(k: string, v: string) {
    setProfile(f => ({ ...f, [k]: v }));
    setProfileDirty(true);
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile.mutateAsync(profile);
      notify('Profile updated', 'success');
      setProfileDirty(false);
    } catch (err: any) { notify(err.message || 'Failed to update profile', 'error'); }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) { notify('New passwords do not match', 'error'); return; }
    if (pw.next.length < 8) { notify('Password must be at least 8 characters', 'error'); return; }
    try {
      await changePassword.mutateAsync({ current_password: pw.current, new_password: pw.next });
      notify('Password changed successfully', 'success');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err: any) { notify(err.message || 'Failed to change password', 'error'); }
  }

  async function saveRecovery(e: React.FormEvent) {
    e.preventDefault();
    try {
      await setPasswordRecovery.mutateAsync({
        current_password: recovery.current,
        hint: recovery.hint,
        answer: recovery.answer,
      });
      notify('Password recovery hint and answer saved', 'success');
      setRecovery({ current: '', hint: '', answer: '' });
    } catch (err: any) { notify(err.message || 'Failed to save recovery details', 'error'); }
  }

  if (isLoading) return <div className="page"><p style={{ color: 'var(--t3)' }}>Loading…</p></div>;

  return (
    <div className="page">
      <PageHeader title="My Profile" subtitle="Update your personal details and password" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 24, alignItems: 'start' }}>

        {/* ── Profile details ── */}
        <div style={card}>
          <div style={sectionTitle}>Personal Details</div>

          {/* Read-only info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <Info label="Username" value={user.username} />
            <Info label="Role" value={user.role} />
            <Info label="Last Login" value={user.last_login ? new Date(user.last_login).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} />
            <Info label="Member Since" value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'} />
          </div>

          <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Full Name *">
              <input className="fi" type="text" required value={profile.full_name}
                onChange={e => setP('full_name', e.target.value)} placeholder="Your full name" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Email">
                <input className="fi" type="email" value={profile.email}
                  onChange={e => setP('email', e.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="Phone">
                <input className="fi" type="tel" value={profile.phone}
                  onChange={e => setP('phone', e.target.value)} placeholder="+91 98765 43210" />
              </Field>
            </div>
            <Field label="Contact Person / Alt. Name">
              <input className="fi" type="text" value={profile.contact}
                onChange={e => setP('contact', e.target.value)} placeholder="Alternate contact name" />
            </Field>
            <Field label="Address">
              <textarea className="fi" rows={3} value={profile.address}
                onChange={e => setP('address', e.target.value)} placeholder="Your address…" />
            </Field>

            <button type="submit" className="btn btn-p"
              disabled={updateProfile.isPending || !profileDirty}
              style={{ alignSelf: 'flex-start' }}>
              {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>

        <div style={card}>
          <div style={sectionTitle}>Password Recovery</div>
          <p style={{ color: 'var(--t3)', fontSize: 12, marginTop: -8 }}>
            Set a private answer and a reminder hint. The answer is stored as a one-way hash.
          </p>
          {user.password_recovery_hint && (
            <p style={{ color: 'var(--t2)', fontSize: 13 }}>Current hint: <strong>{user.password_recovery_hint}</strong></p>
          )}
          <form onSubmit={saveRecovery} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Current Password *">
              <input className="fi" type="password" required autoComplete="current-password" value={recovery.current}
                onChange={e => setRecovery(r => ({ ...r, current: e.target.value }))} />
            </Field>
            <Field label="Recovery Hint *">
              <input className="fi" type="text" required minLength={3} maxLength={120} value={recovery.hint}
                onChange={e => setRecovery(r => ({ ...r, hint: e.target.value }))} placeholder="A reminder only you understand" />
            </Field>
            <Field label="Recovery Answer *">
              <input className="fi" type="password" required minLength={2} maxLength={200} value={recovery.answer}
                onChange={e => setRecovery(r => ({ ...r, answer: e.target.value }))} autoComplete="off" />
            </Field>
            <button type="submit" className="btn btn-p" disabled={setPasswordRecovery.isPending || !recovery.current || !recovery.hint || !recovery.answer} style={{ alignSelf: 'flex-start' }}>
              {setPasswordRecovery.isPending ? 'Saving…' : 'Save Recovery Details'}
            </button>
          </form>
        </div>

        {/* ── Change password ── */}
        <div style={card}>
          <div style={sectionTitle}>Change Password</div>
          <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Current Password *">
              <input className="fi" type="password" required value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                autoComplete="current-password" placeholder="••••••••" />
            </Field>
            <Field label="New Password *">
              <input className="fi" type="password" required minLength={8} value={pw.next}
                onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                autoComplete="new-password" placeholder="Min 8 characters" />
            </Field>
            <Field label="Confirm New Password *">
              <input className="fi" type="password" required value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                autoComplete="new-password" placeholder="Repeat new password" />
              {pw.confirm && pw.next !== pw.confirm && (
                <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 3, display: 'block' }}>
                  Passwords do not match
                </span>
              )}
            </Field>

            <button type="submit" className="btn btn-p"
              disabled={changePassword.isPending || !pw.current || !pw.next || !pw.confirm}
              style={{ alignSelf: 'flex-start' }}>
              {changePassword.isPending ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="fl">{label}</label>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: 6, border: '1px solid var(--bd)' }}>
      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>{value || '—'}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 24,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase',
  letterSpacing: '0.5px', marginBottom: 20, paddingBottom: 10, borderBottom: '1px solid var(--bd)',
};
