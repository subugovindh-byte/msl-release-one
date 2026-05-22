import { useCallback, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { useCollectionAccounts, useCreateCollectionAccount, useUpdateCollectionAccount } from '@/hooks/useApi';
import { DataGridTable } from '@/components/DataGridTable';
import { useToastStore } from '@/store';

type AccountKind = 'upi' | 'bank' | 'both';
type AccountType = 'savings' | 'current' | 'od' | 'cc';

interface AccountForm {
  name: string;
  kind: AccountKind;
  upi_id?: string;
  upi_name?: string;
  account_number?: string;
  ifsc?: string;
  bank_name?: string;
  branch?: string;
  account_holder?: string;
  account_type?: AccountType;
  is_default: boolean;
}

const blankForm = (): AccountForm => ({
  name: '', kind: 'upi', upi_id: '', upi_name: '',
  account_number: '', ifsc: '', bank_name: '', branch: '',
  account_holder: '', account_type: 'current', is_default: false,
});

const KIND_LABELS: Record<string, string> = { upi: 'UPI', bank: 'Bank', both: 'UPI + Bank' };

export function CollectionAccountsPage() {
  const { data: accountsData, isLoading } = useCollectionAccounts();
  const createAccount = useCreateCollectionAccount();
  const updateAccount = useUpdateCollectionAccount();
  const { notify } = useToastStore();

  const [showModal, setShowModal] = useState<'new' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(blankForm());

  const accounts: any[] = accountsData?.accounts || [];
  const activeAccounts = accounts.filter((a) => a.active);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { notify('Name required', 'error'); return; }
    if ((form.kind === 'upi' || form.kind === 'both') && !form.upi_id) { notify('UPI ID required', 'error'); return; }
    if ((form.kind === 'bank' || form.kind === 'both') && (!form.account_number || !form.ifsc)) { notify('Account # + IFSC required', 'error'); return; }
    try {
      if (showModal === 'new') {
        await createAccount.mutateAsync(form);
        notify(`${form.name} added`, 'success');
      } else if (editingId) {
        await updateAccount.mutateAsync({ id: editingId, data: form });
        notify('Account updated', 'success');
      }
      setShowModal(null); setEditingId(null); setForm(blankForm());
    } catch (err: any) {
      notify(err.message || 'Operation failed', 'error');
    }
  };

  const handleEdit = useCallback((account: any) => {
    setEditingId(account.id);
    setForm({ name: account.name, kind: account.kind, upi_id: account.upi_id || '', upi_name: account.upi_name || '', account_number: account.account_number || '', ifsc: account.ifsc || '', bank_name: account.bank_name || '', branch: account.branch || '', account_holder: account.account_holder || '', account_type: account.account_type || 'current', is_default: account.is_default || false });
    setShowModal('edit');
  }, []);

  const handleSetDefault = useCallback(async (id: string) => {
    try { await updateAccount.mutateAsync({ id, data: { is_default: true } }); notify('Default account updated', 'success'); }
    catch (err: any) { notify(err.message || 'Failed to set default', 'error'); }
  }, [updateAccount, notify]);

  const handleDeactivate = useCallback(async (account: any) => {
    if (!confirm(`Deactivate "${account.name}"?`)) return;
    if (activeAccounts.length <= 1) { notify('Cannot deactivate last active account', 'error'); return; }
    try { await updateAccount.mutateAsync({ id: account.id, data: { active: false } }); notify(`${account.name} deactivated`, 'success'); }
    catch (err: any) { notify(err.message || 'Deactivation failed', 'error'); }
  }, [updateAccount, notify, activeAccounts.length]);

  const handleReactivate = useCallback(async (account: any) => {
    try { await updateAccount.mutateAsync({ id: account.id, data: { active: true } }); notify(`${account.name} reactivated`, 'success'); }
    catch (err: any) { notify(err.message || 'Reactivation failed', 'error'); }
  }, [updateAccount, notify]);

  const colDefs = useMemo<ColDef[]>(() => [
    { headerName: 'ID', field: 'id', minWidth: 80 },
    {
      headerName: 'Name',
      field: 'name',
      minWidth: 180,
      flex: 1,
      cellRenderer: (p: any) => (
        <span>
          {p.value}
          {p.data?.is_default && (
            <span style={{ marginLeft: 6, padding: '1px 5px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: 6, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>DEFAULT</span>
          )}
        </span>
      ),
    },
    {
      headerName: 'Kind',
      field: 'kind',
      minWidth: 110,
      cellRenderer: (p: any) => (
        <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg3)', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
          {KIND_LABELS[p.value] || p.value}
        </span>
      ),
    },
    {
      headerName: 'UPI / Bank',
      colId: 'upi_bank',
      minWidth: 200,
      flex: 2,
      cellRenderer: (p: any) => {
        const a = p.data;
        return (
          <div style={{ lineHeight: 1.6 }}>
            {a?.upi_id && <div style={{ color: 'var(--amber)', fontSize: 11 }}>{a.upi_id}</div>}
            {a?.account_number && (
              <div style={{ color: 'var(--t2)', fontSize: 10 }}>
                {a.bank_name || ''} · {'****' + a.account_number.slice(-4)} · {a.ifsc || ''}
              </div>
            )}
          </div>
        );
      },
    },
    {
      headerName: 'Status',
      field: 'active',
      minWidth: 100,
      cellRenderer: (p: any) => (
        <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
          {p.value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      headerName: 'Actions',
      colId: 'actions',
      minWidth: 220,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (p: any) => {
        const account = p.data;
        return (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}>
            <button onClick={() => handleEdit(account)} style={{ padding: '3px 10px', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 11, backgroundColor: 'var(--bg3)', color: 'var(--t1)' }}>Edit</button>
            {account?.active && !account?.is_default && (
              <button onClick={() => handleSetDefault(account.id)} style={{ padding: '3px 10px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Default</button>
            )}
            {account?.active ? (
              <button onClick={() => handleDeactivate(account)} style={{ padding: '3px 10px', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: 'var(--t2)', backgroundColor: 'transparent' }}>Deactivate</button>
            ) : (
              <button onClick={() => handleReactivate(account)} style={{ padding: '3px 10px', backgroundColor: 'var(--bg3)', color: 'var(--t2)', border: '1px solid var(--bd)', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Reactivate</button>
            )}
          </div>
        );
      },
    },
  ], [handleEdit, handleSetDefault, handleDeactivate, handleReactivate]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: '8px' }}>Bank / UPI Accounts</h1>
          <p style={{ color: 'var(--t3)', fontSize: '13px', marginBottom: '0' }}>
            Where funds are received · {activeAccounts.length} active
          </p>
        </div>
        <button onClick={() => { setForm(blankForm()); setEditingId(null); setShowModal('new'); }} style={{ padding: '10px 20px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
          + New Account
        </button>
      </div>

      {isLoading ? (
        <p style={{ color: 'var(--t3)' }}>Loading accounts...</p>
      ) : (
        <DataGridTable
          rowData={accounts}
          columnDefs={colDefs}
          getRowId={(p) => String(p.data.id)}
          emptyMessage="No accounts found."
          height={420}
        />
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '14px', overflowY: 'auto' }} onClick={(e) => e.target === e.currentTarget && setShowModal(null)}>
          <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: '10px', width: '100%', maxWidth: '440px' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '14px' }}>
                {showModal === 'new' ? 'New Collection Account' : `Edit ${accounts.find((a) => a.id === editingId)?.name}`}
              </span>
              <button onClick={() => setShowModal(null)} style={{ color: 'var(--t3)', fontSize: '15px', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSave} style={{ padding: '14px 16px' }}>
              <div className="fg"><label className="fl">Display Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} placeholder="e.g. HDFC Current — Main" className="fi" /></div>
              <div className="fg">
                <label className="fl">Kind *</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AccountKind })} disabled={showModal === 'edit'} className="fsel">
                  <option value="upi">UPI only</option>
                  <option value="bank">Bank only</option>
                  <option value="both">UPI + Bank</option>
                </select>
              </div>

              {(form.kind === 'upi' || form.kind === 'both') && (
                <>
                  <div className="fg"><label className="fl">UPI ID *</label><input type="text" value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="name@bank" className="fi" /></div>
                  <div className="fg"><label className="fl">Payee Name</label><input type="text" value={form.upi_name} onChange={(e) => setForm({ ...form, upi_name: e.target.value })} placeholder="Shown in UPI app" className="fi" /></div>
                </>
              )}

              {(form.kind === 'bank' || form.kind === 'both') && (
                <>
                  <div className="fg"><label className="fl">Account Number *</label><input type="text" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/\s/g, '') })} className="fi" /></div>
                  <div className="fg"><label className="fl">IFSC *</label><input type="text" value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} maxLength={11} placeholder="HDFC0001234" className="fi" /></div>
                  <div className="fg"><label className="fl">Bank Name</label><input type="text" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="HDFC Bank" className="fi" /></div>
                  <div className="fg"><label className="fl">Branch</label><input type="text" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="fi" /></div>
                  <div className="fg"><label className="fl">Account Holder</label><input type="text" value={form.account_holder} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} placeholder="Modernex Stones LLP" className="fi" /></div>
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: '10px 0' }}>
                <input type="checkbox" id="isDefault" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} style={{ accentColor: 'var(--rust)' }} />
                <label htmlFor="isDefault" className="fl" style={{ margin: 0, cursor: 'pointer' }}>Set as default collection account</label>
              </div>

              <div style={{ display: 'flex', gap: '7px', marginTop: '16px' }}>
                <button type="submit" disabled={createAccount.isPending || updateAccount.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: '4px', cursor: (createAccount.isPending || updateAccount.isPending) ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {showModal === 'new' ? 'Create' : 'Save'}
                </button>
                <button type="button" onClick={() => setShowModal(null)} style={{ padding: '10px 24px', border: '1px solid var(--bd)', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
