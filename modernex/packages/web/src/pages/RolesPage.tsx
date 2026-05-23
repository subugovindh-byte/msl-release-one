import { useState } from 'react';
import { useRoles, usePermissions, useCreateRole, useUpdateRole, useDeleteRole } from '@/hooks/useApi';
import { useAuthStore, useToastStore } from '@/store';
import type { Role, Permission } from '@/types';

const RESOURCES = ['pos', 'inventory', 'invoices', 'purchases', 'payments', 'payroll', 'reports', 'users', 'settings'];

const RESOURCE_LABEL: Record<string, string> = {
  pos: 'POS', inventory: 'Inventory', invoices: 'Invoices', purchases: 'Purchases',
  payments: 'Payments', payroll: 'Payroll', reports: 'Reports', users: 'Users', settings: 'Settings',
};

type Panel = { mode: 'create' } | { mode: 'edit'; role: Role } | null;

const BLANK = { name: '', description: '' };

export function RolesPage() {
  const { user: me } = useAuthStore();
  const { notify } = useToastStore();
  const { data: rolesData, isLoading: rolesLoading } = useRoles();
  const { data: permsData, isLoading: permsLoading } = usePermissions();
  const createRole  = useCreateRole();
  const updateRole  = useUpdateRole();
  const deleteRole  = useDeleteRole();

  const [panel, setPanel] = useState<Panel>(null);
  const [form, setForm]   = useState({ ...BLANK });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  if (me?.role !== 'admin') {
    return <div className="page"><h1>Access Denied</h1></div>;
  }

  const roles: Role[] = rolesData?.roles ?? [];
  const permissions: Permission[] = permsData?.permissions ?? [];

  // Group permissions by resource
  const byResource: Record<string, Permission[]> = {};
  for (const p of permissions) (byResource[p.resource] ??= []).push(p);

  const openCreate = () => {
    setForm({ ...BLANK });
    setSelected(new Set());
    setPanel({ mode: 'create' });
  };

  const openEdit = (role: Role) => {
    setForm({ name: role.name, description: role.description ?? '' });
    setSelected(new Set((role.permissions ?? []).map(p => p.id)));
    setPanel({ mode: 'edit', role });
  };

  const togglePerm = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleResource = (resource: string) => {
    const resourcePerms = byResource[resource] ?? [];
    const allSelected = resourcePerms.every(p => selected.has(p.id));
    setSelected(prev => {
      const next = new Set(prev);
      for (const p of resourcePerms) allSelected ? next.delete(p.id) : next.add(p.id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (panel?.mode === 'create') {
        await createRole.mutateAsync({ name: form.name, description: form.description || undefined, permission_ids: [...selected] });
        notify(`Role "${form.name}" created`, 'success');
      } else if (panel?.mode === 'edit') {
        await updateRole.mutateAsync({ id: panel.role.id, description: form.description || undefined, permission_ids: [...selected] });
        notify('Role updated', 'success');
      }
      setPanel(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleDelete = async (role: Role) => {
    try {
      await deleteRole.mutateAsync(role.id);
      notify(`Role "${role.name}" deleted`, 'success');
      setConfirmDelete(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const isLoading = rolesLoading || permsLoading;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 8 }}>Roles & Permissions</h1>
          <p style={{ color: 'var(--t3)', fontSize: 13, marginBottom: 0 }}>
            Define what each role can access. System roles can have permissions edited but cannot be renamed or deleted.
          </p>
        </div>
        <button onClick={openCreate}
          style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          + New Role
        </button>
      </div>

      {/* ── Create / Edit panel ── */}
      {panel && (
        <div style={panelStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>
            {panel.mode === 'create' ? 'Create Role' : `Edit — ${(panel as any).role.name}`}
          </h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label className="fl">Role Name *</label>
                <input className="fi" type="text" required minLength={2}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={panel.mode === 'edit' && !!(panel as any).role.is_system}
                  placeholder="e.g. supervisor" />
                {panel.mode === 'create' && (
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>Lowercase letters, numbers, _ - only</span>
                )}
              </div>
              <div>
                <label className="fl">Description</label>
                <input className="fi" type="text" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What this role is for" />
              </div>
            </div>

            {/* ── Permissions matrix ── */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--t2)' }}>Permissions</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {RESOURCES.map(resource => {
                  const perms = byResource[resource] ?? [];
                  if (!perms.length) return null;
                  const allSel = perms.every(p => selected.has(p.id));
                  const someSel = perms.some(p => selected.has(p.id));
                  return (
                    <div key={resource} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg1)', borderRadius: 6, border: '1px solid var(--bd)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 100, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel && !allSel; }}
                          onChange={() => toggleResource(resource)} style={{ width: 14, height: 14 }} />
                        {RESOURCE_LABEL[resource] ?? resource}
                      </label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {perms.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 12, color: 'var(--t2)' }}>
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePerm(p.id)} style={{ width: 13, height: 13 }} />
                            {p.action}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit"
                disabled={createRole.isPending || updateRole.isPending}
                style={btn('var(--rust)', true)}>
                {(createRole.isPending || updateRole.isPending) ? 'Saving…' : panel.mode === 'create' ? 'Create Role' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setPanel(null)} style={btn('var(--t3)', true)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirmDelete && (
        <div style={{ ...panelStyle, background: 'var(--redW)', borderColor: 'var(--redB)' }}>
          <p style={{ margin: '0 0 14px', fontWeight: 600 }}>Delete role <strong>{confirmDelete.name}</strong>?</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => handleDelete(confirmDelete)} disabled={deleteRole.isPending} style={btn('var(--red)', true)}>
              {deleteRole.isPending ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button onClick={() => setConfirmDelete(null)} style={btn('var(--t3)', true)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p style={{ color: 'var(--t3)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {roles.map(role => (
            <div key={role.id} style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{role.name}</span>
                    {!!role.is_system && (
                      <span style={{ fontSize: 10, padding: '1px 7px', background: 'var(--blueW)', color: 'var(--blue)', borderRadius: 10, fontWeight: 700 }}>system</span>
                    )}
                  </div>
                  {role.description && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--t3)' }}>{role.description}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEdit(role)} style={btn('var(--blue)')}>Edit Permissions</button>
                  {!role.is_system && (
                    <button onClick={() => setConfirmDelete(role)} style={btn('var(--red)')}>Delete</button>
                  )}
                </div>
              </div>

              {/* Permission pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(role.permissions ?? []).length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--t3)' }}>No permissions assigned</span>
                )}
                {(role.permissions ?? []).map(p => (
                  <span key={p.id} style={{
                    fontSize: 11, padding: '2px 8px',
                    background: 'var(--bg3)', color: 'var(--t2)',
                    border: '1px solid var(--bd)', borderRadius: 10,
                  }}>
                    {p.resource}:{p.action}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
