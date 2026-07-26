import { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import {
  useUsers, useCreateUser, useUpdateUser,
  useDeleteUser, useResetUserPassword, useUnlockUser, useResetAllPasswords,
  useRoles, useAssignUserRoles,
} from '@/hooks/useApi';
import { useAuthStore, useToastStore } from '@/store';
import { DataGridTable } from '@/components/DataGridTable';

const ROLES = [
  { value: 'admin',    label: 'Admin',    desc: 'Full system access — users, settings, all modules' },
  { value: 'accounts', label: 'Accounts', desc: 'Finance: invoices, payments, payroll, GST, reports' },
  { value: 'sales',    label: 'Sales',    desc: 'POS, invoices, customers, payments (read)' },
  { value: 'yard',     label: 'Yard',     desc: 'Inventory, production, slab photos, purchase orders (read)' },
] as const;
type Role = typeof ROLES[number]['value'];

const BADGE: Record<Role, { bg: string; color: string }> = {
  admin:    { bg: 'var(--rustW)',  color: 'var(--rust)'  },
  accounts: { bg: 'var(--blueW)', color: 'var(--blue)'  },
  sales:    { bg: 'var(--sageW)', color: 'var(--sage)'  },
  yard:     { bg: 'var(--goldW)', color: 'var(--gold)'  },
};

const BLANK_CREATE = { username: '', full_name: '', email: '', password: '', role: 'accounts' as Role, must_change_password: true };
const BLANK_EDIT   = { full_name: '', email: '', phone: '', role: 'accounts' as Role };

type Panel = { mode: 'create' } | { mode: 'edit'; user: any } | { mode: 'roles'; user: any } | { mode: 'reset-all' } | null;

export function UsersPage() {
  const { user: me } = useAuthStore();
  const { data: usersData, isLoading } = useUsers();
  const createUser      = useCreateUser();
  const updateUser      = useUpdateUser();
  const deleteUser      = useDeleteUser();
  const resetPassword   = useResetUserPassword();
  const unlockUser      = useUnlockUser();
  const { notify }      = useToastStore();

  const resetAllPasswords = useResetAllPasswords();
  const { data: rolesData } = useRoles();
  const assignUserRoles     = useAssignUserRoles();
  const allRoles = rolesData?.roles ?? [];

  const [roleAssignment, setRoleAssignment] = useState<Set<number>>(new Set());

  const [panel, setPanel]         = useState<Panel>(null);
  const [createForm, setCreateForm] = useState({ ...BLANK_CREATE });
  const [editForm, setEditForm]   = useState({ ...BLANK_EDIT });
  const [resetAllPw, setResetAllPw] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [tempPassword, setTempPassword]   = useState<string | null>(null);

  if (me?.role !== 'admin') {
    return <div className="page"><h1>Access Denied</h1><p>Only administrators can manage users.</p></div>;
  }

  const users: any[] = usersData?.users || [];

  const openEdit = (u: any) => {
    setEditForm({ full_name: u.full_name || '', email: u.email || '', phone: u.phone || '', role: u.role });
    setPanel({ mode: 'edit', user: u });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { username: createForm.username, full_name: createForm.full_name, role: createForm.role, must_change_password: createForm.must_change_password };
      if (createForm.password) payload.password = createForm.password;
      if (createForm.email)    payload.email    = createForm.email;
      const res: any = await createUser.mutateAsync(payload);
      if (res?.generated_password) {
        setTempPassword(res.generated_password);
      } else {
        notify('User created', 'success');
      }
      setPanel(null);
      setCreateForm({ ...BLANK_CREATE });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (panel?.mode !== 'edit') return;
    try {
      await updateUser.mutateAsync({ id: panel.user.id, ...editForm });
      notify('User updated', 'success');
      setPanel(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleToggleActive = async (u: any) => {
    try {
      await updateUser.mutateAsync({ id: u.id, active: !u.active });
      notify(u.active ? 'User deactivated' : 'User reactivated', 'success');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleDelete = async (u: any) => {
    try {
      await deleteUser.mutateAsync(u.id);
      notify('User removed', 'success');
      setConfirmDelete(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleReset = async (u: any) => {
    try {
      const res: any = await resetPassword.mutateAsync({ id: u.id, must_change: true });
      setTempPassword(res?.generated_password || null);
      if (!res?.generated_password) notify('Password reset — new password sent', 'success');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleUnlock = async (u: any) => {
    try {
      await unlockUser.mutateAsync(u.id);
      notify('Account unlocked', 'success');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleResetAll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res: any = await resetAllPasswords.mutateAsync(resetAllPw);
      notify(`Password reset for ${res.count} user(s). They must change it on next login.`, 'success');
      setPanel(null);
      setResetAllPw('');
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const openRoles = (u: any) => {
    const current = new Set<number>((u.roles ?? []).map((r: any) => r.id));
    setRoleAssignment(current);
    setPanel({ mode: 'roles', user: u });
  };

  const handleAssignRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (panel?.mode !== 'roles') return;
    if (!roleAssignment.size) { notify('Select at least one role', 'error'); return; }
    try {
      await assignUserRoles.mutateAsync({ userId: panel.user.id, role_ids: [...roleAssignment] });
      notify('Roles updated', 'success');
      setPanel(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const colDefs = useMemo<ColDef[]>(() => [
    {
      headerName: 'Username', field: 'username', minWidth: 140, pinned: 'left',
      cellRenderer: (p: any) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {p.value}
          {p.data?.id === me?.id && <span style={{ fontSize: 10, color: 'var(--t3)' }}>(you)</span>}
          {p.data?.locked_until && new Date(p.data.locked_until) > new Date() &&
            <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>LOCKED</span>}
        </span>
      ),
    },
    { headerName: 'Full Name', field: 'full_name', minWidth: 170, flex: 1, valueFormatter: p => p.value || '—' },
    { headerName: 'Email',     field: 'email',     minWidth: 190, flex: 1, valueFormatter: p => p.value || '—' },
    {
      headerName: 'Roles', field: 'roles', minWidth: 160, flex: 1,
      cellDataType: false,
      valueFormatter: (p: any) => {
        const roles: any[] = p.value ?? [];
        return roles.length ? roles.map((r: any) => r.name).join(', ') : (p.data?.role ?? '—');
      },
      cellRenderer: (p: any) => {
        const roles: any[] = p.value ?? [];
        if (!roles.length) {
          const c = BADGE[p.data?.role as Role] ?? { bg: 'var(--bg3)', color: 'var(--t2)' };
          return <span style={{ padding: '2px 8px', background: c.bg, color: c.color, borderRadius: 10, fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>{p.data?.role}</span>;
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', height: '100%' }}>
            {roles.map((r: any) => {
              const c = BADGE[r.name as Role] ?? { bg: 'var(--bg3)', color: 'var(--t2)' };
              return <span key={r.id} style={{ padding: '1px 7px', background: c.bg, color: c.color, borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: 'capitalize' }}>{r.name}</span>;
            })}
          </div>
        );
      },
    },
    {
      headerName: 'Status', field: 'active', minWidth: 85,
      cellRenderer: (p: any) => (
        <span style={{ color: p.value ? 'var(--sage)' : 'var(--t3)', fontWeight: 600, fontSize: 12 }}>
          {p.value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { headerName: 'Last Login', field: 'last_login', minWidth: 120, valueFormatter: p => p.value ? new Date(p.value).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Never' },
    {
      headerName: 'Actions', minWidth: 280, sortable: false, filter: false,
      cellRenderer: (p: any) => {
        const u = p.data;
        const isMe = u.id === me?.id;
        const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: '100%' }}>
            <button onClick={() => openEdit(u)} style={gbtn()}>✎ Edit</button>
            <button onClick={() => openRoles(u)} style={gbtn()}>⊞ Roles</button>
            <button onClick={() => handleReset(u)} style={gbtn()}>↻ Reset PW</button>
            {isLocked && <button onClick={() => handleUnlock(u)} style={gbtn('var(--amber)')}>⊙ Unlock</button>}
            {!isMe && (
              <button onClick={() => u.active ? handleToggleActive(u) : setConfirmDelete(u)}
                style={gbtn(u.active ? 'var(--red)' : 'var(--sage)')}>
                {u.active ? '✕ Deactivate' : '✓ Reactivate'}
              </button>
            )}
          </div>
        );
      },
    },
  ], [me?.id]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 8 }}>User Management</h1>
          <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 0 }}>Each person gets their own login — no shared accounts</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setPanel({ mode: 'reset-all' }); setResetAllPw(''); }}
            style={{ padding: '10px 18px', background: 'transparent', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            ↻ Reset All Passwords
          </button>
          <button onClick={() => { setPanel({ mode: 'create' }); setCreateForm({ ...BLANK_CREATE }); }}
            style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            + New User
          </button>
        </div>
      </div>

      {/* ── Temp password display ── */}
      {tempPassword && (
        <div style={{ background: 'var(--amberW)', border: '1px solid var(--amberB)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <strong style={{ color: 'var(--amber)' }}>Temporary password (shown once):</strong>
          <code style={{ display: 'block', fontSize: 18, letterSpacing: 2, margin: '8px 0', color: 'var(--t1)' }}>{tempPassword}</code>
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>Share this with the user securely. They will be prompted to change it on first login.</span>
          <button onClick={() => setTempPassword(null)} style={{ marginLeft: 16, padding: '2px 10px', border: '1px solid var(--amberB)', borderRadius: 4, background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
        </div>
      )}

      {/* ── Create panel ── */}
      {panel?.mode === 'create' && (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>New User</h3>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="fl">Username *</label>
                <input className="fi" type="text" value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
                  required minLength={3} pattern="[a-zA-Z0-9_.-]+" placeholder="e.g. raj.kumar" title="Letters, numbers, _ . - only" />
              </div>
              <div>
                <label className="fl">Full Name *</label>
                <input className="fi" type="text" value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))} required placeholder="Raj Kumar" />
              </div>
              <div>
                <label className="fl">Email</label>
                <input className="fi" type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="raj@company.com" />
              </div>
              <div>
                <label className="fl">Role *</label>
                <select className="fsel" value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as Role }))} required>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="fl">Password <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(blank = auto-generate)</span></label>
                <input className="fi" type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} minLength={8} placeholder="Min 8 chars" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                <input type="checkbox" id="mcp" checked={createForm.must_change_password} onChange={e => setCreateForm(f => ({ ...f, must_change_password: e.target.checked }))} style={{ width: 15, height: 15 }} />
                <label htmlFor="mcp" style={{ fontSize: 13, cursor: 'pointer' }}>Force password change on first login</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={createUser.isPending} style={btn('var(--rust)', true)}>{createUser.isPending ? 'Creating…' : 'Create User'}</button>
              <button type="button" onClick={() => setPanel(null)} style={btn('var(--t3)', true)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Reset All panel ── */}
      {panel?.mode === 'reset-all' && (
        <div style={{ ...panelStyle, background: 'var(--amberW)', borderColor: 'var(--amberB)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 6, color: 'var(--amber)' }}>Reset All User Passwords</h3>
          <p style={{ fontSize: 13, color: 'var(--t2)', marginTop: 0, marginBottom: 16 }}>
            Sets the same password for <strong>all active users except you</strong>. They will be forced to change it on next login.
          </p>
          <form onSubmit={handleResetAll}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label className="fl">New Password for All Users *</label>
                <input className="fi" type="password" value={resetAllPw}
                  onChange={e => setResetAllPw(e.target.value)}
                  required minLength={8} placeholder="Min 8 characters" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={resetAllPasswords.isPending} style={btn('var(--amber)', true)}>
                  {resetAllPasswords.isPending ? 'Resetting…' : 'Reset All'}
                </button>
                <button type="button" onClick={() => setPanel(null)} style={btn('var(--t3)', true)}>Cancel</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── Role assignment panel ── */}
      {panel?.mode === 'roles' && (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>Assign Roles — {panel.user.username}</h3>
          <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 0, marginBottom: 16 }}>
            Select one or more roles. Effective permissions are the union of all assigned roles.
          </p>
          <form onSubmit={handleAssignRoles}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
              {allRoles.map((r: any) => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--bg1)', border: `1px solid ${roleAssignment.has(r.id) ? 'var(--rust)' : 'var(--bd)'}`, borderRadius: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={roleAssignment.has(r.id)}
                    onChange={() => setRoleAssignment(prev => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                    style={{ marginTop: 2, width: 14, height: 14 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, textTransform: 'capitalize' }}>{r.name}
                      {!!r.is_system && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--t3)' }}>system</span>}
                    </div>
                    {r.description && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{r.description}</div>}
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {(r.permissions ?? []).slice(0, 6).map((p: any) => (
                        <span key={p.id} style={{ fontSize: 9, padding: '1px 5px', background: 'var(--bg3)', color: 'var(--t2)', borderRadius: 8 }}>{p.resource}:{p.action}</span>
                      ))}
                      {(r.permissions ?? []).length > 6 && <span style={{ fontSize: 9, color: 'var(--t3)' }}>+{r.permissions.length - 6} more</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={assignUserRoles.isPending} style={btn('var(--rust)', true)}>
                {assignUserRoles.isPending ? 'Saving…' : 'Save Roles'}
              </button>
              <button type="button" onClick={() => setPanel(null)} style={btn('var(--t3)', true)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Edit panel ── */}
      {panel?.mode === 'edit' && (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>Edit — {panel.user.username}</h3>
          <p style={{ color: 'var(--t3)', fontSize: 12, marginTop: 0, marginBottom: 16 }}>Username cannot be changed. Use Reset PW for password changes.</p>
          <form onSubmit={handleEdit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label className="fl">Full Name *</label>
                <input className="fi" type="text" value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} required />
              </div>
              <div>
                <label className="fl">Email</label>
                <input className="fi" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="fl">Phone</label>
                <input className="fi" type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="fl">Role</label>
                <select className="fsel" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as Role }))}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={updateUser.isPending} style={btn('var(--rust)', true)}>{updateUser.isPending ? 'Saving…' : 'Save Changes'}</button>
              <button type="button" onClick={() => setPanel(null)} style={btn('var(--t3)', true)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Confirm deactivate ── */}
      {confirmDelete && (
        <div style={{ ...panelStyle, background: 'var(--redW)', borderColor: 'var(--redB)' }}>
          <p style={{ margin: '0 0 14px', fontWeight: 600 }}>Deactivate <strong>{confirmDelete.username}</strong>?</p>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--t2)' }}>
            Their account is soft-deleted — they cannot log in, but all their audit records are preserved. You can reactivate later.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => handleDelete(confirmDelete)} disabled={deleteUser.isPending} style={btn('var(--red)', true)}>{deleteUser.isPending ? 'Removing…' : 'Yes, Deactivate'}</button>
            <button onClick={() => setConfirmDelete(null)} style={btn('var(--t3)', true)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--t3)' }}>Loading users…</p>
      ) : (
        <DataGridTable rowData={users} columnDefs={colDefs} getRowId={p => String(p.data.id)} emptyMessage="No users yet." height={460} />
      )}

      <div style={{ marginTop: 28, padding: 16, backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8 }}>
        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: 14 }}>Roles</h3>
        <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
          {ROLES.map(r => {
            const c = BADGE[r.value];
            return (
              <div key={r.value} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ padding: '1px 8px', background: c.bg, color: c.color, borderRadius: 10, fontSize: 11, fontWeight: 700, minWidth: 60, textAlign: 'center' }}>{r.label}</span>
                <span style={{ color: 'var(--t2)' }}>{r.desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)',
  borderRadius: 8, padding: 20, marginBottom: 20,
};

function btn(color: string, large = false): React.CSSProperties {
  return {
    padding: large ? '9px 20px' : '4px 10px',
    backgroundColor: color, color: 'white',
    border: 'none', borderRadius: large ? 5 : 4,
    cursor: 'pointer', fontWeight: 600,
    fontSize: large ? 13 : 11, whiteSpace: 'nowrap',
  };
}

// Neutral ghost row-action button; pass an accent for text-only emphasis.
function gbtn(accent?: string): React.CSSProperties {
  return {
    padding: '4px 10px', background: 'transparent', color: accent || 'var(--t2)',
    border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer',
    fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
  };
}
