import { useState } from 'react';
import { usePDCs, usePDCsDueToday, useCreatePDC, useUpdatePDCStatus, useCustomers, useVendors } from '@/hooks/useApi';
import { formatINR, numericInputValue, selectOnFocus } from '@/utils/format';
import { useToastStore } from '@/store';

type ViewType = 'all' | 'received' | 'issued' | 'due';

const STATUS_COLORS: Record<string, string> = {
  pending: '#f57f17', deposited: '#1565c0', cleared: '#2e7d32', returned: '#c62828', cancelled: 'var(--t3)',
};
const BLANK_PDC = { type: 'received', cheque_no: '', bank_name: '', branch: '', amount_paise: 0, cheque_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), customer_id: '', vendor_id: '', invoice_id: '', notes: '' };

export function PdcPage() {
  const [view, setView] = useState<ViewType>('received');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...BLANK_PDC });
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState('deposited');
  const { notify } = useToastStore();

  const { data: pdcData } = usePDCs({ type: view !== 'all' && view !== 'due' ? view : undefined });
  const { data: dueData } = usePDCsDueToday();
  const { data: customersData } = useCustomers({});
  const { data: vendorsData } = useVendors({});
  const createPdc = useCreatePDC();
  const updateStatus = useUpdatePDCStatus(updatingId || '');

  const pdcs: any[] = (view === 'due' ? dueData?.due : pdcData?.pdcs) || [];
  const customers: any[] = customersData?.customers || [];
  const vendors: any[] = (vendorsData as any)?.vendors || [];
  const dueCount = dueData?.due?.length || 0;

  const pendingAmt = pdcs.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount_paise, 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createPdc.mutateAsync({ ...form, amount_paise: Math.round(form.amount_paise * 100) });
      notify('PDC recorded', 'success');
      setShowCreate(false);
      setForm({ ...BLANK_PDC });
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  const handleUpdateStatus = async () => {
    try {
      await updateStatus.mutateAsync({ status: newStatus });
      notify(`Status updated to ${newStatus}`, 'success');
      setUpdatingId(null);
    } catch (err: any) { notify(err.message || 'Failed', 'error'); }
  };

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Post-Dated Cheques</h1>
        <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>Track received and issued PDCs · Deposit reminders</p>
      </div>

      {/* Summary banner */}
      {dueCount > 0 && (
        <div style={{ backgroundColor: 'var(--amberW)', border: '1px solid var(--amberB)', borderRadius: 8, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 20 }}>⚠</span>
          <div>
            <strong style={{ color: 'var(--amber)' }}>{dueCount} cheque{dueCount > 1 ? 's' : ''} due for deposit within 3 days</strong>
            <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2, opacity: 0.8 }}>Click "Due Today" tab to review</div>
          </div>
          <button onClick={() => setView('due')} style={{ marginLeft: 'auto', padding: '6px 16px', backgroundColor: 'var(--amber)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>View</button>
        </div>
      )}

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--bd)' }}>
        {([['received', 'Received'], ['issued', 'Issued'], ['due', `Due Soon (${dueCount})`], ['all', 'All']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '11px 22px', border: 'none', marginBottom: -2,
            borderBottom: view === v ? '3px solid var(--rust)' : '3px solid transparent',
            backgroundColor: 'transparent', color: view === v ? 'var(--t1)' : 'var(--t3)',
            fontWeight: view === v ? 700 : 500, cursor: 'pointer', fontSize: 14,
          }}>{label}</button>
        ))}
        <button onClick={() => setShowCreate(!showCreate)} style={{ marginLeft: 'auto', padding: '8px 18px', marginBottom: 4, backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {showCreate ? 'Cancel' : '+ Add PDC'}
        </button>
      </div>

      {pendingAmt > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--t2)' }}>
          Pending {view === 'received' ? 'to deposit' : 'to clear'}: <strong>{formatINR(pendingAmt)}</strong>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Record Post-Dated Cheque</h3>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div>
                <label className="fl">Type *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="fsel">
                  <option value="received">Received (from customer)</option>
                  <option value="issued">Issued (to vendor)</option>
                </select>
              </div>
              <div><label className="fl">Cheque No *</label><input type="text" value={form.cheque_no} onChange={(e) => setForm({ ...form, cheque_no: e.target.value })} required className="fi" /></div>
              <div><label className="fl">Bank Name *</label><input type="text" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} required className="fi" placeholder="Issuing bank" /></div>
              <div><label className="fl">Branch</label><input type="text" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className="fi" /></div>
              <div>
                <label className="fl">Amount (₹) *</label>
                <input type="number" step="0.01" min="0.01" value={numericInputValue(form.amount_paise)} onChange={(e) => setForm({ ...form, amount_paise: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} required className="fi" />
              </div>
              <div><label className="fl">Cheque Date *</label><input type="date" value={form.cheque_date} onChange={(e) => setForm({ ...form, cheque_date: e.target.value })} required className="fi" /></div>
              {form.type === 'received' ? (
                <div>
                  <label className="fl">Customer *</label>
                  <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required={form.type === 'received'} className="fsel">
                    <option value="">— Select customer —</option>
                    {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="fl">Vendor *</label>
                  <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })} required={form.type === 'issued'} className="fsel">
                    <option value="">— Select vendor —</option>
                    {vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}><label className="fl">Notes</label><input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="fi" placeholder="Optional notes" /></div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={createPdc.isPending} style={{ padding: '10px 24px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Save PDC</button>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '10px 20px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Status update inline */}
      {updatingId && (
        <div style={{ backgroundColor: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 8, padding: 16, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="fl">New Status for {updatingId}</label>
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="fsel">
              <option value="deposited">Deposited</option>
              <option value="cleared">Cleared</option>
              <option value="returned">Returned (bounced)</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button onClick={handleUpdateStatus} style={{ padding: '9px 18px', backgroundColor: 'var(--rust)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Update</button>
          <button onClick={() => setUpdatingId(null)} style={{ padding: '9px 14px', border: '1px solid var(--bd)', borderRadius: 4, backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}

      {/* PDC list */}
      {pdcs.length === 0 ? <p style={{ color: 'var(--t3)' }}>No PDCs found.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pdcs.map((pdc: any) => {
            const daysUntil = Math.ceil((new Date(pdc.cheque_date).getTime() - Date.now()) / 86400000);
            return (
              <div key={pdc.id} style={{ backgroundColor: 'var(--bg2)', border: `1px solid ${daysUntil <= 3 && pdc.status === 'pending' ? '#ffcc80' : 'var(--bd)'}`, borderRadius: 8, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{pdc.customer_name || pdc.vendor_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>Cheque #{pdc.cheque_no} · {pdc.bank_name}{pdc.branch ? ` (${pdc.branch})` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{formatINR(pdc.amount_paise)}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>Due: {pdc.cheque_date}</div>
                </div>
                {daysUntil <= 3 && daysUntil >= 0 && pdc.status === 'pending' && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', backgroundColor: 'var(--amberW)', padding: '2px 8px', borderRadius: 10 }}>
                    {daysUntil === 0 ? 'Due TODAY' : `Due in ${daysUntil}d`}
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, backgroundColor: STATUS_COLORS[pdc.status] + '22', color: STATUS_COLORS[pdc.status], textTransform: 'capitalize' }}>
                  {pdc.status}
                </span>
                {pdc.status === 'pending' && (
                  <button onClick={() => setUpdatingId(pdc.id)} style={{ padding: '5px 12px', fontSize: 12, border: '1px solid var(--bd)', borderRadius: 5, backgroundColor: 'var(--bg1)', cursor: 'pointer' }}>Update Status</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
